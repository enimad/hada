import { NextRequest, NextResponse } from "next/server";
import { env, validateServerEnv } from "@/lib/env";
import { buildPlannerSystemPrompt, buildSearchAnnouncementPrompt } from "@/lib/prompts";
import {
  bootstrapConversationIfNeeded,
  buildPlannerContext,
  buildRetrySearchPayload,
  buildSearchCta,
  createSearchResultsForUser,
  extractConversationForModel,
  getMostRecentRetryableSearch,
  getSearchQuotaStatus,
  getVendorCategoryLabel,
  insertConversationMessage,
  normalizeSearchCategory,
  type SearchReadyPayload
} from "@/lib/server/hada";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage, VendorCategory, WeddingProfile } from "@/lib/types";

type MistralMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type HadaState = {
  status: "clarify" | "ready";
  intent: "advice" | "search_collect" | "search_ready" | "profile_update" | "profile_update_confirm" | "contact_email" | "smalltalk";
  category: VendorCategory | null;
  location: string | null;
  style: string | null;
  constraints: string | null;
  budget: string | null;
  searchQuery: string | null;
  profileUpdate: ProfileUpdatePatch | null;
};

type PendingSearchIntake = HadaState & {
  messageId: string;
  metadata: Record<string, unknown>;
  initialMessage: string | null;
  exchanges: number;
};

type ProfileUpdatePatch = {
  wedding_date: string | null;
  city: string | null;
  region: string | null;
  guest_count: number | null;
  budget_min: number | null;
  budget_max: number | null;
};

type PendingProfileUpdate = {
  messageId: string;
  metadata: Record<string, unknown>;
  patch: ProfileUpdatePatch;
};

export async function GET(request: NextRequest) {
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const { conversation, messages } = await bootstrapConversationIfNeeded(supabase, user.id, profile);

    return NextResponse.json({
      conversationId: conversation.id,
      messages,
      profile
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await request.json();
    const isRetrySearch = body.action === "retry_search";
    const content = isRetrySearch ? "Relance la recherche avec des critères élargis." : typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const { conversation, messages: seededMessages } = await bootstrapConversationIfNeeded(supabase, user.id, profile);

    const userMessage = await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "user",
      content
    });

    if (isRetrySearch) {
      const retrySearch = await getMostRecentRetryableSearch(supabase, user.id);
      if (!retrySearch) {
        const assistantMessage = await insertConversationMessage(supabase, {
          conversationId: conversation.id,
          role: "assistant",
          content: "Je n'ai pas retrouvé la recherche à relancer. Envoyez-moi simplement le prestataire souhaité et je repars proprement."
        });

        return NextResponse.json({
          conversationId: conversation.id,
          assistantMessage,
          message: assistantMessage.content,
          action: null,
          categorie: null,
          redirect_path: null,
          searchResultsCount: 0
        });
      }

      return performSearchWorkflow({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        search: buildRetrySearchPayload(retrySearch, profile),
        options: {
          skipCache: true,
          expandedOnly: true
        },
        finalFallback: true
      });
    }

    const history = [...seededMessages, userMessage];
    const historyForModel = extractConversationForModel(history);
    const plannerContext = await buildPlannerContext(supabase, {
      userId: user.id,
      messages: history
    });
    const pendingIntake = await getPendingSearchIntake(supabase, conversation.id);
    const pendingProfileUpdate = await getPendingProfileUpdate(supabase, conversation.id);

    const pendingProfileResolution = await resolvePendingProfileUpdate({
      supabase,
      pendingProfileUpdate,
      conversationId: conversation.id,
      userId: user.id,
      userText: content
    });
    if (pendingProfileResolution && "response" in pendingProfileResolution) {
      return pendingProfileResolution.response;
    }
    const activePendingProfileUpdate = pendingProfileResolution && "clearForCurrentTurn" in pendingProfileResolution ? null : pendingProfileUpdate;

    const forceSearch = Boolean(pendingIntake && pendingIntake.exchanges >= 1 && !looksLikeAdviceRequest(content));
    const mistralText = await runMistralChat({
      systemPrompt: buildPlannerSystemPrompt(profile, historyForModel, plannerContext),
      historyForModel,
      maxTokens: 1024,
      temperature: 0.35,
      extraUserInstruction: buildCollectionInstruction({ profile, pendingIntake, pendingProfileUpdate: activePendingProfileUpdate, userText: content, forceSearch })
    });

    if (!mistralText) {
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: "Je rencontre un souci temporaire pour répondre. Réessayez dans quelques instants."
      });

      return NextResponse.json({
        conversationId: conversation.id,
        assistantMessage,
        searchResultsCount: 0
      });
    }

    const parsed = parseHadaState(mistralText);
    const category = parsed.state.intent === "search_ready"
      ? parsed.state.category ??
        pendingIntake?.category ??
        normalizeSearchCategory(pendingIntake?.initialMessage) ??
        normalizeSearchCategory(content) ??
        inferCategoryFromHistory(history)
      : parsed.state.category;
    const shouldSearch = Boolean(category && parsed.state.intent === "search_ready" && parsed.state.status === "ready");

    const profilePatchFromSearch = shouldSearch ? inferProfilePatchFromSearchRequest(content, profile, { ...parsed.state, category }) : null;
    if (profilePatchFromSearch) {
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: buildProfileUpdateConfirmationMessage(profilePatchFromSearch),
        metadata: buildPendingProfileUpdateMetadata(profilePatchFromSearch)
      });

      return NextResponse.json({
        conversationId: conversation.id,
        assistantMessage,
        message: assistantMessage.content,
        action: null,
        categorie: category,
        redirect_path: null,
        searchResultsCount: 0
      });
    }

    if (!shouldSearch) {
      if (parsed.state.intent === "profile_update") {
        const appliedPatch = await applyProfileUpdatePatch(supabase, user.id, parsed.state.profileUpdate ?? pendingProfileUpdate?.patch ?? null);
        if (pendingProfileUpdate) {
          await clearAllPendingProfileUpdates(supabase, conversation.id, "completed");
        }

        const assistantMessage = await insertConversationMessage(supabase, {
          conversationId: conversation.id,
          role: "assistant",
          content: parsed.displayText || buildProfileUpdateAppliedMessage(appliedPatch ?? parsed.state.profileUpdate ?? pendingProfileUpdate?.patch ?? null),
          metadata: {
            profileUpdate: {
              status: appliedPatch ? "completed" : "empty",
              patch: appliedPatch
            }
          }
        });

        return NextResponse.json({
          conversationId: conversation.id,
          assistantMessage,
          message: assistantMessage.content,
          action: null,
          categorie: null,
          redirect_path: null,
          searchResultsCount: 0,
          profileUpdated: Boolean(appliedPatch),
          profileUpdate: appliedPatch
        });
      }

      const metadata = parsed.state.intent === "search_collect"
        ? buildPendingSearchMetadata({ ...parsed.state, category: category ?? null }, content, pendingIntake)
        : parsed.state.intent === "profile_update_confirm"
          ? buildPendingProfileUpdateMetadata(parsed.state.profileUpdate)
          : {};

      if (pendingProfileUpdate && parsed.state.intent !== "profile_update_confirm") {
        await clearAllPendingProfileUpdates(supabase, conversation.id, "declined");
      }

      const assistantContent =
        parsed.state.intent === "profile_update_confirm"
          ? parsed.displayText || buildProfileUpdateConfirmationMessage(parsed.state.profileUpdate)
          : parsed.displayText ||
            (await buildNaturalAssistantFallback({
              profile,
              historyForModel,
              userText: content,
              intent: parsed.state.intent
            })) ||
            buildEmptyAssistantFallback(parsed.state.intent);

      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: assistantContent,
        metadata
      });

      return NextResponse.json({
        conversationId: conversation.id,
        assistantMessage,
        message: assistantMessage.content,
        action: null,
        categorie: category,
        redirect_path: null,
        searchResultsCount: 0
      });
    }

    if (pendingIntake) {
      await clearPendingSearchIntake(supabase, pendingIntake);
    }

    const searchPayload = buildSearchPayloadFromState({ ...parsed.state, category }, content, profile, pendingIntake);
    const hasExistingCategoryResults = await hasExistingCandidatesForCategory(supabase, user.id, searchPayload.category);

    return performSearchWorkflow({
      supabase,
      userId: user.id,
      conversationId: conversation.id,
      profile,
      search: searchPayload,
      options: {
        skipCache: hasExistingCategoryResults || shouldBypassSearchCache(content, { ...parsed.state, category }, profile)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

async function performSearchWorkflow(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  conversationId: string;
  profile: Partial<WeddingProfile> | null;
  search: SearchReadyPayload;
  options?: {
    skipCache?: boolean;
    expandedOnly?: boolean;
  };
  finalFallback?: boolean;
}) {
  const quotaBeforeSearch = await getSearchQuotaStatus(input.supabase, input.userId);
  if (quotaBeforeSearch.isBlocked) {
    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: buildSearchQuotaBlockedMessage(quotaBeforeSearch.resetAt),
      metadata: {
        searchQuota: {
          limit: quotaBeforeSearch.limit,
          used: quotaBeforeSearch.used,
          remaining: quotaBeforeSearch.remaining,
          resetAt: quotaBeforeSearch.resetAt,
          isBlocked: true
        }
      }
    });

    return NextResponse.json({
      conversationId: input.conversationId,
      assistantMessage,
      message: assistantMessage.content,
      action: null,
      categorie: input.search.category,
      redirect_path: null,
      searchResultsCount: 0,
      searchQuota: quotaBeforeSearch
    });
  }

  const searchResults = await createSearchResultsForUser(input.supabase, {
    userId: input.userId,
    conversationId: input.conversationId,
    search: input.search,
    profile: input.profile,
    options: input.options
  });

  const hasResults = searchResults.candidates.length > 0;
  const categoryLabel = getVendorCategoryLabel(input.search.category, searchResults.candidates.length || 2);
  const announcement = await runMistralChat({
    systemPrompt: buildSearchAnnouncementPrompt({
      profile: input.profile,
      categoryLabel,
      count: searchResults.candidates.length,
      hasResults,
      isExternalFallback: !hasResults && input.finalFallback
    }),
    historyForModel: [],
    maxTokens: 360,
    temperature: 0.55
  });
  const quotaAfterSearch = await getSearchQuotaStatus(input.supabase, input.userId);
  const content = [announcement?.trim() || fallbackAnnouncement(hasResults, categoryLabel), buildSearchQuotaFollowUpMessage(quotaAfterSearch)]
    .filter(Boolean)
    .join("\n\n");

  const metadata = hasResults
    ? buildSearchCta(input.search.category)
    : buildExternalSearchCta(searchResults.externalSearchUrl, Boolean(input.finalFallback));
  const assistantMessage = await insertConversationMessage(input.supabase, {
    conversationId: input.conversationId,
    role: "assistant",
    content,
    metadata: {
      ...metadata,
      searchQuota: {
        limit: quotaAfterSearch.limit,
        used: quotaAfterSearch.used,
        remaining: quotaAfterSearch.remaining,
        resetAt: quotaAfterSearch.resetAt,
        isBlocked: quotaAfterSearch.isBlocked
      }
    }
  });

  return NextResponse.json({
    conversationId: input.conversationId,
    assistantMessage,
    message: assistantMessage.content,
    action: metadata.action ?? null,
    categorie: metadata.categorie ?? null,
    redirect_path: metadata.redirect_path ?? null,
    searchResultsCount: searchResults.candidates.length,
    searchQuota: quotaAfterSearch
  });
}

async function getPendingSearchIntake(supabase: ReturnType<typeof createSupabaseServerClient>, conversationId: string): Promise<PendingSearchIntake | null> {
  const { data } = await supabase
    .from("messages")
    .select("id, metadata_json")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(12);

  for (const message of data ?? []) {
    const metadata = (message.metadata_json ?? {}) as Record<string, unknown>;
    const pending = metadata.pendingSearch;
    if (!pending || typeof pending !== "object") continue;

    const value = pending as Record<string, unknown>;
    if (value.status !== "clarify") continue;

    return {
      messageId: message.id,
      metadata,
      status: "clarify",
      intent: "search_collect",
      category: normalizeSearchCategory(readString(value.category)),
      location: readString(value.location),
      style: readString(value.style),
      constraints: readString(value.constraints),
      budget: readString(value.budget),
      searchQuery: readString(value.searchQuery),
      profileUpdate: null,
      initialMessage: readString(value.initialMessage),
      exchanges: typeof value.exchanges === "number" ? value.exchanges : 1
    };
  }

  return null;
}

async function getPendingProfileUpdate(supabase: ReturnType<typeof createSupabaseServerClient>, conversationId: string): Promise<PendingProfileUpdate | null> {
  const { data } = await supabase
    .from("messages")
    .select("id, metadata_json")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(12);

  for (const message of data ?? []) {
    const metadata = (message.metadata_json ?? {}) as Record<string, unknown>;
    const pending = metadata.pendingProfileUpdate;
    if (!pending || typeof pending !== "object") continue;

    const value = pending as Record<string, unknown>;
    if (value.status !== "confirm") return null;

    const patch = sanitizeProfileUpdatePatch(value.patch);
    if (!patch) return null;

    return {
      messageId: message.id,
      metadata,
      patch
    };
  }

  return null;
}

async function hasExistingCandidatesForCategory(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  category: VendorCategory
) {
  const { data: requests } = await supabase
    .from("vendor_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("vendor_category", category)
    .limit(50);

  const requestIds = (requests ?? []).map((request) => request.id);
  if (requestIds.length === 0) return false;

  const { data: candidates } = await supabase
    .from("vendor_candidates")
    .select("id")
    .in("vendor_request_id", requestIds)
    .eq("category", category)
    .limit(1);

  return Boolean(candidates?.length);
}

function buildPendingProfileUpdateMetadata(rawPatch: ProfileUpdatePatch | null) {
  const patch = sanitizeProfileUpdatePatch(rawPatch);
  if (!patch) return {};

  return {
    pendingProfileUpdate: {
      status: "confirm",
      patch
    }
  };
}

async function clearPendingProfileUpdate(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  pending: PendingProfileUpdate,
  status: "completed" | "declined"
) {
  await supabase
    .from("messages")
    .update({
      metadata_json: {
        ...pending.metadata,
        pendingProfileUpdate: {
          ...((pending.metadata.pendingProfileUpdate as Record<string, unknown> | undefined) ?? {}),
          status
        }
      }
    })
    .eq("id", pending.messageId);
}

async function clearAllPendingProfileUpdates(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  conversationId: string,
  status: "completed" | "declined"
) {
  const { data } = await supabase
    .from("messages")
    .select("id, metadata_json")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(24);

  await Promise.all(
    (data ?? [])
      .map((message) => {
        const metadata = (message.metadata_json ?? {}) as Record<string, unknown>;
        const pending = metadata.pendingProfileUpdate;
        if (!pending || typeof pending !== "object") return null;

        const pendingValue = pending as Record<string, unknown>;
        if (pendingValue.status !== "confirm") return null;

        return supabase
          .from("messages")
          .update({
            metadata_json: {
              ...metadata,
              pendingProfileUpdate: {
                ...pendingValue,
                status
              }
            }
          })
          .eq("id", message.id);
      })
      .filter(Boolean)
  );
}

async function applyProfileUpdatePatch(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  rawPatch: ProfileUpdatePatch | null
) {
  const patch = sanitizeProfileUpdatePatch(rawPatch);
  if (!patch) return null;

  const update = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null && value !== undefined)
  ) as Partial<Pick<WeddingProfile, "wedding_date" | "city" | "region" | "guest_count" | "budget_min" | "budget_max">>;

  if (Object.keys(update).length === 0) return null;

  const { data: current } = await supabase.from("wedding_profiles").select("*").eq("user_id", userId).maybeSingle();
  const merged = {
    ...(current ?? {}),
    ...update,
    user_id: userId,
    country: current?.country ?? "France"
  };

  const payload = {
    ...update,
    user_id: userId,
    country: merged.country,
    profile_completion_score: computeProfileCompletionScore(merged)
  };

  const { error } = current
    ? await supabase.from("wedding_profiles").update(payload).eq("user_id", userId)
    : await supabase.from("wedding_profiles").upsert(payload, { onConflict: "user_id" });

  if (error) throw new Error(error.message);

  return sanitizeProfileUpdatePatch({
    wedding_date: null,
    city: null,
    region: null,
    guest_count: null,
    budget_min: null,
    budget_max: null,
    ...update
  });
}

async function resolvePendingProfileUpdate(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  pendingProfileUpdate: PendingProfileUpdate | null;
  conversationId: string;
  userId: string;
  userText: string;
}): Promise<{ response: NextResponse } | { clearForCurrentTurn: true } | null> {
  if (!input.pendingProfileUpdate) return null;

  if (looksLikeAffirmative(input.userText)) {
    const appliedPatch = await applyProfileUpdatePatch(input.supabase, input.userId, input.pendingProfileUpdate.patch);
    await clearAllPendingProfileUpdates(input.supabase, input.conversationId, "completed");

    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: buildProfileUpdateAppliedMessage(appliedPatch ?? input.pendingProfileUpdate.patch),
      metadata: {
        profileUpdate: {
          status: appliedPatch ? "completed" : "empty",
          patch: appliedPatch ?? input.pendingProfileUpdate.patch
        }
      }
    });

    return {
      response: NextResponse.json({
        conversationId: input.conversationId,
        assistantMessage,
        message: assistantMessage.content,
        action: null,
        categorie: null,
        redirect_path: null,
        searchResultsCount: 0,
        profileUpdated: Boolean(appliedPatch),
        profileUpdate: appliedPatch
      })
    };
  }

  if (looksLikeNegative(input.userText)) {
    await clearAllPendingProfileUpdates(input.supabase, input.conversationId, "declined");

    if (hasFollowUpAfterProfileDecision(input.userText)) {
      return { clearForCurrentTurn: true };
    }

    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: "C'est noté, je garde votre profil tel quel. Dites-moi ce que vous souhaitez faire ensuite et je m'adapte."
    });

    return {
      response: NextResponse.json({
        conversationId: input.conversationId,
        assistantMessage,
        message: assistantMessage.content,
        action: null,
        categorie: null,
        redirect_path: null,
        searchResultsCount: 0
      })
    };
  }

  await clearAllPendingProfileUpdates(input.supabase, input.conversationId, "declined");
  return { clearForCurrentTurn: true };
}

function buildProfileUpdateConfirmationMessage(patch: ProfileUpdatePatch | null) {
  const details = formatProfileUpdatePatch(patch);
  return details
    ? `Je vois une différence avec votre profil : ${details}. Souhaitez-vous que je mette votre profil à jour avant de continuer ?`
    : "Je vois une information différente de votre profil. Souhaitez-vous que je mette votre profil à jour avant de continuer ?";
}

function buildProfileUpdateAppliedMessage(patch: ProfileUpdatePatch | null) {
  const details = formatProfileUpdatePatch(patch);
  return details
    ? `C'est bien pris en compte, votre profil est à jour : ${details}.`
    : "C'est bien pris en compte, votre profil est à jour.";
}

function buildEmptyAssistantFallback(intent: HadaState["intent"]) {
  if (intent === "profile_update_confirm") {
    return "Je vois une information différente de votre profil. Souhaitez-vous que je mette votre profil à jour avant de continuer ?";
  }

  if (intent === "profile_update") {
    return "C'est bien pris en compte, votre profil est à jour.";
  }

  if (intent === "search_collect") {
    return "Je vous suis. Donnez-moi juste l'envie principale pour cette recherche, et je m'en occupe.";
  }

  return "Je vous ai lue, mais ma réponse s'est perdue en route. Reformulez-moi ça en une phrase et je reprends avec vous.";
}

async function buildNaturalAssistantFallback(input: {
  profile: Partial<WeddingProfile> | null;
  historyForModel: ChatMessage[];
  userText: string;
  intent: HadaState["intent"];
}) {
  if (input.intent === "profile_update" || input.intent === "profile_update_confirm" || input.intent === "search_collect" || input.intent === "search_ready") {
    return null;
  }

  return runMistralChat({
    systemPrompt: [
      "Tu es Hada, une wedding planner française chaleureuse, vive et rassurante.",
      "Réponds au dernier message du couple en 1 à 3 phrases, uniquement en français.",
      "Ne lance aucune recherche, ne mets pas le profil à jour, ne produis pas de JSON ni de balise technique.",
      "Si le sujet est hors mariage, réponds naturellement et brièvement, avec tact, puis recentre doucement si utile.",
      "Ne réponds jamais par une formule générique comme \"Je suis là, dites-moi ce que vous souhaitez faire et je m'adapte\".",
      `Profil couple : ${JSON.stringify(buildProfileBrief(input.profile))}`
    ].join("\n"),
    historyForModel: input.historyForModel,
    maxTokens: 300,
    temperature: 0.55,
    extraUserInstruction: `Dernier message du couple : ${input.userText}`
  });
}

function formatProfileUpdatePatch(patch: ProfileUpdatePatch | null) {
  const cleanPatch = sanitizeProfileUpdatePatch(patch);
  if (!cleanPatch) return null;

  const parts = [
    cleanPatch.wedding_date ? `date du mariage ${cleanPatch.wedding_date}` : null,
    cleanPatch.city ? `lieu visé ${cleanPatch.city}${cleanPatch.region ? ` (${cleanPatch.region})` : ""}` : cleanPatch.region ? `région ${cleanPatch.region}` : null,
    cleanPatch.guest_count ? `${cleanPatch.guest_count} invités` : null,
    cleanPatch.budget_max ? `budget ${cleanPatch.budget_max.toLocaleString("fr-FR")} €` : cleanPatch.budget_min ? `budget minimum ${cleanPatch.budget_min.toLocaleString("fr-FR")} €` : null
  ].filter(Boolean);

  return parts.join(", ") || null;
}

function looksLikeAffirmative(value: string) {
  const normalized = normalizeText(value);
  return /^(oui|yes|ok|okay|vas y|go|confirme|exact|c est ca|c'est ca|tout a fait|bien sur|d accord|daccord|valide)\b/.test(normalized);
}

function looksLikeNegative(value: string) {
  const normalized = normalizeText(value);
  return /^(non|no|pas maintenant|laisse|annule|garde|ne change pas|pas besoin)\b/.test(normalized);
}

function hasFollowUpAfterProfileDecision(value: string) {
  const normalized = normalizeText(value);
  return /\b(et|puis|sinon|maintenant|aussi|dis|explique|cherche|trouve|conseille|pourquoi|quoi|comment)\b/.test(normalized) || normalized.includes("?");
}

function buildSearchQuotaFollowUpMessage(quota: Awaited<ReturnType<typeof getSearchQuotaStatus>>) {
  if (quota.remaining === 1) {
    return "Petit rappel bêta : je peux lancer 2 recherches de prestataires toutes les 48h. Il vous reste encore une recherche à tester, choisissez la prochaine pépite avec malice ✨";
  }

  if (quota.remaining === 0) {
    return `Vous avez utilisé vos 2 recherches bêta pour cette fenêtre de 48h. Revenez ${formatQuotaReset(quota.resetAt)} et je repars en chasse avec plaisir 🔎✨`;
  }

  return null;
}

function buildSearchQuotaBlockedMessage(resetAt: string | null) {
  return `Vos 2 recherches bêta des dernières 48h sont déjà utilisées. Revenez ${formatQuotaReset(resetAt)} et je relancerai la chasse aux prestataires avec toute mon énergie 🔎✨`;
}

function formatQuotaReset(resetAt: string | null) {
  if (!resetAt) return "dans 48h";

  const resetDate = new Date(resetAt);
  if (Number.isNaN(resetDate.getTime())) return "dans 48h";

  const diffMs = Math.max(resetDate.getTime() - Date.now(), 0);
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const relative = hours > 0 ? `dans ${hours}h${minutes ? ` ${minutes}min` : ""}` : `dans ${minutes || 1}min`;
  const absolute = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  }).format(resetDate);

  return `${relative} (${absolute})`;
}

function buildCollectionInstruction(input: {
  profile: Partial<WeddingProfile> | null;
  pendingIntake: PendingSearchIntake | null;
  pendingProfileUpdate: PendingProfileUpdate | null;
  userText: string;
  forceSearch: boolean;
}) {
  return [
    "Contexte serveur pour Hada.",
    `Profil couple JSON : ${JSON.stringify(buildProfileBrief(input.profile))}`,
    `Collecte en cours JSON : ${JSON.stringify(input.pendingIntake ? toPendingBrief(input.pendingIntake) : null)}`,
    `Mise a jour profil en attente JSON : ${JSON.stringify(input.pendingProfileUpdate?.patch ?? null)}`,
    `forceSearch: ${input.forceSearch}`,
    `Dernier message couple : ${input.userText}`,
    input.forceSearch
      ? "Tu dois répondre avec intent search_ready et status ready dans HADA_STATE, annoncer naturellement que tu lances la recherche, et ne poser aucune question."
      : "Décide d'abord l'intention réelle du couple. S'il demande de modifier le profil mariage, réponds avec intent profile_update et renseigne profile_update. Si une mise à jour profil est en attente et que le couple confirme, réponds avec intent profile_update et reprends les champs en attente. Si une info contredit le profil sans demande claire de mise à jour, réponds avec intent profile_update_confirm. S'il demande un conseil, une explication, une comparaison ou de l'aide à choisir sans demander explicitement de chercher des prestataires, réponds en conseil avec intent advice et ne lance pas de recherche. S'il demande explicitement de trouver/chercher/dénicher/proposer des prestataires, collecte ou lance la recherche selon le contexte.",
    "Ne présente aucun prestataire dans le chat."
  ].join("\n");
}

function parseHadaState(content: string): { displayText: string; state: HadaState } {
  const match = content.match(/HADA_STATE::(\{[\s\S]*\})\s*$/);
  const emptyState: HadaState = {
    status: "clarify",
    intent: "advice",
    category: null,
    location: null,
    style: null,
    constraints: null,
    budget: null,
    searchQuery: null,
    profileUpdate: null
  };

  if (!match?.[1]) {
    return { displayText: content.trim(), state: emptyState };
  }

  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    return {
      displayText: content.replace(match[0], "").trim(),
      state: {
        status: raw.status === "ready" ? "ready" : "clarify",
        intent: normalizeIntent(readString(raw.intent), raw.status === "ready" ? "search_ready" : "advice"),
        category: normalizeSearchCategory(readString(raw.category)),
        location: readString(raw.location),
        style: readString(raw.style),
        constraints: readString(raw.constraints),
        budget: readString(raw.budget),
        searchQuery: readString(raw.search_query) ?? readString(raw.searchQuery),
        profileUpdate: sanitizeProfileUpdatePatch(raw.profile_update ?? raw.profileUpdate)
      }
    };
  } catch {
    return { displayText: content.replace(match[0], "").trim(), state: emptyState };
  }
}

function buildPendingSearchMetadata(state: HadaState, userText: string, pending: PendingSearchIntake | null) {
  return {
    pendingSearch: {
      status: "clarify",
      intent: "search_collect",
      category: state.category ?? pending?.category ?? null,
      location: state.location ?? pending?.location ?? null,
      style: state.style ?? pending?.style ?? null,
      constraints: state.constraints ?? pending?.constraints ?? null,
      budget: state.budget ?? pending?.budget ?? null,
      searchQuery: state.searchQuery ?? pending?.searchQuery ?? null,
      initialMessage: pending?.initialMessage ?? userText,
      exchanges: (pending?.exchanges ?? 0) + 1
    }
  };
}

function normalizeIntent(value: string | null, fallback: HadaState["intent"]): HadaState["intent"] {
  if (
    value === "advice" ||
    value === "search_collect" ||
    value === "search_ready" ||
    value === "profile_update" ||
    value === "profile_update_confirm" ||
    value === "contact_email" ||
    value === "smalltalk"
  ) {
    return value;
  }
  return fallback;
}

async function clearPendingSearchIntake(supabase: ReturnType<typeof createSupabaseServerClient>, pending: PendingSearchIntake) {
  await supabase
    .from("messages")
    .update({
      metadata_json: {
        ...pending.metadata,
        pendingSearch: {
          ...((pending.metadata.pendingSearch as Record<string, unknown> | undefined) ?? {}),
          status: "completed"
        }
      }
    })
    .eq("id", pending.messageId);
}

function buildSearchPayloadFromState(
  state: HadaState,
  userText: string,
  profile: Partial<WeddingProfile> | null,
  pending: PendingSearchIntake | null
): SearchReadyPayload {
  const category = state.category ?? pending?.category ?? "venue";
  const location =
    state.location ??
    pending?.location ??
    extractRequestedLocationFromText([pending?.initialMessage, userText].filter(Boolean).join(" ")) ??
    extractLocationFromSearchQuery(state.searchQuery ?? pending?.searchQuery ?? null) ??
    profile?.city ??
    profile?.region ??
    profile?.country ??
    null;
  const style = state.style ?? pending?.style ?? null;
  const constraints = state.constraints ?? pending?.constraints ?? null;
  const budget = state.budget ?? pending?.budget ?? null;

  return {
    category,
    location,
    style,
    constraints,
    budget,
    searchQuery: ensureWeddingSearchQuery(state.searchQuery ?? pending?.searchQuery ?? null, {
      category,
      location,
      style,
      constraints,
      userText: [pending?.initialMessage, userText].filter(Boolean).join(" ")
    })
  };
}

function shouldBypassSearchCache(userText: string, state: HadaState, profile: Partial<WeddingProfile> | null) {
  const normalized = normalizeText(userText);
  if (/(nouveau|nouveaux|nouvelle|nouvelles|autre|autres|encore|plus de|relance|relancer|different|differents|differente|differentes)/.test(normalized)) {
    return true;
  }

  const requestedLocation = normalizeProfileText(state.location ?? extractRequestedLocationFromText(userText));
  const profileLocation = normalizeProfileText(profile?.city ?? profile?.region ?? null);
  if (requestedLocation && profileLocation && normalizeText(requestedLocation) !== normalizeText(profileLocation)) {
    return true;
  }

  return false;
}

function inferProfilePatchFromSearchRequest(
  userText: string,
  profile: Partial<WeddingProfile> | null,
  state: HadaState
): ProfileUpdatePatch | null {
  const normalized = normalizeText(userText);
  if (/sans modifier|ne modifie pas|pas mon profil|sans mettre a jour/.test(normalized)) return null;

  const patch: ProfileUpdatePatch = {
    wedding_date: null,
    city: null,
    region: null,
    guest_count: null,
    budget_min: null,
    budget_max: null
  };

  const requestedLocation = normalizeProfileText(extractRequestedLocationFromText(userText));
  const profileLocation = normalizeProfileText(profile?.city ?? profile?.region ?? null);
  if (requestedLocation && profileLocation && normalizeText(requestedLocation) !== normalizeText(profileLocation)) {
    patch.city = requestedLocation;
  }

  const requestedGuests = extractGuestCountFromText(userText);
  if (requestedGuests && requestedGuests !== profile?.guest_count) {
    patch.guest_count = requestedGuests;
  }

  const requestedBudget = extractBudgetFromText(userText);
  const profileBudget = profile?.budget_max ?? profile?.budget_min ?? null;
  if (requestedBudget && requestedBudget !== profileBudget) {
    patch.budget_max = requestedBudget;
  }

  const requestedDate = extractWeddingDateFromText(userText);
  if (requestedDate && requestedDate !== profile?.wedding_date) {
    patch.wedding_date = requestedDate;
  }

  return sanitizeProfileUpdatePatch(patch);
}

function extractGuestCountFromText(value: string) {
  const normalized = normalizeText(value);
  const explicit = normalized.match(/(\d{1,4})\s*(invites|invitees|personnes|convives)/);
  const loose = normalized.match(/\bpour\s+(\d{1,4})\b/);
  const raw = explicit?.[1] ?? loose?.[1];
  if (!raw) return null;
  const guests = Number(raw);
  return Number.isInteger(guests) && guests > 0 && guests <= 10000 ? guests : null;
}

function extractBudgetFromText(value: string) {
  const normalized = normalizeText(value);
  if (!/(budget|euros?|eur|€)/.test(normalized)) return null;
  const match = normalized.match(/(\d{1,3}(?:[\s.]?\d{3})+|\d{2,6})\s*(k|€|eur|euros?)?/);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(/[^\d]/g, "")) * (match[2] === "k" ? 1000 : 1);
  return Number.isInteger(amount) && amount > 0 && amount <= 1000000 ? amount : null;
}

function extractWeddingDateFromText(value: string) {
  const normalized = normalizeText(value);
  const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return normalizeIsoDate(`${iso[1]}-${iso[2]}-${iso[3]}`);

  const slash = normalized.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
  if (slash) return normalizeIsoDate(`${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`);

  const monthMatch = normalized.match(/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(20\d{2})\b/);
  if (!monthMatch) return null;

  const monthIndex = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre"
  ].indexOf(monthMatch[1]);

  if (monthIndex === -1) return null;
  return normalizeIsoDate(`${monthMatch[2]}-${String(monthIndex + 1).padStart(2, "0")}-01`);
}

function extractRequestedLocationFromText(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:a|à|sur|vers|près de|pres de|proche de|autour de)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,45})(?=$|[,.?!])/,
    /\b(?:en|dans la|dans le)\s+(région\s+[A-Za-zÀ-ÿ' -]{3,45}|[A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,45})(?=$|[,.?!])/
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const location = match?.[1]?.trim();
    if (!location) continue;
    if (/^(un|une|le|la|les|mon|ma|mes|ton|ta|tes|notre|votre|jour|profil|lieu|traiteur|photographe|prestataire)$/i.test(location)) {
      continue;
    }
    return location.slice(0, 80);
  }

  return null;
}

function ensureWeddingSearchQuery(
  query: string | null,
  input: {
    category: VendorCategory;
    location: string | null;
    style: string | null;
    constraints: string | null;
    userText: string;
  }
) {
  if (input.category === "musician") {
    return ["groupe", buildMusicStyleKeywords([query, input.style, input.constraints, input.userText].filter(Boolean).join(" ")), "mariage", input.location, "chanteur live"]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  const fallback = [categoryToSearchLabel(input.category), "mariage", input.location, input.style, input.constraints, input.userText]
    .filter(Boolean)
    .join(" ");
  const nextQuery = query && /\bmariage\b/i.test(query) ? query : fallback;
  return nextQuery.replace(/\s+/g, " ").trim().slice(0, 180);
}

function extractLocationFromSearchQuery(query: string | null) {
  if (!query) return null;
  const normalized = query.replace(/\s+/g, " ").trim();
  const match = normalized.match(/\bmariage\s+([\p{Lu}][\p{L}' -]{2,40})(?:\s|$)/u);
  return match?.[1]?.trim() ?? null;
}

function buildMusicStyleKeywords(value: string) {
  const normalized = normalizeText(value);
  if (/jazz|jazzy/.test(normalized)) return "jazz acoustique standards";
  if (/acoustique|unplugged/.test(normalized)) return "acoustique live unplugged";
  if (/classique|quatuor|quartet/.test(normalized)) return "classique orchestre ceremonie";
  if (/pop/.test(normalized)) return "pop live reprises";
  if (/soul|funk/.test(normalized)) return "soul funk live";
  if (/electro/.test(normalized)) return "electro DJ mix";
  return "musique live";
}

function buildExternalSearchCta(url?: string, finalFallback = false) {
  const redirectPath = url ?? "https://www.google.com/search?q=prestataire%20mariage";
  return {
    action: finalFallback ? "external_google_search" : "retry_search",
    categorie: null,
    redirect_path: redirectPath,
    ctaHref: redirectPath,
    ctaLabel: finalFallback ? "Ouvrir la recherche Google →" : "Pousser la recherche →"
  };
}

function looksLikeAdviceRequest(value: string) {
  const normalized = normalizeText(value);
  return /(conseil|conseils|comment choisir|aide moi a choisir|aidez moi a choisir|difference|comparer|avis sur|que dois je|quoi regarder|criteres|pieges|questions a poser)/.test(normalized);
}

function inferCategoryFromHistory(messages: ChatMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const category = normalizeSearchCategory(message.content);
    if (category) return category;
  }

  return null;
}

function fallbackAnnouncement(hasResults: boolean, categoryLabel: string) {
  return hasResults
    ? `J'ai trouvé des ${categoryLabel} prometteurs et les fiches sont prêtes. Cliquez sur le bouton juste en dessous pour les découvrir.`
    : "Je n'ai rien trouvé d'assez fiable pour créer une fiche propre, mais je vous ai préparé une recherche ciblée à ouvrir juste en dessous.";
}

function buildProfileBrief(profile: Partial<WeddingProfile> | null) {
  return {
    prenoms: [profile?.partner_one_name, profile?.partner_two_name].filter(Boolean).join(" & ") || null,
    date_mariage: profile?.wedding_date ?? profile?.wedding_period_text ?? null,
    lieu_mariage: profile?.city ?? profile?.region ?? profile?.country ?? null,
    budget_global: profile?.budget_max ?? profile?.budget_min ?? null,
    nombre_invites: profile?.guest_count ?? null
  };
}

function computeProfileCompletionScore(payload: Partial<WeddingProfile> & { user_id?: string }) {
  const trackedFields = [
    payload.partner_one_name,
    payload.partner_two_name,
    payload.wedding_date ?? payload.wedding_period_text,
    payload.city,
    payload.guest_count,
    payload.budget_min ?? payload.budget_max,
    payload.style,
    payload.ceremony_type
  ];

  const completed = trackedFields.filter(Boolean).length;
  return Math.round((completed / trackedFields.length) * 100);
}

function sanitizeProfileUpdatePatch(value: unknown): ProfileUpdatePatch | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const patch: ProfileUpdatePatch = {
    wedding_date: normalizeIsoDate(readString(raw.wedding_date) ?? readString(raw.weddingDate)),
    city: normalizeProfileText(readString(raw.city)),
    region: normalizeProfileText(readString(raw.region)),
    guest_count: normalizePositiveInteger(raw.guest_count ?? raw.guestCount, 10000),
    budget_min: normalizePositiveInteger(raw.budget_min ?? raw.budgetMin, 1000000),
    budget_max: normalizePositiveInteger(raw.budget_max ?? raw.budgetMax, 1000000)
  };

  if (patch.city && normalizeText(patch.city).includes("region parisienne") && !patch.region) {
    patch.region = "Île-de-France";
  }

  if (patch.budget_min && patch.budget_max && patch.budget_min > patch.budget_max) {
    const min = patch.budget_max;
    patch.budget_max = patch.budget_min;
    patch.budget_min = min;
  }

  return Object.values(patch).some((field) => field !== null) ? patch : null;
}

function normalizeProfileText(value: string | null) {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().slice(0, 140) || null;
}

function normalizeIsoDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function normalizePositiveInteger(value: unknown, max: number) {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : NaN;
  if (!Number.isInteger(raw) || raw <= 0 || raw > max) return null;
  return raw;
}

function toPendingBrief(pending: PendingSearchIntake) {
  return {
    category: pending.category,
    location: pending.location,
    style: pending.style,
    constraints: pending.constraints,
    budget: pending.budget,
    initialMessage: pending.initialMessage,
    exchanges: pending.exchanges
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function categoryToSearchLabel(category: VendorCategory) {
  switch (category) {
    case "venue":
      return "lieu réception";
    case "caterer":
      return "traiteur";
    case "photographer":
      return "photographe";
    case "videographer":
      return "vidéaste";
    case "dj":
      return "DJ";
    case "musician":
      return "groupe musique live";
    case "flowers":
      return "fleuriste";
    case "decor":
      return "décoration";
    case "dress":
      return "robe de mariée";
    case "suit":
      return "costume mariage";
    case "transport":
      return "transport mariage";
  }
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function runMistralChat(input: {
  systemPrompt: string;
  historyForModel: ChatMessage[];
  maxTokens: number;
  temperature: number;
  extraUserInstruction?: string;
}) {
  const messages: MistralMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.historyForModel.slice(-12).map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  if (input.extraUserInstruction) {
    messages.push({
      role: "user",
      content: input.extraUserInstruction
    });
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.mistralApiKey}`
    },
    body: JSON.stringify({
      model: env.mistralModel,
      temperature: input.temperature,
      max_tokens: Math.max(input.maxTokens, 1024),
      messages
    })
  });

  if (!response.ok) {
    console.error("Mistral chat failed", response.status, await response.text());
    return null;
  }

  const result = await response.json();
  return result?.choices?.[0]?.message?.content?.trim() ?? null;
}

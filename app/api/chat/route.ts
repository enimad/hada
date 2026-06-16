import { NextRequest, NextResponse } from "next/server";
import { getBudgetAllocationForVendorCategory } from "@/lib/budget";
import { env, validateServerEnv } from "@/lib/env";
import { extractHadaState } from "@/lib/hada-state";
import { buildPlannerSystemPrompt, buildSearchAnnouncementPrompt, type PlannerContext } from "@/lib/prompts";
import { applyWeddingChecklistPatch, getWeddingChecklistLabels, normalizeWeddingChecklist } from "@/lib/wedding-checklist";
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
import type { ChatMessage, VendorCategory, WeddingChecklistPatch, WeddingProfile } from "@/lib/types";

type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AiProvider = "google" | "mistral";
type AiTask = "planner" | "profile_update_detection" | "recovery" | "announcement";

type HadaState = {
  status: "clarify" | "ready";
  category: VendorCategory | null;
  style: string | null;
  constraints: string | null;
  budget: string | null;
  searchQuery: string | null;
};

type PendingSearchIntake = HadaState & {
  messageId: string;
  metadata: Record<string, unknown>;
  initialMessage: string | null;
  exchanges: number;
};

type ProfileUpdatePatch = {
  wedding_date?: string | null;
  wedding_period_text?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  guest_count?: number | null;
  budget_max?: number | null;
  wedding_checklist?: WeddingChecklistPatch | null;
};

type PendingProfileUpdate = {
  messageId: string;
  metadata: Record<string, unknown>;
  patch: ProfileUpdatePatch;
  summary: string;
  searchState: HadaState | null;
  initialSearchMessage: string | null;
};

type ProfileUpdateDetection = {
  patch: ProfileUpdatePatch;
  summary: string;
};

type ResolvedSearchIntent = {
  hasSearchIntent: boolean;
  category: VendorCategory | null;
  isLaunchFollowUp: boolean;
  isContextualSearchReply: boolean;
  sourceText: string;
};

type SearchConversationContext = {
  category: VendorCategory | null;
  sourceText: string;
  hasClarifyingQuestion: boolean;
  hasGenericSearchQuestion: boolean;
};

let weddingChecklistColumnAvailable: boolean | null = null;
let nextMistralRequestAt = 0;
let mistralStartQueue: Promise<void> = Promise.resolve();
let nextGoogleRequestAt = 0;
let googleStartQueue: Promise<void> = Promise.resolve();

const MISTRAL_MIN_REQUEST_INTERVAL_MS = 650;
const MISTRAL_RATE_LIMIT_RETRY_MS = 1400;
const GOOGLE_MIN_REQUEST_INTERVAL_MS = 500;
const GOOGLE_RATE_LIMIT_RETRY_MS = 1100;

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

    const pendingProfileUpdate = await getPendingProfileUpdate(supabase, conversation.id);
    if (pendingProfileUpdate) {
      return handlePendingProfileUpdate({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        userReply: content,
        pending: pendingProfileUpdate
      });
    }

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
    const pendingIntake = await getPendingSearchIntake(supabase, conversation.id);
    const lowSignalMessage = isLowSignalUserMessage(content);
    const blocksSearchLaunch = isNonSearchInquiryMessage(content);
    const searchIntent = resolveSearchIntent({
      userText: content,
      messages: history,
      pendingIntake
    });
    const hasSearchIntent = searchIntent.hasSearchIntent;
    const pendingSearchWasExplicit = Boolean(pendingIntake && isExplicitSearchIntentMessage(pendingIntake.initialMessage ?? ""));
    const shouldKeepPendingSearch = Boolean(
      pendingIntake &&
        !lowSignalMessage &&
        !blocksSearchLaunch &&
        (pendingSearchWasExplicit || searchIntent.isLaunchFollowUp || isMeaningfulPendingSearchReply(content))
    );

    if (!shouldKeepPendingSearch && pendingIntake) {
      await clearPendingSearchIntake(supabase, pendingIntake);
    }

    const activePendingIntake = shouldKeepPendingSearch ? pendingIntake : null;
    const canContinuePendingSearch = Boolean(activePendingIntake);

    const profileUpdateDetection = lowSignalMessage || blocksSearchLaunch || !couldContainProfileUpdate(content)
      ? null
      : await detectProfileUpdateProposal({
          profile,
          userText: content
        });
    if (profileUpdateDetection) {
      if (activePendingIntake) {
        await clearPendingSearchIntake(supabase, activePendingIntake);
      }

      const category =
        (canContinuePendingSearch ? activePendingIntake?.category : null) ??
        (hasSearchIntent ? searchIntent.category : null) ??
        (hasSearchIntent ? inferCategoryFromHistory([...seededMessages, userMessage]) : null);
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: buildProfileUpdateQuestion(profileUpdateDetection.summary, profile),
        metadata: {
          pendingProfileUpdate: {
            status: "awaiting_confirmation",
            patch: profileUpdateDetection.patch,
            summary: profileUpdateDetection.summary,
            searchState: category
              ? {
                  status: "ready",
                  category,
                  style: activePendingIntake?.style ?? null,
                  constraints: activePendingIntake?.constraints ?? null,
                  budget: activePendingIntake?.budget ?? null,
                  searchQuery: activePendingIntake?.searchQuery ?? null
                }
              : null,
            initialSearchMessage: activePendingIntake?.initialMessage ?? content
          }
        }
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

    if (
      shouldAutoLaunchSearch({
        searchIntent,
        pendingIntake: activePendingIntake,
        userText: content,
        profile,
        lowSignalMessage,
        blocksSearchLaunch
      })
    ) {
      if (activePendingIntake) {
        await clearPendingSearchIntake(supabase, activePendingIntake);
      }

      return performSearchWorkflow({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        search: buildSearchPayloadFromState(buildSearchStateFromIntent(searchIntent, activePendingIntake, content), searchIntent.sourceText, profile, activePendingIntake)
      });
    }

    const needsPlannerContext = hasSearchIntent || canContinuePendingSearch;
    const plannerContext: PlannerContext = needsPlannerContext
      ? await buildPlannerContext(supabase, {
          userId: user.id,
          messages: history
        })
      : {};

    const budgetHintCategory = (hasSearchIntent ? searchIntent.category : null) ?? activePendingIntake?.category ?? null;
    const categoryBudgetHint = getBudgetAllocationForVendorCategory(profile, budgetHintCategory)?.hint ?? null;
    const forceSearch = Boolean(
      (canContinuePendingSearch && activePendingIntake && activePendingIntake.exchanges >= 1 && isMeaningfulPendingSearchReply(content)) ||
        (hasSearchIntent && searchIntent.isLaunchFollowUp && searchIntent.category)
    );
    let modelText = await runModelChat({
      task: "planner",
      systemPrompt: buildPlannerSystemPrompt(profile, historyForModel, plannerContext),
      historyForModel,
      maxTokens: 460,
      temperature: 0.35,
      historyWindows: [6],
      timeoutMs: 8200,
      extraUserInstruction: buildCollectionInstruction({
        profile,
        pendingIntake: canContinuePendingSearch ? activePendingIntake : null,
        userText: content,
        forceSearch,
        lowSignalMessage,
        categoryBudgetHint,
        searchLaunchAllowed: hasSearchIntent || canContinuePendingSearch
      })
    });

    if (!modelText) {
      modelText = await runModelChat({
        task: "recovery",
        systemPrompt: buildRecoveryAssistantPrompt(),
        historyForModel: [],
        maxTokens: 360,
        temperature: 0.45,
        historyWindows: [0],
        timeoutMs: 5600,
        extraUserInstruction: buildRecoveryAssistantInstruction({
          userText: content,
          profile,
          pendingIntake: activePendingIntake,
          hasSearchIntent,
          lowSignalMessage,
          searchedCategories: plannerContext.searchedCategories ?? []
        })
      });
    }

    if (!modelText) {
      if (hasSearchIntent && searchIntent.category && !lowSignalMessage && !blocksSearchLaunch) {
        if (activePendingIntake) {
          await clearPendingSearchIntake(supabase, activePendingIntake);
        }

        return performSearchWorkflow({
          supabase,
          userId: user.id,
          conversationId: conversation.id,
          profile,
          search: buildSearchPayloadFromState(
            {
              status: "ready",
              category: searchIntent.category,
              style: activePendingIntake?.style ?? null,
              constraints: activePendingIntake?.constraints ?? null,
              budget: activePendingIntake?.budget ?? null,
              searchQuery: activePendingIntake?.searchQuery ?? null
            },
            searchIntent.sourceText,
            profile,
            activePendingIntake
          )
        });
      }

      return NextResponse.json({ error: "AI response unavailable" }, { status: 503 });
    }

    const parsed = parseHadaState(modelText);
    const explicitCategory = hasSearchIntent ? searchIntent.category : null;
    const category =
      explicitCategory ??
      (hasSearchIntent ? parsed.state.category : null) ??
      (canContinuePendingSearch ? activePendingIntake?.category : null) ??
      (canContinuePendingSearch ? normalizeSearchCategory(activePendingIntake?.initialMessage) : null);
    const shouldSearch = Boolean(
      category &&
        (forceSearch ||
          (canContinuePendingSearch && activePendingIntake && isMeaningfulPendingSearchReply(content) && parsed.state.status === "ready") ||
          (!activePendingIntake && hasSearchIntent && (parsed.state.status === "ready" || looksLikeSearchLaunch(parsed.displayText))))
    );

    if (!shouldSearch) {
      const shouldStorePendingSearch = Boolean((canContinuePendingSearch && activePendingIntake) || hasSearchIntent);
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: parsed.displayText,
        metadata: shouldStorePendingSearch
          ? buildPendingSearchMetadata(
              {
                ...parsed.state,
                category: explicitCategory ?? (hasSearchIntent ? (category ?? null) : activePendingIntake?.category ?? null)
              },
              content,
              activePendingIntake
            )
          : undefined
      });

      return NextResponse.json({
        conversationId: conversation.id,
        assistantMessage,
        message: assistantMessage.content,
        action: null,
        categorie: shouldStorePendingSearch ? category : null,
        redirect_path: null,
        searchResultsCount: 0
      });
    }

    if (activePendingIntake) {
      await clearPendingSearchIntake(supabase, activePendingIntake);
    }

    return performSearchWorkflow({
      supabase,
      userId: user.id,
      conversationId: conversation.id,
      profile,
      search: buildSearchPayloadFromState({ ...parsed.state, category }, searchIntent.sourceText, profile, activePendingIntake)
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
  introMessage?: string | null;
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
      content: [input.introMessage?.trim(), buildSearchQuotaBlockedMessage(quotaBeforeSearch.resetAt)].filter(Boolean).join("\n\n"),
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
  const announcementPrompt = buildSearchAnnouncementPrompt({
    profile: input.profile,
    categoryLabel,
    count: searchResults.candidates.length,
    hasResults,
    isExternalFallback: !hasResults && input.finalFallback
  });
  let announcement = await runModelChat({
    task: "announcement",
    systemPrompt: announcementPrompt,
    historyForModel: [],
    maxTokens: 240,
    temperature: 0.55,
    historyWindows: [0],
    timeoutMs: 5200
  });

  if (!announcement) {
    announcement = await runModelChat({
      task: "announcement",
      systemPrompt: buildSearchAnnouncementRecoveryPrompt(),
      historyForModel: [],
      maxTokens: 220,
      temperature: 0.55,
      extraUserInstruction: [
        `Type de prestataire : ${categoryLabel}`,
        `Nombre de résultats : ${searchResults.candidates.length}`,
        `Résultats trouvés : ${hasResults}`,
        `Recherche externe de secours : ${!hasResults && input.finalFallback}`,
        `Profil couple JSON : ${JSON.stringify(buildProfileBrief(input.profile))}`
      ].join("\n"),
      historyWindows: [0],
      timeoutMs: 4200
    });
  }

  if (!announcement) {
    announcement = buildSearchAnnouncementFallback({
      categoryLabel,
      count: searchResults.candidates.length,
      hasResults,
      isExternalFallback: !hasResults && Boolean(input.finalFallback)
    });
  }

  const quotaAfterSearch = await getSearchQuotaStatus(input.supabase, input.userId);
  const content = [input.introMessage?.trim(), announcement.trim(), buildSearchQuotaFollowUpMessage(quotaAfterSearch)]
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

async function handlePendingProfileUpdate(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  conversationId: string;
  profile: Partial<WeddingProfile> | null;
  userReply: string;
  pending: PendingProfileUpdate;
}) {
  if (isAffirmativeReply(input.userReply)) {
    const nextProfile = await applyWeddingProfilePatch(input.supabase, input.userId, input.profile, input.pending.patch);
    await clearPendingProfileUpdate(input.supabase, input.pending);

    const confirmation = buildProfileUpdateConfirmation(input.pending.summary);
    if (input.pending.searchState?.category && input.pending.initialSearchMessage) {
      return performSearchWorkflow({
        supabase: input.supabase,
        userId: input.userId,
        conversationId: input.conversationId,
        profile: nextProfile,
        search: buildSearchPayloadFromState({ ...input.pending.searchState, searchQuery: null }, input.pending.initialSearchMessage, nextProfile, null),
        introMessage: confirmation
      });
    }

    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: confirmation
    });

    return NextResponse.json({
      conversationId: input.conversationId,
      assistantMessage,
      message: assistantMessage.content,
      action: null,
      categorie: null,
      redirect_path: null,
      searchResultsCount: 0
    });
  }

  if (isNegativeReply(input.userReply)) {
    await clearPendingProfileUpdate(input.supabase, input.pending);

    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content:
        "D'accord, je garde votre profil mariage actuel pour l'instant. Si vous voulez relancer la recherche avec ces informations, dites-moi simplement ce que vous cherchez."
    });

    return NextResponse.json({
      conversationId: input.conversationId,
      assistantMessage,
      message: assistantMessage.content,
      action: null,
      categorie: null,
      redirect_path: null,
      searchResultsCount: 0
    });
  }

  const assistantMessage = await insertConversationMessage(input.supabase, {
    conversationId: input.conversationId,
    role: "assistant",
    content: "Je veux bien, mais j'ai besoin d'un oui ou d'un non pour mettre votre profil mariage à jour avant d'aller plus loin."
  });

  return NextResponse.json({
    conversationId: input.conversationId,
    assistantMessage,
    message: assistantMessage.content,
    action: null,
    categorie: null,
    redirect_path: null,
    searchResultsCount: 0
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

    const initialMessage = readString(value.initialMessage);
    const category = normalizeSearchCategory(readString(value.category)) ?? normalizeSearchCategory(initialMessage);
    if (!category) continue;

    return {
      messageId: message.id,
      metadata,
      status: "clarify",
      category,
      style: readString(value.style),
      constraints: readString(value.constraints),
      budget: readString(value.budget),
      searchQuery: readString(value.searchQuery),
      initialMessage,
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
    if (value.status !== "awaiting_confirmation") continue;

    const patch = parseProfileUpdatePatch(value.patch);
    const summary = readString(value.summary);
    if (!patch || !summary) continue;

    return {
      messageId: message.id,
      metadata,
      patch,
      summary,
      searchState: parsePendingSearchState(value.searchState),
      initialSearchMessage: readString(value.initialSearchMessage)
    };
  }

  return null;
}

function buildSearchQuotaFollowUpMessage(quota: Awaited<ReturnType<typeof getSearchQuotaStatus>>) {
  if (quota.remaining === 1) {
    return "Il vous reste 1 recherche bêta sur cette fenêtre de 48h.";
  }

  if (quota.remaining === 0) {
    return `Limite bêta atteinte : 2 recherches toutes les 48h. Prochaine recherche possible ${formatQuotaReset(quota.resetAt)}.`;
  }

  return null;
}

function buildSearchQuotaBlockedMessage(resetAt: string | null) {
  return `Limite bêta atteinte : 2 recherches toutes les 48h. Prochaine recherche possible ${formatQuotaReset(resetAt)}.`;
}

function buildSearchAnnouncementFallback(input: { categoryLabel: string; count: number; hasResults: boolean; isExternalFallback: boolean }) {
  if (input.hasResults) {
    const countLabel = `${input.count} ${input.categoryLabel}`;
    const sheetLabel = input.count > 1 ? "les fiches sont prêtes" : "la fiche est prête";
    return `Je viens de lancer la recherche : ${countLabel}, ${sheetLabel}. Vous pouvez découvrir tout ça avec le bouton juste en dessous.`;
  }

  if (input.isExternalFallback) {
    return "Je n'ai pas encore de fiche assez fiable à vous montrer ici. Je vous propose d'ouvrir une recherche externe ciblée pour avancer sans bloquer.";
  }

  return "Je n'ai pas encore de fiche assez fiable avec ces critères. Vous pouvez pousser une recherche plus large avec le bouton juste en dessous.";
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
  userText: string;
  forceSearch: boolean;
  lowSignalMessage: boolean;
  categoryBudgetHint: string | null;
  searchLaunchAllowed: boolean;
}) {
  return [
    "Contexte serveur pour Hada.",
    `Profil couple JSON : ${JSON.stringify(buildProfileBrief(input.profile))}`,
    `Collecte en cours JSON : ${JSON.stringify(input.pendingIntake ? toPendingBrief(input.pendingIntake) : null)}`,
    `forceSearch: ${input.forceSearch}`,
    `messageFaibleOuTechnique: ${input.lowSignalMessage}`,
    `Budget cible prestataire : ${input.categoryBudgetHint ?? "non applicable ou budget global à confirmer"}`,
    `rechercheServeurAutorisee: ${input.searchLaunchAllowed}`,
    `Dernier message couple : ${input.userText}`,
    input.forceSearch
      ? "Tu dois répondre avec status ready dans HADA_STATE, annoncer naturellement que tu lances la recherche, et ne poser aucune question."
      : input.lowSignalMessage
        ? "Le message semble être un test technique, du charabia ou une saisie trop faible pour déduire une intention. Réponds naturellement et brièvement selon ce que tu comprends, sans lancer ni préparer de recherche, sans demander un type précis de prestataire par défaut, et mets impérativement status clarify, category null, search_query null."
        : input.searchLaunchAllowed
          ? "Si le dernier message contient une demande de recherche de prestataire, réponds status ready dès que le type de prestataire est clair et que le besoin est suffisamment exploitable. Pose une seule question seulement si le type ou l'envie principale manque vraiment. Si le budget cible prestataire est renseigné, utilise-le comme base et ne demande pas un budget supplémentaire sauf si le couple en donne un autre explicitement. Si une collecte explicite est déjà en cours et que la réponse est exploitable, réponds avec status ready et ne demande jamais au couple de confirmer le lancement."
          : "Le serveur interdit de lancer ou préparer une recherche pour ce message. Réponds naturellement à la question ou au besoin de conseil, sans créer de brief de recherche, et mets impérativement status clarify, category null, search_query null.",
    "Ne présente aucun prestataire dans le chat.",
    "Réponse visible attendue : 1 à 3 phrases courtes, sans paragraphe long."
  ].join("\n");
}

async function detectProfileUpdateProposal(input: {
  profile: Partial<WeddingProfile> | null;
  userText: string;
}): Promise<ProfileUpdateDetection | null> {
  if (!input.profile) return null;

  const normalizedUserText = normalizeText(input.userText);
  if (!normalizedUserText || isSimpleConfirmationReply(normalizedUserText)) return null;

  const searchCategory = normalizeSearchCategory(input.userText);
  const locationPatchFromSearch = searchCategory ? detectLocationPatchFromSearchRequest(input.profile, input.userText, searchCategory) : null;

  const response = await runModelChat({
    task: "profile_update_detection",
    systemPrompt: buildProfileUpdateDetectionPrompt(input.profile),
    historyForModel: [],
    maxTokens: 220,
    temperature: 0.1,
    historyWindows: [0],
    timeoutMs: 4200,
    extraUserInstruction: input.userText
  });

  const llmPatch = response ? parseProfileUpdateDetectionResponse(response) : null;
  const mergedPatch = mergeProfileUpdatePatches(llmPatch, locationPatchFromSearch);
  if (!mergedPatch) return null;

  const summary = buildProfileUpdateSummary(input.profile, mergedPatch);
  if (!summary) return null;

  return {
    patch: mergedPatch,
    summary
  };
}

function parseHadaState(content: string): { displayText: string; state: HadaState } {
  const extracted = extractHadaState(content);
  const emptyState: HadaState = {
    status: "clarify",
    category: null,
    style: null,
    constraints: null,
    budget: null,
    searchQuery: null
  };

  if (!extracted.stateJson) {
    return { displayText: extracted.displayText || content.trim(), state: emptyState };
  }

  try {
    const raw = JSON.parse(extracted.stateJson) as Record<string, unknown>;
    return {
      displayText: extracted.displayText,
      state: {
        status: raw.status === "ready" ? "ready" : "clarify",
        category: normalizeSearchCategory(readString(raw.category)),
        style: readString(raw.style),
        constraints: readString(raw.constraints),
        budget: readString(raw.budget),
        searchQuery: readString(raw.search_query) ?? readString(raw.searchQuery)
      }
    };
  } catch {
    return { displayText: extracted.displayText, state: emptyState };
  }
}

function buildPendingSearchMetadata(state: HadaState, userText: string, pending: PendingSearchIntake | null) {
  return {
    pendingSearch: {
      status: "clarify",
      category: state.category ?? pending?.category ?? null,
      style: state.style ?? pending?.style ?? null,
      constraints: state.constraints ?? pending?.constraints ?? null,
      budget: state.budget ?? pending?.budget ?? null,
      searchQuery: state.searchQuery ?? pending?.searchQuery ?? null,
      initialMessage: pending?.initialMessage ?? userText,
      exchanges: (pending?.exchanges ?? 0) + 1
    }
  };
}

function buildProfileUpdateQuestion(summary: string, profile: Partial<WeddingProfile> | null) {
  const reminder = formatProfileReminder(profile);
  return reminder
    ? `Je vois une mise à jour à faire pour votre mariage : ${summary} — souhaitez-vous que je mette votre profil à jour avant de lancer la recherche ? (${reminder})`
    : `Je vois une mise à jour à faire pour votre mariage : ${summary} — souhaitez-vous que je mette votre profil à jour avant de lancer la recherche ?`;
}

function buildProfileUpdateConfirmation(summary: string) {
  return `C'est noté, votre profil mariage est bien mis à jour : ${summary}.`;
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

async function clearPendingProfileUpdate(supabase: ReturnType<typeof createSupabaseServerClient>, pending: PendingProfileUpdate) {
  await supabase
    .from("messages")
    .update({
      metadata_json: {
        ...pending.metadata,
        pendingProfileUpdate: {
          ...((pending.metadata.pendingProfileUpdate as Record<string, unknown> | undefined) ?? {}),
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
  const searchSourceText = pending?.initialMessage ?? userText;
  const location = extractRequestedSearchLocation(searchSourceText, category) ?? profile?.city ?? profile?.region ?? profile?.country ?? null;
  const style = state.style ?? pending?.style ?? null;
  const constraints = state.constraints ?? pending?.constraints ?? null;
  const budget = state.budget ?? pending?.budget ?? getBudgetAllocationForVendorCategory(profile, category)?.hint ?? null;

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

function resolveSearchIntent(input: {
  userText: string;
  messages: ChatMessage[];
  pendingIntake: PendingSearchIntake | null;
}): ResolvedSearchIntent {
  const directSearchIntent = isExplicitSearchIntentMessage(input.userText);
  const genericSearchIntent = isGenericSearchIntentMessage(input.userText);
  const launchFollowUp = isSearchLaunchFollowUpMessage(input.userText);
  const currentCategory = normalizeSearchCategory(input.userText);
  const recentContext = inferSearchContextFromConversation(input.messages, input.pendingIntake);
  const contextualSearchReply = isContextualSearchReply(input.userText, recentContext);
  const categoryAnswerToGenericQuestion = Boolean(currentCategory && recentContext.hasGenericSearchQuestion && !isNonSearchInquiryMessage(input.userText) && !isLowSignalUserMessage(input.userText));
  const category = currentCategory ?? (launchFollowUp || contextualSearchReply ? recentContext.category : null);
  const hasSearchIntent = directSearchIntent || genericSearchIntent || categoryAnswerToGenericQuestion || Boolean((launchFollowUp || contextualSearchReply) && category);
  const sourceText = launchFollowUp || contextualSearchReply || categoryAnswerToGenericQuestion
    ? [recentContext.sourceText, input.userText].filter(Boolean).join(" ").trim()
    : input.userText;

  return {
    hasSearchIntent,
    category: hasSearchIntent ? (category ?? recentContext.category) : null,
    isLaunchFollowUp: Boolean(launchFollowUp && category),
    isContextualSearchReply: Boolean(contextualSearchReply && category),
    sourceText: sourceText || input.userText
  };
}

function inferSearchContextFromConversation(messages: ChatMessage[], pendingIntake: PendingSearchIntake | null): SearchConversationContext {
  if (pendingIntake?.category) {
    return {
      category: pendingIntake.category,
      sourceText: [pendingIntake.initialMessage, pendingIntake.style, pendingIntake.constraints, pendingIntake.searchQuery].filter(Boolean).join(" "),
      hasClarifyingQuestion: true,
      hasGenericSearchQuestion: false
    };
  }

  const recentMessages = messages.slice(-8);
  const lastAssistantMessage = [...recentMessages].reverse().find((message) => message.role === "assistant")?.content ?? "";

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    const category = message.role === "assistant" ? inferCategoryFromAssistantContext(message.content) : normalizeSearchCategory(message.content);
    if (!category) continue;

    return {
      category,
      sourceText: recentMessages
        .slice(Math.max(0, index - 2))
        .map((item) => item.content)
        .join(" ")
        .slice(0, 1000),
      hasClarifyingQuestion: message.role === "assistant" && looksLikeSearchClarifyingQuestion(message.content),
      hasGenericSearchQuestion: looksLikeGenericSearchQuestion(lastAssistantMessage)
    };
  }

  return {
    category: null,
    sourceText: recentMessages
      .slice(-4)
      .map((message) => message.content)
      .join(" ")
      .slice(0, 1000),
    hasClarifyingQuestion: false,
    hasGenericSearchQuestion: looksLikeGenericSearchQuestion(lastAssistantMessage)
  };
}

function shouldAutoLaunchSearch(input: {
  searchIntent: ResolvedSearchIntent;
  pendingIntake: PendingSearchIntake | null;
  userText: string;
  profile: Partial<WeddingProfile> | null;
  lowSignalMessage: boolean;
  blocksSearchLaunch: boolean;
}) {
  if (input.lowSignalMessage || input.blocksSearchLaunch || !input.searchIntent.hasSearchIntent || !input.searchIntent.category) return false;

  if (input.searchIntent.isLaunchFollowUp || input.searchIntent.isContextualSearchReply) return true;
  if (input.pendingIntake && isMeaningfulPendingSearchReply(input.userText)) return true;

  return isSpecificInitialSearchRequest(input.userText, input.profile, input.searchIntent.category);
}

function buildSearchStateFromIntent(searchIntent: ResolvedSearchIntent, pendingIntake: PendingSearchIntake | null, userText: string): HadaState {
  const details = extractSearchDetails([pendingIntake?.initialMessage, pendingIntake?.style, pendingIntake?.constraints, searchIntent.sourceText, userText].filter(Boolean).join(" "));

  return {
    status: "ready",
    category: searchIntent.category ?? pendingIntake?.category ?? null,
    style: pendingIntake?.style ?? details.style,
    constraints: pendingIntake?.constraints ?? details.constraints,
    budget: pendingIntake?.budget ?? details.budget,
    searchQuery: pendingIntake?.searchQuery ?? null
  };
}

function isContextualSearchReply(userText: string, context: SearchConversationContext) {
  if (!context.category || !context.hasClarifyingQuestion) return false;
  if (isNonSearchInquiryMessage(userText) || isLowSignalUserMessage(userText)) return false;

  const normalized = normalizeForIntent(userText);
  if (!normalized) return false;
  if (/^(merci|super|top|genial|parfait)$/i.test(normalized)) return false;

  return isMeaningfulPendingSearchReply(userText) || /\b(peu importe|comme tu veux|a toi de voir|pas de preference|aucune preference|surprends moi|oui|non|plutot|plutôt)\b/.test(normalizeText(userText));
}

function looksLikeSearchClarifyingQuestion(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return false;

  const hasPreferenceQuestion = /\b(preferez vous|preference|vous imaginez|vous voulez|vous cherchez|plutot|ambiance|style|vue|cuisine|format|priorite|envie|souhaitez vous)\b/.test(
    normalized
  );
  const hasSearchContext = Boolean(inferCategoryFromAssistantContext(value)) || /\b(recherche|prestataire|prestataires|lieu|traiteur|photographe|dj|fleuriste)\b/.test(normalized);

  return hasPreferenceQuestion && hasSearchContext;
}

function isSpecificInitialSearchRequest(userText: string, profile: Partial<WeddingProfile> | null, category: VendorCategory) {
  const normalized = normalizeForIntent(userText);
  const details = extractSearchDetails(userText);
  const hasProfileBase = Boolean(profile?.city || profile?.region || profile?.country);
  const hasCategorySpecificDetail = Boolean(details.style || details.constraints || details.budget || extractRequestedSearchLocation(userText, category));
  const asksForDirectSearch = /\b(cherche|recherche|trouve|deniche|selectionne|propose|recommande|liste)\b/.test(normalized);

  return asksForDirectSearch && (hasCategorySpecificDetail || hasProfileBase);
}

function extractSearchDetails(value: string): Pick<HadaState, "style" | "constraints" | "budget"> {
  const normalized = normalizeText(value);
  const styleMatches = normalized.match(
    /\b(moderne|classique|traditionnel|italien|vegetarien|vegan|chic|simple|elegant|boheme|romantique|festif|luxe|champetre|rustique|intimiste|convivial|editorial|historique|nature|vue|etang|lac|jardin|terrasse|rooftop)\b/g
  );
  const budgetMatch = value.match(/\b\d{3,6}\s*(?:€|eur|euros?)\b/i);
  const constraints = extractConstraintText(value);

  return {
    style: styleMatches ? Array.from(new Set(styleMatches)).slice(0, 5).join(", ") : null,
    constraints,
    budget: budgetMatch?.[0] ?? null
  };
}

function extractConstraintText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const patterns = [
    /\b(?:avec|qui a|qui ait|si possible|idealement|idéalement)\s+([^.!?]{3,90})/i,
    /\b(?:sans)\s+([^.!?]{3,80})/i,
    /\b(?:pour)\s+(\d{1,4}\s*(?:invites|invités|personnes))/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function inferCategoryFromAssistantContext(value: string): VendorCategory | null {
  const normalized = normalizeForIntent(value);
  if (!normalized) return null;

  if (/\b(lieu|lieux|domaine|chateau|salle|reception|grange|ferme|mas|bastide|manoir|auberge|jardin|parc|etang|lac|rooftop|terrasse|orangerie)\b/.test(normalized)) {
    return "venue";
  }
  if (/\b(traiteur|traiteurs|restauration|cocktail|diner|repas|wedding cake|gateau|patisserie)\b/.test(normalized)) return "caterer";
  if (/\b(photographe|photographes|photobooth|photomaton|borne photo|borne photos)\b/.test(normalized)) return "photographer";
  if (/\b(videaste|videastes|film de mariage)\b/.test(normalized)) return "videographer";
  if (/\b(dj|disc jockey|platines)\b/.test(normalized)) return "dj";
  if (/\b(groupe|chanteur|chanteuse|jazz|acoustique|piano|guitariste|violoniste|orchestre|musique live|musicien|musiciens)\b/.test(normalized)) return "musician";
  if (/\b(fleuriste|fleuristes|fleurs|floral)\b/.test(normalized)) return "flowers";
  if (/\b(deco|decoration|scenographie)\b/.test(normalized)) return "decor";
  if (/\b(robe|robes)\b/.test(normalized)) return "dress";
  if (/\b(costume|costumes)\b/.test(normalized)) return "suit";
  if (/\b(transport|navette|chauffeur|voiture)\b/.test(normalized)) return "transport";

  return null;
}

function isSearchLaunchFollowUpMessage(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized || isNonSearchInquiryMessage(value) || isLowSignalUserMessage(value)) return false;

  const hasLaunchAction =
    /\b(lance|lancer|lancez|demarre|demarrer|go|vas y|allez|c est parti|on y va|partons|cherche|chercher|trouve|trouver|deniche|denicher)\b/.test(
      normalized
    );
  const hasSearchObject = /\b(recherche|prestataire|prestataires|option|options|adresse|adresses|pepite|pepites|fiche|fiches)\b/.test(normalized);
  const directLaunchPhrase =
    /\b(fais la recherche|fait la recherche|tu peux lancer|peux tu lancer|pouvez vous lancer|ok lance|super lance|parfait lance|lance la recherche|lance les recherches|relance la recherche)\b/.test(
      normalized
    );

  return directLaunchPhrase || (hasLaunchAction && hasSearchObject);
}

function isGenericSearchIntentMessage(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized || normalizeSearchCategory(value) || isNonSearchInquiryMessage(value) || isLowSignalUserMessage(value)) return false;

  const hasSearchAction =
    /\b(cherche|chercher|recherche|rechercher|trouve|trouver|deniche|denicher|selectionne|selectionner|propose|proposer|recommande|recommander|liste|lister|aide moi a trouver|aidez moi a trouver|peux tu trouver|pouvez vous trouver)\b/.test(
      normalized
    );
  const hasVendorObject = /\b(prestataire|prestataires|vendor|vendors|adresse|adresses|contact|contacts|option|options|pepite|pepites)\b/.test(normalized);

  return hasSearchAction && hasVendorObject;
}

function looksLikeGenericSearchQuestion(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return false;

  return /\b(type de prestataire|quel prestataire|quelle categorie|quelle catégorie|que cherchez vous|ce que vous cherchez|prestataire souhaitez vous|prestataire recherchez vous)\b/.test(
    normalized
  );
}

function looksLikeSearchLaunch(value: string) {
  const normalized = normalizeText(value);
  return /(je lance|je vais chercher|je cherche|je pars|je fouille|je deniche|je m y mets|je reviens tres vite|je vous reviens)/.test(normalized);
}

function buildRecoveryAssistantPrompt() {
  return [
    "Tu es Hada, wedding planner de poche, chaleureuse et utile.",
    "Tu dois toujours répondre en français naturel au dernier message du couple.",
    "Tu ne dois jamais afficher de JSON ou de texte technique côté utilisateur.",
    "Avant la réponse visible, ajoute exactement une ligne d'état serveur au format :",
    'HADA_STATE::{"intent":"advice","status":"clarify","category":null,"style":null,"constraints":null,"budget":null,"search_query":null,"profile_update":null}',
    "Puis une ligne vide, puis la réponse destinée au couple.",
    "Si le dernier message est une question, réponds à la question au mieux. Si tu ne connais pas assez le sujet, dis-le naturellement et demande une précision utile.",
    "Si le message est du charabia, un test ou trop faible, réponds brièvement sans lancer de recherche.",
    "Ne lance pas, ne prépare pas et n'annonce pas de recherche de prestataire dans ce mode de secours."
  ].join("\n");
}

function buildRecoveryAssistantInstruction(input: {
  userText: string;
  profile: Partial<WeddingProfile> | null;
  pendingIntake: PendingSearchIntake | null;
  hasSearchIntent: boolean;
  lowSignalMessage: boolean;
  searchedCategories: string[];
}) {
  return [
    "Contexte de secours : le premier appel de réponse n'a pas produit de texte exploitable, mais tu dois quand même répondre via le modèle disponible.",
    `Profil couple JSON : ${JSON.stringify(buildProfileBrief(input.profile))}`,
    `Collecte de recherche en cours JSON : ${JSON.stringify(input.pendingIntake ? toPendingBrief(input.pendingIntake) : null)}`,
    `Message avec intention de recherche détectée par le serveur : ${input.hasSearchIntent}`,
    `Message faible, test technique ou charabia détecté par le serveur : ${input.lowSignalMessage}`,
    `Catégories déjà recherchées JSON : ${JSON.stringify(input.searchedCategories)}`,
    `Dernier message couple : ${input.userText}`
  ].join("\n");
}

function couldContainProfileUpdate(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  const hasChecklistSignal =
    /(coche|cocher|decoche|decocher|fait|faite|termine|terminee|reserve|reserver|valide|envoye|liste|planning|apres|faire-part|rsvp|tenue|robe|costume)/.test(
      normalized
    );
  const hasDateSignal =
    /(date|jour j|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|\b20\d{2}\b)/.test(normalized);
  const hasGuestSignal = /\b(invite|invites|personne|personnes)\b/.test(normalized) || /\b(pour|a|à)\s+\d{1,4}\b/.test(normalized);
  const hasBudgetSignal = /(budget|euro|€|\b\d{3,6}\s*(eur|euros|€)\b)/.test(normalized);
  const hasLocationSignal =
    /\b(lieu|ville|region|pays)\b/.test(normalized) ||
    /\b(a|en|dans|sur|autour de|pres de|proche de|vers)\s+(?!style|mode|theme|ambiance|cuisine|menu|buffet|version|format)\w{3,}/.test(
      normalized
    );
  const hasWeddingSignal = /\b(mariage|marie|mariee)\b/.test(normalized);
  const hasChangeSignal =
    /(changer|change|modifier|modifie|mettre a jour|mise a jour|finalement|plutot|desormais|sera|se passera|prevu|avance|avancee|recule|reculee)/.test(
      normalized
    );

  return (
    hasChecklistSignal ||
    hasDateSignal ||
    hasGuestSignal ||
    hasBudgetSignal ||
    hasLocationSignal ||
    (hasWeddingSignal && hasChangeSignal)
  );
}

function isNonSearchInquiryMessage(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return false;

  const asksForExplanation =
    /\b(c est quoi|c quoi|qu est ce que|qu est ce que c est|ca veut dire quoi|cela veut dire quoi|definition|definis|explique|peux tu expliquer|cherche a comprendre|chercher a comprendre|besoin de comprendre|besoin d aide pour comprendre|aide moi a comprendre|aidez moi a comprendre|a quoi ca sert|a quoi sert|comment ca marche|comment fonctionne|c est qui|qui est|tu connais|connais tu|vous connaissez|est ce quoi)\b/.test(
      normalized
    );
  const asksForAdvice =
    /\b(avis|conseil|conseilles?|important|utile|necessaire|obligatoire|difference|pourquoi|combien ca coute|prix moyen|budget moyen|est ce une bonne idee|bonne idee|mieux vaut)\b/.test(
      normalized
    );
  const asksForInformation =
    /\b(info|infos|information|renseignement|renseigne moi|parle moi|j aimerais comprendre|je veux comprendre|je ne comprends pas|je sais pas ce que|je ne sais pas ce que)\b/.test(
      normalized
    );

  return asksForExplanation || asksForAdvice || asksForInformation;
}

function isExplicitSearchIntentMessage(value: string) {
  const normalized = normalizeForIntent(value);
  const category = normalizeSearchCategory(value);
  if (!normalized || !category) return false;

  const hasStrongSearchVerb =
    /\b(cherche|chercher|recherche|rechercher|trouve|trouver|deniche|denicher|selectionne|selectionner|propose|proposer|recommande|recommander|liste|lister|lance|lancer|prepare|preparer)\b/.test(
      normalized
    );
  const hasSearchNoun = /\b(recherche|selection|shortlist|prestataire|prestataires|vendor|vendors|pepite|pepites|option|options|adresse|adresses|contact|contacts)\b/.test(normalized);
  const hasNeedPhrase =
    /\b(j ai besoin|on a besoin|nous avons besoin|il me faut|il nous faut|je veux|on veut|nous voulons|je voudrais|on voudrait|nous voudrions)\b/.test(
      normalized
    );
  const asksForFindingHelp =
    /\b(aide moi a trouver|aidez moi a trouver|peux tu trouver|pouvez vous trouver|peux tu chercher|pouvez vous chercher|occupe toi de trouver|occupez vous de trouver)\b/.test(
      normalized
    );

  if (isNonSearchInquiryMessage(value)) return false;

  return hasStrongSearchVerb || asksForFindingHelp || (hasNeedPhrase && (hasSearchNoun || category !== null));
}

function normalizeForIntent(value: string) {
  return normalizeText(value)
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9€ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulPendingSearchReply(value: string) {
  if (isLowSignalUserMessage(value)) return false;
  const normalized = normalizeText(value);

  if (normalizeSearchCategory(value)) return true;
  if (normalized.length >= 12) return true;
  return /(moderne|classique|traditionnel|italien|vegetarien|chic|simple|elegant|boheme|romantique|festif|budget|invite|personne|oui|non|plutot|plutôt)/.test(
    normalized
  );
}

function isLowSignalUserMessage(value: string) {
  const normalized = normalizeText(value).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (normalizeSearchCategory(value)) return false;

  const genericTestInputs = new Set(["test", "essai", "asdf", "azerty", "qwerty", "blabla", "blah", "ok test"]);
  if (genericTestInputs.has(normalized)) return true;

  const compact = normalized.replace(/\s+/g, "");
  if (compact.length >= 6 && !/[aeiouy]/.test(compact)) return true;
  if (compact.length >= 8 && vowelRatio(compact) < 0.18 && !/\d/.test(compact)) return true;

  return false;
}

function vowelRatio(value: string) {
  const letters = value.replace(/[^a-z]/g, "");
  if (!letters) return 0;
  const vowels = letters.match(/[aeiouy]/g)?.length ?? 0;
  return vowels / letters.length;
}

function inferCategoryFromHistory(messages: ChatMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const category = normalizeSearchCategory(message.content);
    if (category) return category;
  }

  return null;
}

function buildSearchAnnouncementRecoveryPrompt() {
  return [
    "Tu es Hada, wedding planner de poche, chaleureuse et concise.",
    "Tu dois annoncer en français naturel le résultat d'une recherche de prestataires.",
    "Ne mentionne jamais de JSON, de données techniques ni de prompt.",
    "Si des résultats existent, indique que les fiches sont prêtes et invite à cliquer sur le bouton.",
    "Si aucun résultat fiable n'existe, explique simplement qu'une recherche externe ciblée est prête.",
    "Réponds uniquement avec le message visible destiné au couple."
  ].join("\n");
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

function buildProfileBriefWithChecklist(profile: Partial<WeddingProfile> | null) {
  return {
    ...buildProfileBrief(profile),
    checklist_mariage: normalizeWeddingChecklist(profile?.wedding_checklist).map((item) => ({
      id: item.id,
      titre: item.title,
      statut: item.done ? "fait" : "a_faire"
    }))
  };
}

function formatProfileReminder(profile: Partial<WeddingProfile> | null) {
  if (!profile) return null;

  const parts = [
    profile.wedding_date ? `mariage prévu le ${profile.wedding_date}` : profile.wedding_period_text ? `mariage prévu ${profile.wedding_period_text}` : null,
    profile.city ? `lieu ${profile.city}` : profile.region ? `région ${profile.region}` : null,
    profile.guest_count ? `${profile.guest_count} invités` : null,
    profile.budget_max ? `budget de ${profile.budget_max.toLocaleString("fr-FR")} €` : null
  ].filter(Boolean);

  return parts.join(", ");
}

function toPendingBrief(pending: PendingSearchIntake) {
  return {
    category: pending.category,
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

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePendingSearchState(value: unknown): HadaState | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const category = normalizeSearchCategory(readString(raw.category));
  if (!category) return null;

  return {
    status: raw.status === "clarify" ? "clarify" : "ready",
    category,
    style: readString(raw.style),
    constraints: readString(raw.constraints),
    budget: readString(raw.budget),
    searchQuery: readString(raw.searchQuery)
  };
}

function parseProfileUpdatePatch(value: unknown): ProfileUpdatePatch | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const patch: ProfileUpdatePatch = {};

  if ("wedding_date" in raw) patch.wedding_date = readString(raw.wedding_date);
  if ("wedding_period_text" in raw) patch.wedding_period_text = readString(raw.wedding_period_text);
  if ("city" in raw) patch.city = readString(raw.city);
  if ("region" in raw) patch.region = readString(raw.region);
  if ("country" in raw) patch.country = readString(raw.country);
  if ("guest_count" in raw) patch.guest_count = readNumber(raw.guest_count);
  if ("budget_max" in raw) patch.budget_max = readNumber(raw.budget_max);
  if ("wedding_checklist" in raw) patch.wedding_checklist = parseWeddingChecklistPatch(raw.wedding_checklist);

  return Object.keys(patch).length > 0 ? patch : null;
}

function parseWeddingChecklistPatch(value: unknown): WeddingChecklistPatch | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const completedItemIds = readStringArray(raw.completed_item_ids);
  const reopenedItemIds = readStringArray(raw.reopened_item_ids);
  const patch: WeddingChecklistPatch = {};

  if (completedItemIds.length > 0) patch.completed_item_ids = completedItemIds;
  if (reopenedItemIds.length > 0) patch.reopened_item_ids = reopenedItemIds;

  return Object.keys(patch).length > 0 ? patch : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function mergeProfileUpdatePatches(...patches: Array<ProfileUpdatePatch | null>) {
  const merged: ProfileUpdatePatch = {};

  for (const patch of patches) {
    if (!patch) continue;
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === "") continue;
      switch (key) {
        case "wedding_date":
          merged.wedding_date = value as string;
          break;
        case "wedding_period_text":
          merged.wedding_period_text = value as string;
          break;
        case "city":
          merged.city = value as string;
          break;
        case "region":
          merged.region = value as string;
          break;
        case "country":
          merged.country = value as string;
          break;
        case "guest_count":
          merged.guest_count = value as number;
          break;
        case "budget_max":
          merged.budget_max = value as number;
          break;
        case "wedding_checklist":
          merged.wedding_checklist = mergeWeddingChecklistPatch(merged.wedding_checklist, value as WeddingChecklistPatch);
          break;
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function mergeWeddingChecklistPatch(previous: WeddingChecklistPatch | null | undefined, next: WeddingChecklistPatch) {
  return {
    completed_item_ids: Array.from(new Set([...(previous?.completed_item_ids ?? []), ...(next.completed_item_ids ?? [])])),
    reopened_item_ids: Array.from(new Set([...(previous?.reopened_item_ids ?? []), ...(next.reopened_item_ids ?? [])]))
  };
}

function isSimpleConfirmationReply(value: string) {
  return /^(oui|ok|okay|dac|daccord|d accord|non|nope|nan)\b/.test(value.trim());
}

function isAffirmativeReply(value: string) {
  return /^(oui|ok|okay|go|vas-y|allez|daccord|d accord|c est bon|cest bon)\b/.test(normalizeText(value).trim());
}

function isNegativeReply(value: string) {
  return /^(non|pas maintenant|pas tout de suite|laisse|laissez|nan|nope)\b/.test(normalizeText(value).trim());
}

function buildProfileUpdateDetectionPrompt(profile: Partial<WeddingProfile> | null) {
  return [
    "Tu es un detecteur de mise a jour de profil mariage.",
    "Tu lis le profil actuel et le dernier message utilisateur.",
    "Detecte uniquement les changements explicites ou les compléments clairs portant sur la date/periode du mariage, le lieu du mariage, le nombre d'invites, le budget global ou les étapes de checklist d'organisation.",
    "Pour la checklist, coche une étape seulement si le message indique clairement qu'elle est faite, réservée, envoyée, validée ou à marquer comme terminée. Décoche seulement si le message demande clairement de retirer, rouvrir ou remettre une étape à faire.",
    "Ignore les preferences de style, l'ambiance, les categories de prestataires et les formulations vagues qui ne modifient pas une donnée ou une étape.",
    "Ne propose rien si l'utilisateur ne modifie pas clairement une information deja connue ou si le message est juste une confirmation.",
    "N'inclus jamais un champ non modifié dans patch. N'utilise pas null pour les champs inchangés: omets-les.",
    `Etapes checklist disponibles:\n${getWeddingChecklistLabels()}`,
    "Reponds avec un JSON strict sans markdown.",
    'Schema: {"shouldPropose":boolean,"patch":{"wedding_date":string,"wedding_period_text":string,"city":string,"region":string,"country":string,"guest_count":number,"budget_max":number,"wedding_checklist":{"completed_item_ids":["venue"],"reopened_item_ids":["caterer"]}}}',
    `Profil actuel JSON: ${JSON.stringify(buildProfileBriefWithChecklist(profile))}`
  ].join("\n");
}

function parseProfileUpdateDetectionResponse(content: string): ProfileUpdatePatch | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (!parsed.shouldPropose) return null;

    const patch = parseProfileUpdatePatch(parsed.patch);
    return patch;
  } catch {
    return null;
  }
}

async function applyWeddingProfilePatch(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  profile: Partial<WeddingProfile> | null,
  patch: ProfileUpdatePatch
) {
  const nextWeddingDate = patch.wedding_date !== undefined ? patch.wedding_date : (profile?.wedding_date ?? null);
  const nextWeddingPeriodText =
    patch.wedding_date !== undefined
      ? null
      : patch.wedding_period_text !== undefined
        ? patch.wedding_period_text
        : (profile?.wedding_period_text ?? null);
  const normalizedWeddingDate = patch.wedding_period_text !== undefined ? null : nextWeddingDate;

  const payloadBase = {
    user_id: userId,
    partner_one_name: profile?.partner_one_name ?? null,
    partner_two_name: profile?.partner_two_name ?? null,
    wedding_date: normalizedWeddingDate,
    wedding_period_text: nextWeddingPeriodText,
    city: patch.city !== undefined ? patch.city : (profile?.city ?? null),
    region: patch.region !== undefined ? patch.region : (profile?.region ?? null),
    country: patch.country !== undefined ? patch.country : (profile?.country ?? "France"),
    guest_count: patch.guest_count !== undefined ? patch.guest_count : (profile?.guest_count ?? null),
    budget_min: profile?.budget_min ?? null,
    budget_max: patch.budget_max !== undefined ? patch.budget_max : (profile?.budget_max ?? null),
    style: profile?.style ?? null,
    ceremony_type: profile?.ceremony_type ?? null,
    notes: profile?.notes ?? null
  };
  const payload = {
    ...payloadBase,
    wedding_checklist:
      patch.wedding_checklist !== undefined
        ? applyWeddingChecklistPatch(profile?.wedding_checklist, patch.wedding_checklist)
        : normalizeWeddingChecklist(profile?.wedding_checklist)
  };

  let { data, error } = await supabase
    .from("wedding_profiles")
    .upsert(
      weddingChecklistColumnAvailable === false
        ? {
            ...payloadBase,
            profile_completion_score: computeProfileCompletionScore(payloadBase)
          }
        : {
            ...payload,
            profile_completion_score: computeProfileCompletionScore(payload)
          },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error && error.message.includes("wedding_checklist")) {
    weddingChecklistColumnAvailable = false;
    const fallbackResult = await supabase
      .from("wedding_profiles")
      .upsert(
        {
          ...payloadBase,
          profile_completion_score: computeProfileCompletionScore(payloadBase)
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  } else if (!error) {
    weddingChecklistColumnAvailable = true;
  }

  if (error) {
    throw error;
  }

  return data as Partial<WeddingProfile>;
}

function computeProfileCompletionScore(payload: Record<string, unknown>) {
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

function detectLocationPatchFromSearchRequest(profile: Partial<WeddingProfile> | null, userText: string, category: VendorCategory): ProfileUpdatePatch | null {
  const requestedLocation = extractRequestedSearchLocation(userText, category);
  if (!requestedLocation) return null;

  if (profileLocationMatches(profile, requestedLocation)) {
    return null;
  }

  return {
    city: requestedLocation
  };
}

function extractRequestedSearchLocation(userText: string, category: VendorCategory) {
  const categoryPatterns: Record<VendorCategory, string[]> = {
    venue: ["lieu", "domaine", "salle", "chateau", "château", "manoir"],
    caterer: ["traiteur", "restauration", "repas", "cocktail", "brunch"],
    photographer: ["photographe", "photo"],
    videographer: ["videaste", "vidéaste", "video", "vidéo"],
    dj: ["dj"],
    musician: ["musicien", "groupe", "orchestre", "chanteur", "musique"],
    decor: ["deco", "déco", "decoration", "décoration", "scenographie", "scénographie"],
    dress: ["robe"],
    suit: ["costume"],
    flowers: ["fleuriste", "fleurs", "floral"],
    transport: ["transport", "navette", "voiture", "chauffeur"]
  };

  const escapedTerms = categoryPatterns[category].map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(?:${escapedTerms.join("|")})[^.!?\\n,;:]{0,40}?\\b(?:a|à|en|dans)\\s+([^,.!?\\n;:]+)`, "i");
  const match = userText.match(regex);
  if (!match?.[1]) return null;

  const rawLocation = match[1]
    .split(/\b(?:si|pour|avec|mais|plutot|plutôt|style|budget|vers|sur)\b/i)[0]
    .trim()
    .replace(/^la\s+/i, "")
    .replace(/^le\s+/i, "")
    .replace(/^l['’]/i, "")
    .trim();

  if (!rawLocation || rawLocation.split(/\s+/).length > 6) return null;

  return formatDisplayLocation(rawLocation);
}

function profileLocationMatches(profile: Partial<WeddingProfile> | null, requestedLocation: string) {
  const normalizedRequested = normalizeLocationKey(requestedLocation);
  return [profile?.city, profile?.region, profile?.country]
    .filter(Boolean)
    .some((value) => {
      const normalizedValue = normalizeLocationKey(value as string);
      return normalizedValue === normalizedRequested || normalizedValue.includes(normalizedRequested) || normalizedRequested.includes(normalizedValue);
    });
}

function buildProfileUpdateSummary(profile: Partial<WeddingProfile> | null, patch: ProfileUpdatePatch) {
  const parts: string[] = [];

  if (patch.wedding_date) {
    parts.push(`la date du mariage passe au ${formatWeddingDateLabel(patch.wedding_date)}`);
  } else if (patch.wedding_period_text) {
    parts.push(`la période visée passe à ${patch.wedding_period_text}`);
  }

  const nextLocation = patch.city ?? patch.region ?? patch.country;
  if (nextLocation && !profileLocationMatches(profile, nextLocation)) {
    parts.push(`le lieu du mariage passe à ${nextLocation}`);
  }

  if (typeof patch.guest_count === "number") {
    parts.push(`le nombre d'invités passe à ${patch.guest_count}`);
  }

  if (typeof patch.budget_max === "number") {
    parts.push(`le budget passe à ${patch.budget_max.toLocaleString("fr-FR")} €`);
  }

  if (patch.wedding_checklist) {
    const labels = getChecklistPatchLabels(patch.wedding_checklist);
    parts.push(...labels);
  }

  if (parts.length === 0) return null;

  const [first, ...rest] = parts;
  return [capitalizeSentence(first), ...rest].join(", ");
}

function getChecklistPatchLabels(patch: WeddingChecklistPatch) {
  const labelsById = new Map(normalizeWeddingChecklist(null).map((item) => [item.id, item.title]));
  const completed = (patch.completed_item_ids ?? [])
    .map((id) => labelsById.get(id))
    .filter((label): label is string => Boolean(label))
    .map((label) => `l'étape "${label}" est cochée`);
  const reopened = (patch.reopened_item_ids ?? [])
    .map((id) => labelsById.get(id))
    .filter((label): label is string => Boolean(label))
    .map((label) => `l'étape "${label}" est remise à faire`);

  return [...completed, ...reopened];
}

function formatWeddingDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris"
    }).format(date);
  }

  return value;
}

function capitalizeSentence(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function normalizeLocationKey(value: string) {
  return normalizeText(value)
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDisplayLocation(value: string) {
  const normalized = normalizeLocationKey(value);
  if (normalized === "ile de france") return "Île-de-France";
  if (normalized === "provence alpes cote d azur") return "Provence-Alpes-Côte d'Azur";

  return value
    .split(/\s+/)
    .map((word) => (word.length <= 2 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ")
    .replace(/\bDe\b/g, "de")
    .replace(/\bDu\b/g, "du")
    .replace(/\bDes\b/g, "des");
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

async function runModelChat(input: {
  task: AiTask;
  systemPrompt: string;
  historyForModel: ChatMessage[];
  maxTokens: number;
  temperature: number;
  extraUserInstruction?: string;
  historyWindows?: number[];
  timeoutMs?: number;
}) {
  const historyWindows = input.historyWindows ?? [8];
  const timeoutMs = input.timeoutMs ?? 8000;
  const providers = getProviderOrderForTask(input.task);

  for (const provider of providers) {
    for (const historyWindow of historyWindows) {
      const recentHistory = historyWindow === 0 ? [] : input.historyForModel.slice(-historyWindow);
      const messages: AiChatMessage[] = [
        { role: "system", content: input.systemPrompt },
        ...recentHistory.map((message) => ({
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

      try {
        const content = await fetchModelContent({
          provider,
          messages,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          timeoutMs,
          historyWindow
        });

        if (content) return content;

        console.warn("AI chat request returned empty content", { provider, historyWindow, task: input.task });
      } catch (error) {
        console.warn("AI chat request threw", {
          provider,
          historyWindow,
          task: input.task,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }

  return null;
}

function getProviderOrderForTask(task: AiTask): AiProvider[] {
  const preferred: AiProvider[] = (() => {
    switch (task) {
      case "profile_update_detection":
        return ["google", "mistral"];
      case "planner":
      case "recovery":
      case "announcement":
        return ["mistral", "google"];
    }
  })();

  return preferred.filter((provider) => (provider === "google" ? Boolean(env.googleApiKey) : Boolean(env.mistralApiKey)));
}

async function fetchModelContent(input: {
  provider: AiProvider;
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  historyWindow: number;
}) {
  if (input.provider === "google") return fetchGoogleGenerateContent(input);
  return fetchMistralChatContent(input);
}

async function fetchMistralChatContent(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  historyWindow: number;
}) {
  const response = await fetchMistralChatCompletion(input);
  if (!response.ok) {
    console.warn("Mistral chat request failed", {
      status: response.status,
      historyWindow: input.historyWindow
    });
    return null;
  }

  const result = await response.json();
  return result?.choices?.[0]?.message?.content?.trim() || null;
}

async function fetchMistralChatCompletion(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  historyWindow: number;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForMistralRequestSlot();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.mistralApiKey}`
        },
        body: JSON.stringify({
          model: env.mistralModel,
          temperature: input.temperature,
          max_tokens: Math.max(input.maxTokens, 64),
          messages: input.messages
        }),
        signal: controller.signal
      });

      if (response.status === 429 && attempt === 0) {
        console.warn("Mistral chat request rate limited, retrying once", { historyWindow: input.historyWindow });
        await sleep(MISTRAL_RATE_LIMIT_RETRY_MS);
        continue;
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  return new Response(null, { status: 429 });
}

async function fetchGoogleGenerateContent(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  historyWindow: number;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForGoogleRequestSlot();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.googleModel}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.googleApiKey
        },
        body: JSON.stringify(buildGoogleGenerateContentBody(input)),
        signal: controller.signal
      });

      if (response.status === 429 && attempt === 0) {
        console.warn("Google chat request rate limited, retrying once", { historyWindow: input.historyWindow });
        await sleep(GOOGLE_RATE_LIMIT_RETRY_MS);
        continue;
      }

      if (!response.ok) {
        console.warn("Google chat request failed", {
          status: response.status,
          historyWindow: input.historyWindow
        });
        return null;
      }

      const result = await response.json();
      if (!isGoogleResponseComplete(result)) return null;
      return readGoogleText(result);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function buildGoogleGenerateContentBody(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
}) {
  const systemPrompt = input.messages.find((message) => message.role === "system")?.content ?? "";
  const contents = input.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));

  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "Exécute les consignes du système et réponds uniquement avec le contenu demandé." }]
    });
  }

  return {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: Math.max(input.maxTokens, 64),
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  };
}

function isGoogleResponseComplete(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== "object") return false;
  const finishReason = (first as Record<string, unknown>).finishReason;
  return !finishReason || finishReason === "STOP";
}

function readGoogleText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== "object") return null;
  const content = (first as Record<string, unknown>).content;
  if (!content || typeof content !== "object") return null;
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return null;

  const text = parts
    .map((part) => (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? ((part as Record<string, unknown>).text as string) : ""))
    .join("")
    .trim();

  return text || null;
}

async function waitForMistralRequestSlot() {
  const previous = mistralStartQueue;
  let release: () => void = () => {};
  mistralStartQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    const delayMs = Math.max(0, nextMistralRequestAt - Date.now());
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    nextMistralRequestAt = Date.now() + MISTRAL_MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

async function waitForGoogleRequestSlot() {
  const previous = googleStartQueue;
  let release: () => void = () => {};
  googleStartQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    const delayMs = Math.max(0, nextGoogleRequestAt - Date.now());
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    nextGoogleRequestAt = Date.now() + GOOGLE_MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

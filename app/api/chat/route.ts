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
    const forceSearch = Boolean(pendingIntake && pendingIntake.exchanges >= 1);
    const mistralText = await runMistralChat({
      systemPrompt: buildPlannerSystemPrompt(profile, historyForModel, plannerContext),
      historyForModel,
      maxTokens: 1024,
      temperature: 0.35,
      extraUserInstruction: buildCollectionInstruction({ profile, pendingIntake, userText: content, forceSearch })
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
    const category =
      parsed.state.category ??
      pendingIntake?.category ??
      normalizeSearchCategory(pendingIntake?.initialMessage) ??
      normalizeSearchCategory(content) ??
      inferCategoryFromHistory(history);
    const shouldSearch = Boolean(category && (pendingIntake || parsed.state.status === "ready" || forceSearch || looksLikeSearchLaunch(parsed.displayText)));

    if (!shouldSearch) {
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: parsed.displayText,
        metadata: buildPendingSearchMetadata({ ...parsed.state, category: category ?? null }, content, pendingIntake)
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

    return performSearchWorkflow({
      supabase,
      userId: user.id,
      conversationId: conversation.id,
      profile,
      search: buildSearchPayloadFromState({ ...parsed.state, category }, content, profile, pendingIntake)
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
      category: normalizeSearchCategory(readString(value.category)),
      style: readString(value.style),
      constraints: readString(value.constraints),
      budget: readString(value.budget),
      searchQuery: readString(value.searchQuery),
      initialMessage: readString(value.initialMessage),
      exchanges: typeof value.exchanges === "number" ? value.exchanges : 1
    };
  }

  return null;
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
  userText: string;
  forceSearch: boolean;
}) {
  return [
    "Contexte serveur pour Hada.",
    `Profil couple JSON : ${JSON.stringify(buildProfileBrief(input.profile))}`,
    `Collecte en cours JSON : ${JSON.stringify(input.pendingIntake ? toPendingBrief(input.pendingIntake) : null)}`,
    `forceSearch: ${input.forceSearch}`,
    `Dernier message couple : ${input.userText}`,
    input.forceSearch
      ? "Tu dois répondre avec status ready dans HADA_STATE, annoncer naturellement que tu lances la recherche, et ne poser aucune question."
      : "Si le type de prestataire est clair et qu'il n'y a pas de collecte en cours, pose une seule question humaine sur l'envie principale. Si une collecte est déjà en cours, réponds avec status ready.",
    "Ne présente aucun prestataire dans le chat."
  ].join("\n");
}

function parseHadaState(content: string): { displayText: string; state: HadaState } {
  const match = content.match(/HADA_STATE::(\{[\s\S]*\})\s*$/);
  const emptyState: HadaState = {
    status: "clarify",
    category: null,
    style: null,
    constraints: null,
    budget: null,
    searchQuery: null
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
        category: normalizeSearchCategory(readString(raw.category)),
        style: readString(raw.style),
        constraints: readString(raw.constraints),
        budget: readString(raw.budget),
        searchQuery: readString(raw.search_query) ?? readString(raw.searchQuery)
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
  const location = profile?.city ?? profile?.region ?? profile?.country ?? null;
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

function looksLikeSearchLaunch(value: string) {
  const normalized = normalizeText(value);
  return /(je lance|je vais chercher|je cherche|je pars|je fouille|je deniche|je m y mets|je reviens tres vite|je vous reviens)/.test(normalized);
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

  if (!response.ok) return null;

  const result = await response.json();
  return result?.choices?.[0]?.message?.content?.trim() ?? null;
}

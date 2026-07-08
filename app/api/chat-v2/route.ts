import { NextRequest, NextResponse } from "next/server";
import { getBudgetAllocationForVendorCategory } from "@/lib/budget";
import { env, validateServerEnv } from "@/lib/env";
import { buildWeddingSummary } from "@/lib/prompts";
import {
  buildRetrySearchPayload,
  buildSearchCta,
  createSearchResultsForUser,
  getMostRecentRetryableSearch,
  getVendorCategoryLabel,
  insertConversationMessage,
  listConversationMessages,
  type SearchReadyPayload
} from "@/lib/server/hada";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyWeddingChecklistPatch, normalizeWeddingChecklist } from "@/lib/wedding-checklist";
import type { UiChatMessage, VendorCategory, WeddingChecklistPatch, WeddingProfile } from "@/lib/types";
import {
  applyExecutionGate,
  buildHadaTurnPrompt,
  buildHadaVisibleReplyPrompt,
  decisionToIntentClassification,
  heuristicClassificationV2,
  isAffirmativeReply,
  isNegativeReply,
  normalizeSearchBrief,
  parseHadaDecisionResponse,
  SUPPORTED_CATEGORY_LABELS,
  type IntentClassification,
  type PendingProposalSnapshot,
  type PendingSearchSnapshot,
  type ProfileUpdatePatch,
  type VendorSearchBrief
} from "@/lib/server/chat-v2/contracts";

type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AiProvider = "google" | "mistral";
type AiTask = "turn" | "reply" | "search_announcement";

type PendingV2Search = {
  messageId: string;
  metadata: Record<string, unknown>;
  brief: VendorSearchBrief;
  initialMessage: string;
  turns: number;
};

type PendingV2SearchProposal = {
  messageId: string;
  metadata: Record<string, unknown>;
  brief: VendorSearchBrief;
  initialMessage: string | null;
};

type PendingV2ProfileUpdate = {
  messageId: string;
  metadata: Record<string, unknown>;
  patch: ProfileUpdatePatch;
  summary: string;
  searchBrief: VendorSearchBrief | null;
  initialMessage: string | null;
};

type ChatV2FallbackContext = {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  conversationId: string;
};

// Vercel : la recherche prestataire (SERP + scrapes 20 s + relance étendue) peut
// dépasser le timeout par défaut des fonctions serverless.
export const maxDuration = 60;

const CHAT_V2_STATUS = "chat_v2_active";
const GOOGLE_MIN_REQUEST_INTERVAL_MS = 450;
const GOOGLE_RATE_LIMIT_RETRY_MS = 1100;
const MISTRAL_MIN_REQUEST_INTERVAL_MS = 650;
const MISTRAL_RATE_LIMIT_RETRY_MS = 1400;

let nextGoogleRequestAt = 0;
let googleStartQueue: Promise<void> = Promise.resolve();
let nextMistralRequestAt = 0;
let mistralStartQueue: Promise<void> = Promise.resolve();

export async function GET(request: NextRequest) {
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: authError }, { status: 401 });

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const conversation = await ensureChatV2Conversation(supabase, user.id, profile);
    const messages = await listConversationMessages(supabase, conversation.id);

    return NextResponse.json({
      conversationId: conversation.id,
      messages,
      profile,
      engine: "chat-v2"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let fallbackContext: ChatV2FallbackContext | null = null;

  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: authError }, { status: 401 });

    const body = await request.json();
    const isRetrySearch = body.action === "retry_search";
    const content = isRetrySearch ? "Relance la recherche avec des critères élargis." : typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const conversation = await ensureChatV2Conversation(supabase, user.id, profile);
    fallbackContext = { supabase, conversationId: conversation.id };

    await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "user",
      content
    });

    const pendingProfileUpdate = await getPendingV2ProfileUpdate(supabase, conversation.id);
    if (pendingProfileUpdate) {
      return handlePendingV2ProfileUpdate({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        userText: content,
        pending: pendingProfileUpdate
      });
    }

    if (isRetrySearch) {
      const retrySearch = await getMostRecentRetryableSearch(supabase, user.id);
      if (!retrySearch) {
        const assistantMessage = await insertConversationMessage(supabase, {
          conversationId: conversation.id,
          role: "assistant",
          content: "Je n'ai pas retrouvé de recherche à relancer. Dites-moi simplement le type de prestataire souhaité, et je repars proprement."
        });

        return jsonChatResponse(conversation.id, assistantMessage, 0);
      }

      return performVendorSearchV2({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        brief: normalizeSearchBrief(buildRetrySearchPayload(retrySearch, profile)),
        userText: content,
        searchOptions: {
          skipCache: true,
          expandedOnly: true,
          trackQuota: false
        },
        finalFallback: true
      });
    }

    const messages = await listConversationMessages(supabase, conversation.id);
    const storedPendingSearch = await getPendingV2Search(supabase, conversation.id);
    const storedPendingProposal = await getPendingV2SearchProposal(supabase, conversation.id);
    const pendingSearchSnapshot: PendingSearchSnapshot = storedPendingSearch
      ? { brief: storedPendingSearch.brief, initialMessage: storedPendingSearch.initialMessage, turns: storedPendingSearch.turns }
      : null;
    const pendingProposalSnapshot: PendingProposalSnapshot = storedPendingProposal
      ? { brief: storedPendingProposal.brief, initialMessage: storedPendingProposal.initialMessage }
      : null;

    const classification = applyExecutionGate(
      await classifyTurnV2({
        userText: content,
        messages,
        profile,
        pendingSearch: pendingSearchSnapshot,
        pendingProposal: pendingProposalSnapshot
      }),
      {
        userText: content,
        pendingSearch: pendingSearchSnapshot,
        pendingProposal: pendingProposalSnapshot
      }
    );

    const isSearchFamilyIntent =
      classification.intent === "search_request" || classification.intent === "search_detail" || classification.intent === "confirm";

    // Clôture des états : une collecte ne se ferme que sur refus explicite.
    // Un tour advice/chat au milieu d'une collecte (question de conseil, digression)
    // ne la détruit pas : le couple peut répondre aux critères juste après.
    if (storedPendingSearch && classification.intent === "deny") {
      await clearPendingV2Search(supabase, storedPendingSearch);
    }
    if (storedPendingProposal && (isSearchFamilyIntent || classification.intent === "deny" || classification.proposeSearch)) {
      await clearPendingV2SearchProposal(supabase, storedPendingProposal);
    }

    // Brief effectif : proposition/collecte en attente enrichie par ce que le LLM a extrait du tour.
    const activeBrief = classification.intent === "search_detail"
      ? (storedPendingSearch?.brief ?? storedPendingProposal?.brief ?? null)
      : (storedPendingProposal?.brief ?? storedPendingSearch?.brief ?? null);
    const mergedBrief = isSearchFamilyIntent ? mergeSearchBriefs(activeBrief, classification.vendorSearch) : classification.vendorSearch;

    const profilePatchFromSearch = isSearchFamilyIntent && mergedBrief?.category
      ? detectProfilePatchFromSearchLocation(profile, mergedBrief)
      : null;
    const profilePatch = mergeProfileUpdatePatches(classification.profilePatch, profilePatchFromSearch);

    if (profilePatch && classification.intent !== "unclear") {
      const summary = buildProfileUpdateSummary(profile, profilePatch) ?? classification.profileSummary ?? "des informations de votre mariage changent";
      const searchBrief = isSearchFamilyIntent ? mergedBrief : null;
      const visible = await generateVisibleMessage({
        task: "reply",
        systemPrompt: buildChatV2VisibleReplyPrompt(),
        maxTokens: 180,
        temperature: 0.35,
        instruction: [
          "Rédige une question courte en français pour demander au couple s'il valide la mise à jour du profil avant d'aller plus loin.",
          "Ne mentionne aucun outil, aucune API, aucun backend.",
          `Mise à jour détectée : ${summary}`,
          `Profil actuel : ${buildWeddingSummary(profile)}`,
          searchBrief?.category ? "La recherche prestataire reprendra automatiquement après validation." : "Il n'y a pas de recherche prestataire à lancer pour l'instant."
        ].join("\n")
      });

      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: visible ?? `Je vois une mise à jour à faire : ${summary}. Souhaitez-vous que je mette votre profil mariage à jour ?`,
        metadata: {
          chatV2PendingProfileUpdate: {
            status: "awaiting_confirmation",
            patch: profilePatch,
            summary,
            searchBrief,
            initialMessage: content
          }
        }
      });

      return jsonChatResponse(conversation.id, assistantMessage, 0);
    }

    if (isSearchFamilyIntent && mergedBrief) {
      return handleVendorSearchV2({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        userText: content,
        brief: mergedBrief,
        pendingSearch: storedPendingSearch,
        initialMessage: storedPendingSearch?.initialMessage ?? storedPendingProposal?.initialMessage ?? null
      });
    }

    if (classification.proposeSearch) {
      const proposalBrief = mergeSearchBriefs(storedPendingProposal?.brief ?? null, classification.vendorSearch);
      const reply = usableDecisionReply(classification.reply) ?? buildSearchProposalFallback(proposalBrief);
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        metadata: {
          chatV2PendingSearchProposal: {
            status: "proposed",
            brief: proposalBrief,
            initialMessage: content
          }
        }
      });

      return jsonChatResponse(conversation.id, assistantMessage, 0);
    }

    if (classification.intent === "deny") {
      const reply =
        usableDecisionReply(classification.reply) ??
        "D'accord, on laisse ça de côté pour l'instant. Dites-moi ce que vous voulez faire avancer pour votre mariage.";
      const assistantMessage = await insertConversationMessage(supabase, {
        conversationId: conversation.id,
        role: "assistant",
        content: reply
      });

      return jsonChatResponse(conversation.id, assistantMessage, 0);
    }

    // advice / chat / unclear : la réponse du tour vient du même appel LLM.
    const reply =
      usableDecisionReply(classification.reply) ??
      (await generateAdviceReplyFallback({ userText: content, profile, messages, classification })) ??
      buildUnsupportedCategoryReply(classification) ??
      buildChatV2ReplyFallback(content, Boolean(storedPendingSearch));

    const assistantMessage = await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "assistant",
      content: reply
    });

    return jsonChatResponse(conversation.id, assistantMessage, 0);
  } catch (error) {
    console.error("Chat V2 POST failed", error);
    const recoveredResponse = await createChatV2FallbackResponse(fallbackContext, error);
    if (recoveredResponse) return recoveredResponse;
    return NextResponse.json({ error: "chat_v2_unavailable" }, { status: 500 });
  }
}

async function createChatV2FallbackResponse(context: ChatV2FallbackContext | null, error: unknown) {
  if (!context) return null;

  try {
    const assistantMessage = await insertConversationMessage(context.supabase, {
      conversationId: context.conversationId,
      role: "assistant",
      content:
        "Je n'ai pas pu finaliser ma réponse correctement, mais je garde le fil. Dites-moi en une phrase ce que vous voulez faire avancer, et je reprends proprement.",
      metadata: {
        chatV2Fallback: {
          status: "server_recovered",
          at: new Date().toISOString(),
          reason: error instanceof Error ? error.name : "unknown_error"
        }
      }
    });

    return jsonChatResponse(context.conversationId, assistantMessage, 0);
  } catch (fallbackError) {
    console.error("Chat V2 fallback response failed", fallbackError);
    return null;
  }
}

async function handleVendorSearchV2(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  conversationId: string;
  profile: Partial<WeddingProfile> | null;
  userText: string;
  brief: VendorSearchBrief;
  pendingSearch: PendingV2Search | null;
  initialMessage?: string | null;
}) {
  const turns = input.pendingSearch ? input.pendingSearch.turns + 1 : 0;
  const initialMessage = input.initialMessage ?? input.pendingSearch?.initialMessage ?? input.userText;
  const missing = findMissingSearchFields(input.brief, input.profile, turns);

  if (missing.length > 0) {
    const question = await generateSearchClarificationQuestion({
      profile: input.profile,
      brief: input.brief,
      missing
    });

    if (input.pendingSearch) await clearPendingV2Search(input.supabase, input.pendingSearch);

    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: question,
      metadata: {
        chatV2PendingSearch: {
          status: "collecting",
          brief: input.brief,
          initialMessage,
          turns
        }
      }
    });

    return jsonChatResponse(input.conversationId, assistantMessage, 0);
  }

  if (input.pendingSearch) await clearPendingV2Search(input.supabase, input.pendingSearch);

  return performVendorSearchV2({
    supabase: input.supabase,
    userId: input.userId,
    conversationId: input.conversationId,
    profile: input.profile,
    brief: input.brief,
    userText: [initialMessage !== input.userText ? initialMessage : null, input.userText].filter(Boolean).join(" ")
  });
}

async function performVendorSearchV2(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  conversationId: string;
  profile: Partial<WeddingProfile> | null;
  brief: VendorSearchBrief;
  userText: string;
  introMessage?: string | null;
  extraMetadata?: Record<string, unknown> | null;
  searchOptions?: {
    skipCache?: boolean;
    expandedOnly?: boolean;
    trackQuota?: boolean;
  } | null;
  finalFallback?: boolean;
}) {
  const search = buildSearchReadyPayload(input.brief, input.profile, input.userText);
  let searchResults: Awaited<ReturnType<typeof createSearchResultsForUser>>;
  try {
    searchResults = await createSearchResultsForUser(input.supabase, {
      userId: input.userId,
      conversationId: input.conversationId,
      profile: input.profile,
      search,
      options: {
        trackQuota: false,
        ...(input.searchOptions ?? {})
      }
    });
  } catch (error) {
    console.error("Chat V2 vendor search failed", {
      category: search.category,
      error: error instanceof Error ? error.message : "Unknown error"
    });

    const categoryLabel = getVendorCategoryLabel(search.category, 2);
    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: [
        input.introMessage,
        `La recherche de ${categoryLabel} a été interrompue avant de produire des fiches fiables. Je garde la demande en tête : vous pouvez relancer une recherche élargie, ou préciser un style, un lieu ou une contrainte pour repartir plus finement.`
      ]
        .filter(Boolean)
        .join("\n\n"),
      metadata: {
        ...(input.extraMetadata ?? {}),
        ...buildSearchRecoveryCta(),
        // La demande reste ouverte : le prochain critère du couple relance la recherche.
        ...buildPostFailureCollectMetadata(input.brief, input.userText),
        chatV2SearchError: {
          category: search.category,
          at: new Date().toISOString()
        }
      }
    });

    return jsonChatResponse(input.conversationId, assistantMessage, 0);
  }

  const hasResults = searchResults.candidates.length > 0;
  const categoryLabel = getVendorCategoryLabel(search.category, searchResults.candidates.length || 2);
  const announcement = await generateVisibleMessage({
    task: "search_announcement",
    systemPrompt: buildChatV2VisibleReplyPrompt(),
    maxTokens: 190,
    temperature: 0.45,
    instruction: [
      "Écris directement le message final affiché au couple pour annoncer le résultat d'une recherche de prestataires. Tu es Hada et tu parles à la première personne.",
      "INTERDIT : préambule ou mise en scène (« Voici un petit mot... »), guillemets autour du message, mention ou description d'un bouton, didascalie entre parenthèses, prénoms du couple en en-tête.",
      "Ne cite aucun nom de prestataire.",
      "Ne mentionne jamais Firecrawl, scraping, Supabase, Mistral, Google, API, quota ou backend.",
      `Profil : ${buildWeddingSummary(input.profile)}`,
      `Type de prestataire : ${categoryLabel}`,
      `Nombre de fiches fiables créées : ${searchResults.candidates.length}`,
      hasResults
        ? "Dis que les fiches sont prêtes à consulter juste en dessous (un bouton s'affiche automatiquement sous ton message, ne le décris pas)."
        : "Dis que Hada n'a pas encore assez d'éléments fiables et invite à ajuster la demande."
    ].join("\n")
  });

  const content = [input.introMessage, announcement ?? buildSearchAnnouncementFallback(categoryLabel, hasResults)]
    .filter(Boolean)
    .join("\n\n");
  const metadata = {
    ...(input.extraMetadata ?? {}),
    ...(hasResults
      ? buildSearchCta(search.category)
      : {
          ...buildSearchRecoveryCta(searchResults.externalSearchUrl, input.finalFallback === true),
          // Sans résultat, Hada pose une question d'affinage : la collecte doit être
          // réellement ouverte côté serveur pour que la réponse du couple
          // (« plutôt naturel », « budget 2000 € »...) relance la recherche.
          ...buildPostFailureCollectMetadata(input.brief, input.userText)
        })
  };
  const assistantMessage = await insertConversationMessage(input.supabase, {
    conversationId: input.conversationId,
    role: "assistant",
    content,
    metadata
  });

  return jsonChatResponse(input.conversationId, assistantMessage, searchResults.candidates.length);
}

async function handlePendingV2ProfileUpdate(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  conversationId: string;
  profile: Partial<WeddingProfile> | null;
  userText: string;
  pending: PendingV2ProfileUpdate;
}) {
  if (isAffirmativeReply(input.userText)) {
    const nextProfile = await applyWeddingProfilePatch(input.supabase, input.userId, input.profile, input.pending.patch);
    await clearPendingV2ProfileUpdate(input.supabase, input.pending);
    const profileChangeMetadata = buildProfileChangeMetadata(input.profile, input.pending.patch, input.pending.summary);

    const intro = await generateVisibleMessage({
      task: "reply",
      systemPrompt: buildChatV2VisibleReplyPrompt(),
      maxTokens: 120,
      temperature: 0.35,
      instruction: [
        "Confirme en une phrase que le profil mariage est bien mis à jour.",
        `Mise à jour : ${input.pending.summary}`
      ].join("\n")
    });

    if (input.pending.searchBrief?.category) {
      return performVendorSearchV2({
        supabase: input.supabase,
        userId: input.userId,
        conversationId: input.conversationId,
        profile: nextProfile,
        brief: input.pending.searchBrief,
        userText: input.pending.initialMessage ?? input.userText,
        introMessage: intro,
        extraMetadata: profileChangeMetadata
      });
    }

    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: intro ?? `C'est noté, votre profil mariage est bien mis à jour : ${input.pending.summary}.`,
      metadata: profileChangeMetadata
    });
    return jsonChatResponse(input.conversationId, assistantMessage, 0);
  }

  if (isNegativeReply(input.userText)) {
    await clearPendingV2ProfileUpdate(input.supabase, input.pending);
    const assistantMessage = await insertConversationMessage(input.supabase, {
      conversationId: input.conversationId,
      role: "assistant",
      content: "D'accord, je ne modifie pas votre profil. Dites-moi simplement ce que vous voulez faire ensuite pour votre mariage."
    });
    return jsonChatResponse(input.conversationId, assistantMessage, 0);
  }

  const assistantMessage = await insertConversationMessage(input.supabase, {
    conversationId: input.conversationId,
    role: "assistant",
    content: "Je préfère sécuriser votre profil : répondez simplement oui ou non pour valider cette mise à jour."
  });
  return jsonChatResponse(input.conversationId, assistantMessage, 0);
}

async function ensureChatV2Conversation(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  profile: Partial<WeddingProfile> | null
) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", CHAT_V2_STATUS)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: "Conversation Hada V2",
      status: CHAT_V2_STATUS
    })
    .select("*")
    .single();

  if (error) throw error;

  await insertConversationMessage(supabase, {
    conversationId: data.id,
    role: "assistant",
    content: buildChatV2Welcome(profile)
  });

  return data;
}

function buildChatV2Welcome(profile: Partial<WeddingProfile> | null) {
  return [
    "Bienvenue, je suis Hada, votre wedding planner.",
    `Je peux vous conseiller, mettre à jour votre profil mariage, et chercher des prestataires dès que vous me le demandez — ou vous le proposer quand je sens que c'est le moment. ${buildWeddingSummary(profile)}`
  ].join("\n\n");
}

async function classifyTurnV2(input: {
  userText: string;
  messages: UiChatMessage[];
  profile: Partial<WeddingProfile> | null;
  pendingSearch: PendingSearchSnapshot;
  pendingProposal: PendingProposalSnapshot;
}): Promise<IntentClassification> {
  const prompt = buildHadaTurnPrompt({
    profileSummary: buildWeddingSummary(input.profile),
    messages: input.messages,
    pendingSearch: input.pendingSearch,
    pendingProposal: input.pendingProposal
  });
  const decision = await generateStructuredHadaDecision({
    systemPrompt: prompt,
    instruction: input.userText
  });

  return decision
    ? decisionToIntentClassification(decision, {
        userText: input.userText,
        pendingSearch: input.pendingSearch,
        pendingProposal: input.pendingProposal
      })
    : heuristicClassificationV2(input.userText, input.pendingSearch, input.pendingProposal);
}

async function generateStructuredHadaDecision(input: {
  systemPrompt: string;
  instruction: string;
}) {
  const providers = getProviderOrderForTask("turn");
  for (const provider of providers) {
    try {
      const result = await fetchModelContent({
        provider,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.instruction }
        ],
        maxTokens: 700,
        temperature: 0.2,
        timeoutMs: 9000,
        jsonMode: true
      });
      const decision = parseHadaDecisionResponse(result);
      if (decision) return decision;
    } catch (error) {
      console.warn("Chat V2 decision call failed", {
        provider,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return null;
}

/**
 * Voie de secours quand le LLM n'a pas fourni de reply exploitable dans la décision
 * (JSON tronqué, ou classification heuristique). Contrairement à l'ancienne version,
 * l'historique récent est transmis au modèle.
 */
async function generateAdviceReplyFallback(input: {
  userText: string;
  profile: Partial<WeddingProfile> | null;
  messages: UiChatMessage[];
  classification: IntentClassification;
}) {
  const recent = input.messages
    .slice(-8)
    .map((message) => `${message.role === "user" ? "Couple" : "Hada"}: ${message.content.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");

  return generateVisibleMessage({
    task: "reply",
    systemPrompt: buildChatV2VisibleReplyPrompt(),
    maxTokens: 260,
    temperature: 0.45,
    instruction: [
      "Réponds au dernier message du couple en tenant compte de l'historique.",
      "Si le message est hors sujet, réponds brièvement puis ramène doucement vers le mariage.",
      "Si le message est ambigu ou très faible, demande ce que le couple veut faire avancer pour le mariage.",
      "Si c'est une question mariage, réponds utilement sans lancer de recherche prestataire.",
      "Si le couple demande si Hada est une IA ou une vraie personne, réponds clairement que Hada est une assistante IA pensée pour accompagner l'organisation du mariage, sans prétendre être une personne humaine réelle.",
      "Si l'intention serveur est advice, réponds en conseil/méthode/critères sans dire qu'une recherche est lancée.",
      "Ne mentionne jamais de JSON, d'intention, de modèle ou d'outil.",
      `Profil : ${buildWeddingSummary(input.profile)}`,
      `Intention serveur : ${input.classification.intent}`,
      `Historique récent :\n${recent || "Aucun."}`,
      `Dernier message : ${input.userText}`
    ].join("\n")
  });
}

function buildChatV2VisibleReplyPrompt() {
  return buildHadaVisibleReplyPrompt();
}

function buildChatV2ReplyFallback(userText: string, hasOpenSearch = false) {
  if (isAssistantIdentityQuestion(userText)) {
    return "Je suis Hada, une assistante IA pensée pour vous accompagner dans l'organisation de votre mariage. Je ne suis pas une personne humaine réelle, mais je peux vous aider à clarifier vos choix, structurer vos étapes et lancer des recherches quand vous me le demandez clairement.";
  }

  if (hasOpenSearch) {
    return "Bien noté. Donnez-moi un critère de plus — un style, un budget, une zone ou une contrainte — et je relance la recherche aussitôt.";
  }

  return "Je vous suis. Dites-moi ce que vous voulez faire avancer pour votre mariage, et je vous guide pas à pas.";
}

function buildUnsupportedCategoryReply(classification: IntentClassification) {
  if (classification.reason !== "unsupported_category" || !classification.unsupportedCategoryLabel) return null;
  return [
    `Je ne peux pas encore chercher de ${classification.unsupportedCategoryLabel} pour vous : mes recherches couvrent aujourd'hui ${SUPPORTED_CATEGORY_LABELS}.`,
    "Le plus efficace : demandez des recommandations à votre lieu de réception ou votre photographe, ils travaillent souvent avec des partenaires de confiance."
  ].join(" ");
}

/** Après un échec de recherche, la demande reste ouverte comme collecte : le prochain critère relance. */
function buildPostFailureCollectMetadata(brief: VendorSearchBrief, initialMessage: string) {
  return {
    chatV2PendingSearch: {
      status: "collecting",
      brief,
      initialMessage,
      turns: 0
    }
  };
}

function buildSearchProposalFallback(brief: VendorSearchBrief) {
  const label = brief.category ? getVendorCategoryLabel(brief.category, 2) : "prestataires";
  const where = brief.location ? ` autour de ${brief.location}` : "";
  return `Je peux m'en occuper : voulez-vous que je lance une recherche de ${label}${where} ? Répondez simplement oui et je démarre.`;
}

function isAssistantIdentityQuestion(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return false;
  const asksAboutAssistant = /\b(tu es|vous etes|es tu|etes vous|hada est|c est)\b/.test(normalized);
  const mentionsIdentity = /\b(ia|intelligence artificielle|bot|robot|vraie personne|vrai humain|vraie humaine|humain|humaine|personne reelle|personne reel)\b/.test(
    normalized
  );
  return asksAboutAssistant && mentionsIdentity;
}

async function generateSearchClarificationQuestion(input: {
  profile: Partial<WeddingProfile> | null;
  brief: VendorSearchBrief;
  missing: string[];
}) {
  const question = await generateVisibleMessage({
    task: "reply",
    systemPrompt: buildChatV2VisibleReplyPrompt(),
    maxTokens: 160,
    temperature: 0.35,
    instruction: [
      "Pose une seule question naturelle pour compléter une recherche prestataire.",
      "Ne demande jamais au couple de confirmer le lancement de la recherche.",
      "Si le type manque, demande le type de prestataire.",
      "Si le lieu manque, demande le lieu de recherche.",
      "Si seuls les goûts/style manquent, demande l'ambiance ou la priorité principale.",
      `Profil : ${buildWeddingSummary(input.profile)}`,
      `Brief actuel : ${JSON.stringify(input.brief)}`,
      `Champs manquants : ${input.missing.join(", ")}`
    ].join("\n")
  });

  return question ?? "Pour bien cibler, quelle ambiance ou priorité principale voulez-vous pour cette recherche ?";
}

function findMissingSearchFields(brief: VendorSearchBrief, profile: Partial<WeddingProfile> | null, turns: number) {
  const missing: string[] = [];
  if (!brief.category) missing.push("category");
  if (!brief.location && !profile?.city && !profile?.region && !profile?.country) missing.push("location");

  const hasPreference = Boolean(brief.style || brief.constraints || brief.budget || brief.guestCount || profile?.budget_max || profile?.guest_count);
  if (turns === 0 && brief.category && !hasPreference) missing.push("preference");

  return missing;
}

function mergeSearchBriefs(base: VendorSearchBrief | null | undefined, extra: VendorSearchBrief | null | undefined): VendorSearchBrief {
  return normalizeSearchBrief({
    category: extra?.category ?? base?.category ?? null,
    location: extra?.location ?? base?.location ?? null,
    style: extra?.style ?? base?.style ?? null,
    constraints: extra?.constraints ?? base?.constraints ?? null,
    budget: extra?.budget ?? base?.budget ?? null,
    guestCount: extra?.guestCount ?? base?.guestCount ?? null,
    searchQuery: extra?.searchQuery ?? base?.searchQuery ?? null
  });
}

function buildSearchReadyPayload(brief: VendorSearchBrief, profile: Partial<WeddingProfile> | null, userText: string): SearchReadyPayload {
  const category = brief.category ?? "venue";
  const location = brief.location ?? profile?.city ?? profile?.region ?? profile?.country ?? "France";
  const budget = brief.budget ?? getBudgetAllocationForVendorCategory(profile, category)?.hint ?? null;
  const style = brief.style;
  const constraints = brief.constraints;
  const searchQuery = ensureSearchQuery({
    category,
    location,
    style,
    constraints,
    curated: brief.searchQuery,
    raw: userText
  });

  return {
    category,
    location,
    style,
    constraints,
    budget,
    searchQuery
  };
}

/**
 * Construit la requête web envoyée à la recherche prestataire.
 * Priorité à la requête optimisée rédigée par le LLM (search_query) ;
 * sinon composition à partir des champs structurés. La phrase brute du couple
 * n'est utilisée qu'en dernier recours (elle pollue la recherche web).
 */
function ensureSearchQuery(input: {
  category: VendorCategory;
  location: string | null;
  style: string | null;
  constraints: string | null;
  curated: string | null;
  raw: string;
}) {
  if (input.curated) {
    const withMariage = /\bmariage\b/i.test(input.curated) ? input.curated : `${input.curated} mariage`;
    return withMariage.replace(/\s+/g, " ").trim().slice(0, 180);
  }

  const hasStructuredDetails = Boolean(input.style || input.constraints);
  const base = [
    categoryToSearchLabel(input.category),
    "mariage",
    input.location,
    input.style,
    input.constraints,
    hasStructuredDetails ? null : input.raw
  ]
    .filter(Boolean)
    .join(" ");
  return base.replace(/\s+/g, " ").trim().slice(0, 180);
}

function detectProfilePatchFromSearchLocation(profile: Partial<WeddingProfile> | null, brief: VendorSearchBrief): ProfileUpdatePatch | null {
  if (!brief.location || !brief.category) return null;
  if (profileLocationMatches(profile, brief.location)) return null;
  return { city: brief.location };
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

async function getPendingV2Search(supabase: ReturnType<typeof createSupabaseServerClient>, conversationId: string): Promise<PendingV2Search | null> {
  const { data } = await supabase
    .from("messages")
    .select("id, metadata_json")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(12);

  for (const message of data ?? []) {
    const metadata = (message.metadata_json ?? {}) as Record<string, unknown>;
    const pending = metadata.chatV2PendingSearch;
    if (!pending || typeof pending !== "object") continue;
    const value = pending as Record<string, unknown>;
    if (value.status !== "collecting") continue;

    return {
      messageId: message.id,
      metadata,
      brief: normalizeSearchBrief(value.brief as Partial<VendorSearchBrief> | null),
      initialMessage: readString(value.initialMessage) ?? "",
      turns: readNumber(value.turns) ?? 0
    };
  }

  return null;
}

async function clearPendingV2Search(supabase: ReturnType<typeof createSupabaseServerClient>, pending: PendingV2Search) {
  await supabase
    .from("messages")
    .update({
      metadata_json: {
        ...pending.metadata,
        chatV2PendingSearch: {
          ...((pending.metadata.chatV2PendingSearch as Record<string, unknown> | undefined) ?? {}),
          status: "completed"
        }
      }
    })
    .eq("id", pending.messageId);
}

async function getPendingV2SearchProposal(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  conversationId: string
): Promise<PendingV2SearchProposal | null> {
  const { data } = await supabase
    .from("messages")
    .select("id, metadata_json")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(12);

  for (const message of data ?? []) {
    const metadata = (message.metadata_json ?? {}) as Record<string, unknown>;
    const pending = metadata.chatV2PendingSearchProposal;
    if (!pending || typeof pending !== "object") continue;
    const value = pending as Record<string, unknown>;
    if (value.status !== "proposed") continue;

    return {
      messageId: message.id,
      metadata,
      brief: normalizeSearchBrief(value.brief as Partial<VendorSearchBrief> | null),
      initialMessage: readString(value.initialMessage)
    };
  }

  return null;
}

async function clearPendingV2SearchProposal(supabase: ReturnType<typeof createSupabaseServerClient>, pending: PendingV2SearchProposal) {
  await supabase
    .from("messages")
    .update({
      metadata_json: {
        ...pending.metadata,
        chatV2PendingSearchProposal: {
          ...((pending.metadata.chatV2PendingSearchProposal as Record<string, unknown> | undefined) ?? {}),
          status: "resolved"
        }
      }
    })
    .eq("id", pending.messageId);
}

async function getPendingV2ProfileUpdate(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  conversationId: string
): Promise<PendingV2ProfileUpdate | null> {
  const { data } = await supabase
    .from("messages")
    .select("id, metadata_json")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(12);

  for (const message of data ?? []) {
    const metadata = (message.metadata_json ?? {}) as Record<string, unknown>;
    const pending = metadata.chatV2PendingProfileUpdate;
    if (!pending || typeof pending !== "object") continue;
    const value = pending as Record<string, unknown>;
    if (value.status !== "awaiting_confirmation") continue;

    const patch = parseProfilePatch(value.patch);
    if (!patch) continue;

    return {
      messageId: message.id,
      metadata,
      patch,
      summary: readString(value.summary) ?? "mise à jour du profil",
      searchBrief: value.searchBrief ? normalizeSearchBrief(value.searchBrief as Partial<VendorSearchBrief>) : null,
      initialMessage: readString(value.initialMessage)
    };
  }

  return null;
}

async function clearPendingV2ProfileUpdate(supabase: ReturnType<typeof createSupabaseServerClient>, pending: PendingV2ProfileUpdate) {
  await supabase
    .from("messages")
    .update({
      metadata_json: {
        ...pending.metadata,
        chatV2PendingProfileUpdate: {
          ...((pending.metadata.chatV2PendingProfileUpdate as Record<string, unknown> | undefined) ?? {}),
          status: "completed"
        }
      }
    })
    .eq("id", pending.messageId);
}

async function applyWeddingProfilePatch(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  profile: Partial<WeddingProfile> | null,
  patch: ProfileUpdatePatch
) {
  const payload = {
    user_id: userId,
    partner_one_name: profile?.partner_one_name ?? null,
    partner_two_name: profile?.partner_two_name ?? null,
    wedding_date: patch.wedding_date !== undefined ? patch.wedding_date : (profile?.wedding_date ?? null),
    wedding_period_text: patch.wedding_period_text !== undefined ? patch.wedding_period_text : (profile?.wedding_period_text ?? null),
    city: patch.city !== undefined ? patch.city : (profile?.city ?? null),
    region: patch.region !== undefined ? patch.region : (profile?.region ?? null),
    country: patch.country !== undefined ? patch.country : (profile?.country ?? "France"),
    guest_count: patch.guest_count !== undefined ? patch.guest_count : (profile?.guest_count ?? null),
    budget_min: profile?.budget_min ?? null,
    budget_max: patch.budget_max !== undefined ? patch.budget_max : (profile?.budget_max ?? null),
    style: profile?.style ?? null,
    ceremony_type: profile?.ceremony_type ?? null,
    notes: profile?.notes ?? null,
    wedding_budget_overrides: profile?.wedding_budget_overrides ?? null,
    wedding_checklist:
      patch.wedding_checklist !== undefined
        ? applyWeddingChecklistPatch(profile?.wedding_checklist, patch.wedding_checklist)
        : normalizeWeddingChecklist(profile?.wedding_checklist)
  };

  const { data, error } = await supabase
    .from("wedding_profiles")
    .upsert(
      {
        ...payload,
        profile_completion_score: computeProfileCompletionScore(payload)
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as Partial<WeddingProfile>;
}

function parseProfilePatch(value: unknown): ProfileUpdatePatch | null {
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
  const completed = readStringArray(raw.completed_item_ids);
  const reopened = readStringArray(raw.reopened_item_ids);
  const patch: WeddingChecklistPatch = {};
  if (completed.length > 0) patch.completed_item_ids = completed;
  if (reopened.length > 0) patch.reopened_item_ids = reopened;
  return Object.keys(patch).length > 0 ? patch : null;
}

function mergeProfileUpdatePatches(...patches: Array<ProfileUpdatePatch | null>) {
  const merged: ProfileUpdatePatch = {};
  for (const patch of patches) {
    if (!patch) continue;
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === "") continue;
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function buildProfileUpdateSummary(profile: Partial<WeddingProfile> | null, patch: ProfileUpdatePatch) {
  const parts = [
    patch.wedding_date ? `la date du mariage passe au ${patch.wedding_date}` : null,
    patch.wedding_period_text ? `la période du mariage passe à ${patch.wedding_period_text}` : null,
    patch.city && !profileLocationMatches(profile, patch.city) ? `le lieu du mariage passe à ${patch.city}` : null,
    typeof patch.guest_count === "number" ? `le nombre d'invités passe à ${patch.guest_count}` : null,
    typeof patch.budget_max === "number" ? `le budget passe à ${patch.budget_max.toLocaleString("fr-FR")} €` : null,
    patch.wedding_checklist ? "la checklist d'organisation est mise à jour" : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function buildProfileChangeMetadata(profile: Partial<WeddingProfile> | null, patch: ProfileUpdatePatch, summary: string) {
  return {
    chatV2ProfileChangeLog: {
      summary,
      patch,
      previousProfile: {
        wedding_date: profile?.wedding_date ?? null,
        wedding_period_text: profile?.wedding_period_text ?? null,
        city: profile?.city ?? null,
        region: profile?.region ?? null,
        country: profile?.country ?? null,
        guest_count: profile?.guest_count ?? null,
        budget_max: profile?.budget_max ?? null,
        wedding_checklist: normalizeWeddingChecklist(profile?.wedding_checklist).map((item) => ({ id: item.id, done: item.done }))
      },
      confirmedAt: new Date().toISOString()
    }
  };
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

async function generateVisibleMessage(input: {
  task: AiTask;
  systemPrompt: string;
  instruction: string;
  maxTokens: number;
  temperature: number;
}) {
  const providers = getProviderOrderForTask(input.task);
  for (const provider of providers) {
    try {
      const result = await fetchModelContent({
        provider,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.instruction }
        ],
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        timeoutMs: 7000
      });
      const normalizedResult = sanitizeAnnouncementText(sanitizeVisibleModelText(result));
      if (isUsableVisibleModelText(normalizedResult)) return normalizedResult;
    } catch (error) {
      console.warn("Chat V2 model call failed", {
        provider,
        task: input.task,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  return null;
}

function getProviderOrderForTask(task: AiTask): AiProvider[] {
  const configured = parseProviderOrder(process.env.HADA_AI_PROVIDER_ORDER);
  const preferred: AiProvider[] = configured ?? (task === "turn" ? ["mistral", "google"] : ["google", "mistral"]);
  return preferred.filter((provider) => (provider === "google" ? Boolean(env.googleApiKey) : Boolean(env.mistralApiKey)));
}

function parseProviderOrder(value: string | undefined): AiProvider[] | null {
  const providers = (value ?? "")
    .split(/[,;|\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is AiProvider => item === "google" || item === "mistral");

  const uniqueProviders = Array.from(new Set(providers));
  return uniqueProviders.length > 0 ? uniqueProviders : null;
}

function sanitizeVisibleModelText(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^HADA_STATE\s*::\s*\{[\s\S]*?\}\s*/i, "")
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isUsableVisibleModelText(value: string | null) {
  if (!value) return false;
  const normalized = value.trim();
  if (normalized.length < 24) return false;
  if (/^(HADA_STATE|STATE|JSON|```|\{)/i.test(normalized)) return false;
  if (/"intent"\s*:|"tool_calls"\s*:|"profile_updates"\s*:/.test(normalized)) return false;
  if (!/[.!?…😊😉✨🌸]$/.test(normalized)) return normalized.length >= 80;
  return true;
}

/**
 * Nettoie les fuites de mise en scène du modèle dans un message visible :
 * préambule (« Voici un petit mot pour X : »), guillemets encadrant tout le
 * message, didascalies type (Bouton : "...").
 */
function sanitizeAnnouncementText(value: string | null) {
  if (!value) return null;
  let text = value.trim();
  text = text.replace(/^(voici|voilà)\s+(un|le|votre)\s+(petit\s+)?(mot|message|texte|récap|recap)[^:\n]{0,80}:\s*/i, "");
  text = text.replace(/\(\s*bouton[^)]*\)\s*/gi, "").trim();
  // Guillemets encadrant tout le message, avec éventuelle traîne courte après le
  // guillemet fermant (emoji, ponctuation). On ne dé-guillemette pas si le contenu
  // interne contient lui-même ce type de guillemet (citations légitimes).
  const wrapped = text.match(/^([«"“'])\s*([\s\S]+?)\s*([»"”'])\s*([^\w«"“'»”]{0,8})$/);
  if (wrapped && !wrapped[2].includes(wrapped[1]) && !wrapped[2].includes(wrapped[3])) {
    text = `${wrapped[2].trim()}${wrapped[4] ? ` ${wrapped[4].trim()}` : ""}`.trim();
  }
  return text || null;
}

/** Validation allégée pour la reply issue de la décision : elle peut être courte (« Avec plaisir ! »). */
function usableDecisionReply(value: string | null) {
  const sanitized = sanitizeAnnouncementText(sanitizeVisibleModelText(value));
  if (!sanitized) return null;
  if (sanitized.length < 2) return null;
  if (/^\{/.test(sanitized)) return null;
  if (/"intent"\s*:|"reply"\s*:|"tool_calls"\s*:|"propose_search"\s*:/.test(sanitized)) return null;
  return sanitized;
}

async function fetchModelContent(input: {
  provider: AiProvider;
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  jsonMode?: boolean;
}) {
  if (input.provider === "google") return fetchGoogleGenerateContent(input);
  return fetchMistralChatContent(input);
}

async function fetchMistralChatContent(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  jsonMode?: boolean;
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
          ...(input.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: input.messages
        }),
        signal: controller.signal
      });

      if (response.status === 429 && attempt === 0) {
        await sleep(MISTRAL_RATE_LIMIT_RETRY_MS);
        continue;
      }
      if (!response.ok) return null;

      const result = await response.json();
      return result?.choices?.[0]?.message?.content?.trim() || null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function fetchGoogleGenerateContent(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  jsonMode?: boolean;
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
        await sleep(GOOGLE_RATE_LIMIT_RETRY_MS);
        continue;
      }
      if (!response.ok) return null;

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
  jsonMode?: boolean;
}) {
  const systemPrompt = input.messages.find((message) => message.role === "system")?.content ?? "";
  const contents = input.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    }));

  return {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: Math.max(input.maxTokens, 64),
      ...(input.jsonMode ? { responseMimeType: "application/json" } : {}),
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

async function waitForGoogleRequestSlot() {
  const previous = googleStartQueue;
  let release: () => void = () => {};
  googleStartQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const delayMs = Math.max(0, nextGoogleRequestAt - Date.now());
    if (delayMs > 0) await sleep(delayMs);
    nextGoogleRequestAt = Date.now() + GOOGLE_MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
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
    if (delayMs > 0) await sleep(delayMs);
    nextMistralRequestAt = Date.now() + MISTRAL_MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

function jsonChatResponse(conversationId: string, assistantMessage: ChatMessageResponse, count: number) {
  return NextResponse.json({
    conversationId,
    assistantMessage,
    message: assistantMessage.content,
    action: assistantMessage.ctaAction ?? null,
    categorie: null,
    redirect_path: assistantMessage.ctaHref ?? null,
    searchResultsCount: count,
    engine: "chat-v2"
  });
}

type ChatMessageResponse = Awaited<ReturnType<typeof insertConversationMessage>>;

function buildSearchAnnouncementFallback(categoryLabel: string, hasResults: boolean) {
  return hasResults
    ? `J'ai trouvé des ${categoryLabel} fiables et les fiches sont prêtes à consulter.`
    : `Je n'ai pas encore assez d'éléments fiables pour créer des fiches ${categoryLabel}. Donnez-moi un peu plus de précision et je relance proprement.`;
}

function buildSearchRecoveryCta(url?: string, finalFallback = false) {
  const redirectPath = url ?? "https://www.google.com/search?q=prestataire%20mariage";
  return {
    action: finalFallback ? "external_google_search" : "retry_search",
    categorie: null,
    redirect_path: redirectPath,
    ctaHref: redirectPath,
    ctaLabel: finalFallback ? "Ouvrir la recherche Google" : "Pousser la recherche"
  };
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function normalizeForIntent(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9€ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocationKey(value: string) {
  return normalizeForIntent(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

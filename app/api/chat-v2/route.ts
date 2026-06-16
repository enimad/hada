import { NextRequest, NextResponse } from "next/server";
import { getBudgetAllocationForVendorCategory } from "@/lib/budget";
import { env, validateServerEnv } from "@/lib/env";
import { buildWeddingSummary } from "@/lib/prompts";
import {
  buildSearchCta,
  createSearchResultsForUser,
  getVendorCategoryLabel,
  insertConversationMessage,
  listConversationMessages,
  normalizeSearchCategory,
  type SearchReadyPayload
} from "@/lib/server/hada";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyWeddingChecklistPatch, normalizeWeddingChecklist } from "@/lib/wedding-checklist";
import type { ChatMessage, UiChatMessage, VendorCategory, WeddingChecklistPatch, WeddingProfile } from "@/lib/types";
import {
  applyChatV2DecisionGuards,
  buildHadaDecisionPrompt,
  buildHadaVisibleReplyPrompt,
  decisionToIntentClassification,
  heuristicClassificationV2,
  parseHadaDecisionResponse,
  type ChatV2Intent,
  type IntentClassification,
  type ProfileUpdatePatch,
  type VendorSearchBrief
} from "@/lib/server/chat-v2/contracts";

type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AiProvider = "google" | "mistral";
type AiTask = "intent" | "reply" | "search_announcement";

type PendingV2Search = {
  messageId: string;
  metadata: Record<string, unknown>;
  brief: VendorSearchBrief;
  initialMessage: string;
  turns: number;
};

type PendingV2ProfileUpdate = {
  messageId: string;
  metadata: Record<string, unknown>;
  patch: ProfileUpdatePatch;
  summary: string;
  searchBrief: VendorSearchBrief | null;
  initialMessage: string | null;
};

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
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: authError }, { status: 401 });

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const conversation = await ensureChatV2Conversation(supabase, user.id, profile);

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

    const messages = await listConversationMessages(supabase, conversation.id);
    const pendingSearch = await getPendingV2Search(supabase, conversation.id);
    const contextResolution = resolveContextualUserText(content, messages);
    const decisionText = contextResolution.decisionText;
    const classification = applyDeterministicIntentGuards(
      await classifyIntentV2({
        userText: decisionText,
        profile,
        messages,
        pendingSearch
      }),
      {
        userText: decisionText,
        pendingSearch
      }
    );

    if (pendingSearch && classification.intent !== "vendor_search" && classification.intent !== "vendor_search_details") {
      await clearPendingV2Search(supabase, pendingSearch);
    }

    const profilePatchFromSearch = classification.vendorSearch?.category
      ? detectProfilePatchFromSearchLocation(profile, classification.vendorSearch)
      : null;
    const profilePatch = mergeProfileUpdatePatches(classification.profilePatch, profilePatchFromSearch);

    if (profilePatch && classification.intent !== "off_topic" && classification.intent !== "unclear") {
      const summary = buildProfileUpdateSummary(profile, profilePatch) ?? classification.profileSummary ?? "des informations de votre mariage changent";
      const searchBrief = classification.intent === "vendor_search" || classification.intent === "vendor_search_details"
        ? classification.vendorSearch
        : pendingSearch?.brief ?? null;
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

    if (classification.intent === "vendor_search" || classification.intent === "vendor_search_details") {
      return handleVendorSearchV2({
        supabase,
        userId: user.id,
        conversationId: conversation.id,
        profile,
        userText: decisionText,
        classification,
        pendingSearch
      });
    }

    const reply = await generateAdviceOrRedirect({
      userText: decisionText,
      profile,
      messages,
      classification,
      contextNote: contextResolution.contextNote
    });

    const assistantMessage = await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "assistant",
      content: reply
    });

    return jsonChatResponse(conversation.id, assistantMessage, 0);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

async function handleVendorSearchV2(input: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  conversationId: string;
  profile: Partial<WeddingProfile> | null;
  userText: string;
  classification: IntentClassification;
  pendingSearch: PendingV2Search | null;
}) {
  const mergedBrief = normalizeSearchBrief({
    ...input.pendingSearch?.brief,
    ...input.classification.vendorSearch
  });
  const turns = input.pendingSearch ? input.pendingSearch.turns + 1 : 0;
  const missing = findMissingSearchFields(mergedBrief, input.profile, turns);

  if (missing.length > 0) {
    const question = await generateSearchClarificationQuestion({
      profile: input.profile,
      brief: mergedBrief,
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
          brief: mergedBrief,
          initialMessage: input.pendingSearch?.initialMessage ?? input.userText,
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
    brief: mergedBrief,
    userText: [input.pendingSearch?.initialMessage, input.userText].filter(Boolean).join(" ")
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
}) {
  const search = buildSearchReadyPayload(input.brief, input.profile, input.userText);
  const searchResults = await createSearchResultsForUser(input.supabase, {
    userId: input.userId,
    conversationId: input.conversationId,
    profile: input.profile,
    search,
    options: {
      trackQuota: false
    }
  });

  const hasResults = searchResults.candidates.length > 0;
  const categoryLabel = getVendorCategoryLabel(search.category, searchResults.candidates.length || 2);
  const announcement = await generateVisibleMessage({
    task: "search_announcement",
    systemPrompt: buildChatV2VisibleReplyPrompt(),
    maxTokens: 190,
    temperature: 0.45,
    instruction: [
      "Rédige un message court et chaleureux pour annoncer le résultat d'une recherche de prestataires.",
      "Ne cite aucun nom de prestataire.",
      "Ne mentionne jamais Firecrawl, scraping, Supabase, Mistral, Google, API, quota ou backend.",
      `Profil : ${buildWeddingSummary(input.profile)}`,
      `Type de prestataire : ${categoryLabel}`,
      `Nombre de fiches fiables créées : ${searchResults.candidates.length}`,
      hasResults
        ? "Dis que les fiches sont prêtes et invite à les consulter via le bouton."
        : "Dis que Hada n'a pas encore assez d'éléments fiables et invite à ajuster la demande."
    ].join("\n")
  });

  const content = [input.introMessage, announcement ?? buildSearchAnnouncementFallback(categoryLabel, hasResults)]
    .filter(Boolean)
    .join("\n\n");
  const metadata = {
    ...(input.extraMetadata ?? {}),
    ...(hasResults ? buildSearchCta(search.category) : {})
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
    "Bienvenue dans le chat V2 de Hada.",
    `Je repars sur une logique plus claire : conseils mariage, mise à jour de votre profil, ou recherche de prestataires quand la demande est explicite. ${buildWeddingSummary(profile)}`
  ].join("\n\n");
}

function resolveContextualUserText(userText: string, messages: UiChatMessage[]) {
  if (!isContextualRetryMessage(userText)) {
    return {
      decisionText: userText,
      contextNote: null
    };
  }

  const previousMessages = messages.slice(0, -1);
  const lastBeforeCurrent = previousMessages[previousMessages.length - 1];
  if (lastBeforeCurrent?.role !== "user" || !isSubstantiveUserMessage(lastBeforeCurrent.content)) {
    return {
      decisionText: userText,
      contextNote: null
    };
  }

  return {
    decisionText: lastBeforeCurrent.content,
    contextNote: `Le dernier message du couple était seulement "${userText}". Il s'agit d'une relance après une réponse absente ou interrompue. Reprends la demande précédente sans faire comme si le couple avait changé de sujet.`
  };
}

function isContextualRetryMessage(value: string) {
  const normalized = normalizeForIntent(value);
  return /^(?:\?+|hein|allo|reponds|tu es la|tu as bugue|ca a bugue|oula|et donc|alors)\??$/.test(normalized);
}

function isSubstantiveUserMessage(value: string) {
  const normalized = normalizeForIntent(value);
  return normalized.length >= 12 && !isContextualRetryMessage(value);
}

async function classifyIntentV2(input: {
  userText: string;
  profile: Partial<WeddingProfile> | null;
  messages: UiChatMessage[];
  pendingSearch: PendingV2Search | null;
}): Promise<IntentClassification> {
  const prompt = buildHadaDecisionPrompt({
    profile: input.profile,
    messages: input.messages,
    pendingSearch: input.pendingSearch
  });
  const decision = await generateStructuredHadaDecision({
    systemPrompt: prompt,
    instruction: input.userText
  });

  return decision
    ? decisionToIntentClassification(decision, {
        userText: input.userText,
        pendingSearch: input.pendingSearch
      })
    : heuristicClassificationV2(input.userText, input.pendingSearch);
}

async function generateStructuredHadaDecision(input: {
  systemPrompt: string;
  instruction: string;
}) {
  const providers = getProviderOrderForTask("intent");
  for (const provider of providers) {
    try {
      const result = await fetchModelContent({
        provider,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.instruction }
        ],
        maxTokens: 900,
        temperature: 0.05,
        timeoutMs: 6200
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

function buildIntentClassifierPrompt(profile: Partial<WeddingProfile> | null, messages: UiChatMessage[], pendingSearch: PendingV2Search | null) {
  return buildHadaDecisionPrompt({ profile, messages, pendingSearch });
}

function applyDeterministicIntentGuards(classification: IntentClassification, input: { userText: string; pendingSearch: PendingV2Search | null }): IntentClassification {
  return applyChatV2DecisionGuards(classification, input);
}

function parseIntentClassification(value: string | null): IntentClassification | null {
  if (!value) return null;
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const intent = normalizeIntent(raw.intent);
    const vendor = raw.vendor_search && typeof raw.vendor_search === "object" ? (raw.vendor_search as Record<string, unknown>) : null;
    return {
      intent,
      confidence: readNumber(raw.confidence) ?? 0,
      explicitVendorSearch: raw.explicit_vendor_search === true,
      profilePatch: parseProfilePatch(raw.profile_patch),
      profileSummary: readString(raw.profile_summary),
      vendorSearch: vendor
        ? normalizeSearchBrief({
            category: normalizeSearchCategory(readString(vendor.category)),
            location: readString(vendor.location),
            style: readString(vendor.style),
            constraints: readString(vendor.constraints),
            budget: readString(vendor.budget),
            guestCount: readNumber(vendor.guest_count),
            searchQuery: readString(vendor.search_query)
          })
        : null,
      answerGuidance: readString(raw.answer_guidance)
    };
  } catch {
    return null;
  }
}

function heuristicClassification(userText: string, pendingSearch: PendingV2Search | null): IntentClassification {
  return heuristicClassificationV2(userText, pendingSearch);
}

async function generateAdviceOrRedirect(input: {
  userText: string;
  profile: Partial<WeddingProfile> | null;
  messages: UiChatMessage[];
  classification: IntentClassification;
  contextNote?: string | null;
}) {
  const reply = await generateVisibleMessage({
    task: "reply",
    systemPrompt: buildChatV2VisibleReplyPrompt(),
    maxTokens: 260,
    temperature: 0.45,
    instruction: [
      "Réponds au dernier message du couple.",
      "Si le message est hors sujet, réponds brièvement puis ramène doucement vers le mariage.",
      "Si le message est ambigu ou très faible, demande ce que le couple veut faire avancer pour le mariage.",
      "Si c'est une question mariage, réponds utilement sans lancer de recherche prestataire.",
      "Ne mentionne jamais de JSON, d'intention, de modèle ou d'outil.",
      `Profil : ${buildWeddingSummary(input.profile)}`,
      `Intention serveur : ${input.classification.intent}`,
      `Guidance : ${input.classification.answerGuidance ?? "aucune"}`,
      input.contextNote ? `Contexte de relance : ${input.contextNote}` : null,
      `Dernier message : ${input.userText}`
    ]
      .filter(Boolean)
      .join("\n")
  });

  return reply ?? "Je vous suis. Dites-moi ce que vous voulez faire avancer pour votre mariage, et je vous guide pas à pas.";
}

function buildChatV2VisibleReplyPrompt() {
  return buildHadaVisibleReplyPrompt();
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
    budget,
    raw: brief.searchQuery ?? userText
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

function ensureSearchQuery(input: {
  category: VendorCategory;
  location: string | null;
  style: string | null;
  constraints: string | null;
  budget: string | null;
  raw: string;
}) {
  const base = [categoryToSearchLabel(input.category), "mariage", input.location, input.style, input.constraints, input.budget, input.raw]
    .filter(Boolean)
    .join(" ");
  return base.replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizeSearchBrief(value: Partial<VendorSearchBrief> | null | undefined): VendorSearchBrief {
  return {
    category: value?.category ? normalizeSearchCategory(value.category) : null,
    location: cleanNullableString(value?.location),
    style: cleanNullableString(value?.style),
    constraints: cleanNullableString(value?.constraints),
    budget: cleanNullableString(value?.budget),
    guestCount: typeof value?.guestCount === "number" && Number.isFinite(value.guestCount) ? value.guestCount : null,
    searchQuery: cleanNullableString(value?.searchQuery)
  };
}

function extractSearchDetails(userText: string): Partial<VendorSearchBrief> {
  const normalized = normalizeForIntent(userText);
  const styleMatches = normalized.match(
    /\b(moderne|classique|traditionnel|italien|vegetarien|vegan|chic|simple|elegant|boheme|romantique|festif|luxe|champetre|rustique|intimiste|convivial|editorial|historique|nature|vue|etang|lac|jardin|terrasse|rooftop)\b/g
  );
  const budget = userText.match(/\b\d{3,6}\s*(?:€|eur|euros?)\b/i)?.[0] ?? null;
  const guestCount = userText.match(/\b(\d{1,4})\s*(?:invites|invités|personnes|convives)\b/i)?.[1];
  const location = extractRequestedLocation(userText);

  return {
    category: normalizeSearchCategory(userText),
    location,
    style: styleMatches ? Array.from(new Set(styleMatches)).slice(0, 5).join(", ") : null,
    constraints: extractConstraintText(userText),
    budget,
    guestCount: guestCount ? Number(guestCount) : null
  };
}

function extractConstraintText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:avec|qui a|qui ait|si possible|idealement|idéalement)\s+([^.!?]{3,90})/i,
    /\b(?:sans)\s+([^.!?]{3,80})/i,
    /\b(?:pour)\s+(\d{1,4}\s*(?:invites|invités|personnes|convives))/i
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  if (/\b(peu importe|pas de preference|pas de préférence|aucune preference|aucune préférence|surprends moi)\b/i.test(compact)) {
    return "pas de préférence particulière";
  }

  return null;
}

function extractRequestedLocation(userText: string) {
  const match = userText.match(/\b(?:a|à|en|dans|autour de|pres de|près de|vers)\s+([^,.!?;\n]{3,60})/i);
  const raw = match?.[1]
    ?.split(/\b(?:avec|pour|si|mais|style|ambiance|budget|qui|et)\b/i)[0]
    ?.trim();
  if (!raw || raw.split(/\s+/).length > 6) return null;
  return formatDisplayLocation(raw);
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
        timeoutMs: input.task === "intent" ? 5200 : 7000
      });
      const normalizedResult = input.task === "intent" ? result : sanitizeVisibleModelText(result);
      if (input.task === "intent" ? Boolean(normalizedResult) : isUsableVisibleModelText(normalizedResult)) return normalizedResult;
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
  const preferred: AiProvider[] = ["google", "mistral"];
  return preferred.filter((provider) => (provider === "google" ? Boolean(env.googleApiKey) : Boolean(env.mistralApiKey)));
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

async function fetchModelContent(input: {
  provider: AiProvider;
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}) {
  if (input.provider === "google") return fetchGoogleGenerateContent(input);
  return fetchMistralChatContent(input);
}

async function fetchMistralChatContent(input: {
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
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

function normalizeIntent(value: unknown): ChatV2Intent {
  const intent = readString(value);
  const allowed: ChatV2Intent[] = ["wedding_chat", "profile_update", "vendor_search", "vendor_search_details", "off_topic", "unclear"];
  return allowed.includes(intent as ChatV2Intent) ? (intent as ChatV2Intent) : "unclear";
}

function hasExplicitSearchIntent(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized || isNonSearchInquiry(value)) return false;
  const hasSearchVerb =
    /\b(cherche|chercher|recherche|rechercher|trouve|trouver|deniche|denicher|selectionne|selectionner|propose|proposer|recommande|recommander|liste|lister)\b/.test(
      normalized
    );
  const hasNeedPhrase =
    /\b(j ai besoin|on a besoin|nous avons besoin|il me faut|il nous faut|je veux|on veut|nous voulons|je voudrais|on voudrait|nous voudrions)\b/.test(
      normalized
    );
  const hasCategory = Boolean(normalizeSearchCategory(value));
  const hasVendorObject = /\b(prestataire|prestataires|option|options|adresse|adresses|contact|contacts|pepite|pepites)\b/.test(normalized);
  return hasSearchVerb || (hasNeedPhrase && (hasCategory || hasVendorObject));
}

function isVendorAdviceDiscussion(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return false;

  const hasVendorContext =
    Boolean(normalizeSearchCategory(value)) || /\b(prestataire|prestataires|photobooth|photo booth|wedding planner)\b/.test(normalized);
  if (!hasVendorContext) return false;

  const hasAdviceIntent =
    /\b(conseil|conseils|conseille|conseillez|avis|aide moi a choisir|aidez moi a choisir|aide a choisir|comment choisir|comment comparer|comparer|comparaison|difference|differences|critere|criteres|utile|necessaire|obligatoire|important|priorite|prioritaire|budget moyen|prix moyen|combien ca coute|faut il|dois je|doit on|parle moi|parler|discuter|explique|c est quoi|qu est ce que|tu connais|connais tu)\b/.test(
      normalized
    ) ||
    /\b(tu me recommandes quoi|vous me recommandez quoi|que me recommandes tu|que recommandez vous|quoi choisir)\b/.test(normalized);

  if (!hasAdviceIntent) return false;

  const asksForConcreteResults =
    /\b(cherche|chercher|recherche|rechercher|trouve|trouver|deniche|denicher|selectionne|selectionner|liste|lister|shortlist|fiche|fiches|adresse|adresses|contact|contacts)\b/.test(
      normalized
    ) ||
    (/\b(propose|proposer|recommande|recommander)\b/.test(normalized) &&
      !/\b(quoi|comment|avis|conseil|conseils|type|types|critere|criteres)\b/.test(normalized));

  return !asksForConcreteResults;
}

function isNonSearchInquiry(value: string) {
  const normalized = normalizeForIntent(value);
  if (/\bpourquoi pas\b/.test(normalized)) return false;
  return /\b(c est quoi|c quoi|qu est ce que|ca veut dire quoi|definition|definis|explique|comment ca marche|comment fonctionne|tu connais|connais tu|vous connaissez|avis|conseil|conseils|conseille|conseillez|comment choisir|comment comparer|aide moi a choisir|aidez moi a choisir|aide a choisir|pourquoi|combien ca coute|budget moyen|prix moyen|a quoi ca sert|faut il|dois je|doit on|parle moi|parler|discuter|tu me recommandes quoi|vous me recommandez quoi|que me recommandes tu|que recommandez vous|quoi choisir)\b/.test(
    normalized
  );
}

function isLowSignalMessage(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return true;
  if (normalizeSearchCategory(value)) return false;
  if (new Set(["test", "essai", "asdf", "azerty", "qwerty", "blabla", "blah", "ok test"]).has(normalized)) return true;
  const compact = normalized.replace(/\s+/g, "");
  if (compact.length >= 6 && !/[aeiouy]/.test(compact)) return true;
  return compact.length >= 8 && vowelRatio(compact) < 0.18 && !/\d/.test(compact);
}

function vowelRatio(value: string) {
  const letters = value.replace(/[^a-z]/g, "");
  if (!letters) return 0;
  return (letters.match(/[aeiouy]/g)?.length ?? 0) / letters.length;
}

function isAffirmativeReply(value: string) {
  return /^(oui|ok|okay|go|vas y|allez|d accord|daccord|c est bon|cest bon|valide|je valide)\b/.test(normalizeForIntent(value));
}

function isNegativeReply(value: string) {
  return /^(non|nope|nan|pas maintenant|pas tout de suite|laisse|gardons)\b/.test(normalizeForIntent(value));
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

function buildProfileBrief(profile: Partial<WeddingProfile> | null) {
  return {
    prenoms: [profile?.partner_one_name, profile?.partner_two_name].filter(Boolean).join(" & ") || null,
    date_mariage: profile?.wedding_date ?? profile?.wedding_period_text ?? null,
    lieu_mariage: profile?.city ?? profile?.region ?? profile?.country ?? null,
    budget_global: profile?.budget_max ?? profile?.budget_min ?? null,
    nombre_invites: profile?.guest_count ?? null,
    checklist: normalizeWeddingChecklist(profile?.wedding_checklist).map((item) => ({
      id: item.id,
      titre: item.title,
      statut: item.done ? "fait" : "a_faire"
    }))
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function cleanNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeForIntent(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9€ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocationKey(value: string) {
  return normalizeForIntent(value).replace(/[^a-z0-9]+/g, " ").trim();
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

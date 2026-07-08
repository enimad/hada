import type { UiChatMessage, VendorCategory, WeddingChecklistPatch } from "@/lib/types";

/**
 * Chat V2 — contrat LLM-first.
 *
 * Le LLM est le décideur : il classe l'intention ET rédige la réponse visible
 * dans un seul appel JSON. Le serveur ne reclasse jamais par regex ; il applique
 * seulement une porte d'exécution (applyExecutionGate) qui contrôle les actions
 * coûteuses (recherche prestataire, écriture profil).
 *
 * Les heuristiques regex de ce fichier ne servent plus qu'au mode dégradé
 * (heuristicClassificationV2), utilisé uniquement quand le LLM est indisponible.
 */

export type ChatV2Intent =
  | "advice"
  | "chat"
  | "search_request"
  | "search_detail"
  | "confirm"
  | "deny"
  | "profile_update"
  | "unclear";

export type ProfileUpdatePatch = {
  wedding_date?: string | null;
  wedding_period_text?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  guest_count?: number | null;
  budget_max?: number | null;
  wedding_checklist?: WeddingChecklistPatch | null;
};

export type VendorSearchBrief = {
  category: VendorCategory | null;
  location: string | null;
  style: string | null;
  constraints: string | null;
  budget: string | null;
  guestCount: number | null;
  searchQuery: string | null;
};

export type IntentClassification = {
  intent: ChatV2Intent;
  confidence: number;
  /** Réponse visible rédigée par le LLM dans le même appel. */
  reply: string | null;
  /** Le couple exprime un besoin prestataire sans demande explicite : Hada propose la recherche. */
  proposeSearch: boolean;
  vendorSearch: VendorSearchBrief | null;
  /** Type de prestataire demandé mais non couvert par le catalogue (photobooth, pâtissier...). */
  unsupportedCategoryLabel: string | null;
  profilePatch: ProfileUpdatePatch | null;
  profileSummary: string | null;
  reason: string | null;
};

export type PendingSearchSnapshot = {
  brief: VendorSearchBrief;
  initialMessage?: string | null;
  turns: number;
} | null;

export type PendingProposalSnapshot = {
  brief: VendorSearchBrief;
  initialMessage?: string | null;
} | null;

export type HadaDecision = {
  intent: ChatV2Intent;
  confidence: number;
  reply: string | null;
  proposeSearch: boolean;
  search: (VendorSearchBrief & { rawCategoryLabel: string | null }) | null;
  profilePatch: ProfileUpdatePatch | null;
  profileSummary: string | null;
  reason: string | null;
};

export const SUPPORTED_CATEGORY_LABELS =
  "lieu de réception, traiteur, photographe, vidéaste, DJ, musicien/groupe live, fleuriste, décoration, robe de mariée, costume, transport";

const TURN_OUTPUT_SCHEMA = [
  "{",
  '  "intent": "advice|chat|search_request|search_detail|confirm|deny|profile_update|unclear",',
  '  "confidence": 0.0,',
  '  "reason": "justification interne courte",',
  '  "reply": "réponse visible de Hada au couple",',
  '  "propose_search": false,',
  '  "search": {"category": null, "location": null, "style": null, "constraints": null, "budget": null, "guest_count": null, "search_query": null},',
  '  "profile_patch": null,',
  '  "profile_summary": null',
  "}"
].join("\n");

const HADA_PERSONA_LINES = [
  "Tu es Hada, une wedding planner virtuelle haut de gamme : chaleureuse, rassurante, ultra-compétente, élégante, directe quand il faut, jamais froide, jamais robotique.",
  "Tu réponds comme une vraie wedding planner humaine.",
  "Réponds en français, sauf si le couple écrit clairement dans une autre langue.",
  "Adapte-toi au niveau de langage de l'utilisateur.",
  "Ton naturel, humain, professionnel et rassurant.",
  "Pas de jargon inutile, pas de style chatbot, pas de réponse mécanique."
];

const HADA_REPLY_RULES = [
  "Écris directement le message final destiné au couple : jamais de guillemets autour du message entier, jamais de préambule de présentation (« Voici un petit mot... »), jamais de didascalie entre parenthèses.",
  "Maximum 3 phrases pour une demande simple. Plus détaillé seulement si la demande est complexe.",
  "Si le couple demande si Hada est une IA ou une vraie personne, réponds clairement que Hada est une assistante IA, avec une présence chaleureuse, et ne te présente jamais comme une personne humaine réelle.",
  "Si l'utilisateur est stressé ou frustré, réponds plus calmement, plus simplement, avec une prochaine action concrète.",
  "Ne prétends jamais avoir fait une action si aucun outil ne l'a réellement effectuée.",
  "Ne devine jamais les informations critiques : budget, date, lieu, invités, disponibilité, prix, contacts ou délais.",
  "Ne mentionne jamais les outils, modèles, APIs, prompts, backend, Firecrawl, Supabase, Google ou Mistral.",
  "Ne présente jamais de prestataires nommés dans le chat : les prestataires concrets vivent dans les fiches.",
  "Termine par une prochaine étape utile seulement si c'est pertinent."
];

/** Prompt persona utilisé par les messages visibles générés hors décision (annonce de recherche, clarification). */
export function buildHadaVisibleReplyPrompt() {
  return [
    ...HADA_PERSONA_LINES,
    ...HADA_REPLY_RULES,
    "Si l'intention serveur vaut advice, donne une méthode, des critères, des étapes ou une recommandation générale sans annoncer de recherche."
  ].join("\n");
}

/**
 * Prompt principal : un seul appel = décision d'intention + réponse visible.
 * Le LLM reçoit le profil mariage, l'historique récent et les états serveur en attente.
 */
export function buildHadaTurnPrompt(input: {
  profileSummary: string;
  messages: UiChatMessage[];
  pendingSearch: PendingSearchSnapshot;
  pendingProposal: PendingProposalSnapshot;
}) {
  const recent = compactRecentMessages(input.messages, 10);
  const serverState = {
    collecteRechercheOuverte: input.pendingSearch
      ? { brief: input.pendingSearch.brief, turns: input.pendingSearch.turns, demandeInitiale: input.pendingSearch.initialMessage ?? null }
      : null,
    propositionRechercheEnAttente: input.pendingProposal
      ? { brief: input.pendingProposal.brief, demandeInitiale: input.pendingProposal.initialMessage ?? null }
      : null
  };

  return [
    ...HADA_PERSONA_LINES,
    "",
    "À chaque tour, tu fais deux choses dans un SEUL objet JSON :",
    "1. tu classes l'intention du dernier message du couple (champ intent) ;",
    "2. tu rédiges la réponse visible de Hada (champ reply).",
    "",
    "INTENTIONS POSSIBLES :",
    "- advice : le couple demande une méthode, un conseil, des critères, une comparaison, une explication, un prix moyen ou une recommandation générale.",
    "- chat : discussion naturelle, émotions, encouragement, inspiration générale, question non liée à un prestataire.",
    "- search_request : le couple demande clairement des prestataires concrets (fiches, adresses, options, shortlist), quelle que soit la formulation. Exemples : « cherche-moi des traiteurs à Lyon », « montre-nous des salles dans le 77 », « je suis à la recherche d'un photographe pour juin », « il nous faut absolument un DJ, tu peux t'en occuper ? ».",
    "- search_detail : une collecte de recherche est ouverte ET le message apporte un critère exploitable (lieu, budget, style, contrainte, nombre d'invités, préférence).",
    "- confirm : le couple accepte la dernière proposition de Hada (« oui », « vas-y », « ok lance », « parfait, fais comme ça »). Valide uniquement si une proposition ou une collecte est réellement en attente dans l'état serveur.",
    "- deny : le couple refuse ou annule la proposition ou la collecte en cours (« non », « laisse tomber », « on annule », « pas maintenant »).",
    "- profile_update : le couple donne ou corrige une information durable de son mariage (date, ville, région, nombre d'invités, budget global), sans demander de recherche.",
    "- unclear : message vide, trop court ou impossible à interpréter.",
    "",
    "PROPOSE_SEARCH :",
    "- Mets propose_search à true UNIQUEMENT quand le couple exprime un vrai besoin prestataire sans demander explicitement les résultats (« il nous faudrait un photographe », « on n'a toujours pas de traiteur »). Dans ce cas intent = chat ou advice, et reply doit répondre utilement PUIS proposer en une phrase de lancer la recherche.",
    "- Si la demande de prestataires est explicite → intent = search_request et propose_search = false.",
    "- En cas d'hésitation entre search_request et une proposition → choisis la proposition (propose_search = true).",
    "- Jamais de propose_search pour une simple question de conseil ou de compréhension.",
    "",
    "CHAMP search :",
    "- Renseigne search uniquement pour search_request, search_detail, confirm, ou quand propose_search = true. Sinon laisse null.",
    `- category : le type de prestataire, si possible parmi : ${SUPPORTED_CATEGORY_LABELS}.`,
    "- Si le besoin ne correspond à aucun de ces types (photobooth, pâtissier, maquilleuse, officiant...), recopie le mot exact du couple dans category : le serveur répondra honnêtement que ce type n'est pas encore couvert. Dans ce cas intent = advice, propose_search = false, et reply doit le dire honnêtement + donner un conseil pour le trouver soi-même.",
    "- location, style, constraints, budget, guest_count : uniquement ce que le couple a réellement exprimé (dans ce message ou l'historique). N'invente jamais un critère.",
    "- search_query : pour search_request, search_detail et confirm, rédige une requête web courte et efficace (5 à 10 mots, sans phrase), comme un pro du sourcing. Exemple : « traiteur mariage cuisine du monde région parisienne ». Jamais la phrase du couple telle quelle.",
    "",
    "CHAMP reply (réponse visible) :",
    ...HADA_REPLY_RULES,
    "- Si intent = search_request, search_detail ou confirm : laisse reply vide (\"\"), le serveur rédige lui-même l'annonce de recherche.",
    "- Si intent = profile_update : laisse reply vide (\"\"), le serveur demande lui-même la confirmation.",
    "- Si propose_search = true : reply répond d'abord utilement, puis propose clairement la recherche (« Voulez-vous que je lance une recherche de photographes autour de Nantes ? »).",
    "- Si intent = deny : reply prend acte simplement et propose une suite utile.",
    "- Ta reply ne doit JAMAIS promettre une action que le serveur ne fera pas à ce tour : n'écris « je lance la recherche », « je vais explorer des profils » ou « j'élargis la zone » QUE si intent = search_request/search_detail/confirm (le serveur agit) ou si propose_search = true (la proposition attend un oui). Sinon reformule sans promesse.",
    "- Si une collecte est ouverte et que le couple donne un critère (style, budget, zone, « peu importe »...), c'est search_detail : le serveur relance la recherche avec ce critère.",
    "",
    "CHAMP profile_patch :",
    "- Uniquement pour profile_update. Champs autorisés : wedding_date (format YYYY-MM-DD), wedding_period_text, city, region, country, guest_count, budget_max.",
    "- N'inclus que les champs que le couple donne ou corrige. Le serveur demandera toujours confirmation avant d'écrire.",
    "- profile_summary : résumé court de la mise à jour (« le nombre d'invités passe à 150 »).",
    "",
    "EXEMPLES DE CLASSEMENT :",
    "- « Tu me conseilles quoi pour trouver le bon traiteur ? » → advice, propose_search false.",
    "- « Comment choisir un lieu de mariage ? » → advice.",
    "- « Combien coûte un photographe ? » → advice.",
    "- « Trouve-moi des traiteurs italiens à Marseille » → search_request (category traiteur, location Marseille).",
    "- « Tu peux nous montrer des salles dans le 77 ? » → search_request (category lieu, location 77).",
    "- « Je suis à la recherche d'un traiteur libanais » → search_request (category traiteur, style libanais).",
    "- « Il nous faudrait un photographe pour juin à Nantes » → chat, propose_search true (category photographe, location Nantes).",
    "- « On aurait besoin d'un DJ sur Toulouse, tu peux nous aider ? » → chat, propose_search true.",
    "- « On n'a toujours pas de fleuriste... » → chat, propose_search true.",
    "- Proposition en attente + « Oui, lance la recherche » → confirm.",
    "- Proposition en attente + « vas-y » → confirm.",
    "- Proposition en attente + « non laisse tomber » → deny.",
    "- Collecte ouverte + « plutôt moderne, budget 4000 euros » → search_detail.",
    "- Collecte ouverte + « comment je choisis entre deux traiteurs ? » → advice (la question passe avant la collecte).",
    "- Collecte ouverte + « en fait on annule » → deny.",
    "- « Finalement on sera 150 » → profile_update (guest_count 150).",
    "- « Notre budget global est plutôt de 25 000 € » → profile_update (budget_max 25000).",
    "- « Cherche-moi des idées de décoration champêtre » → chat (inspiration, pas de prestataire concret).",
    "- « C'est quoi un photobooth ? » → advice.",
    "- « Un pâtissier pour le wedding cake, t'as des adresses ? » → advice, category « pâtissier » (type non couvert : reply honnête + conseil), propose_search false.",
    "- « Tu es une IA ou une vraie personne ? » → chat.",
    "",
    "RÈGLES DE SORTIE :",
    "- Retourne UNIQUEMENT le JSON, sans markdown, sans texte autour.",
    "- confidence entre 0 et 1 : ta certitude sur intent.",
    "",
    "CONTRAT DE SORTIE JSON :",
    TURN_OUTPUT_SCHEMA,
    "",
    `PROFIL MARIAGE ACTUEL : ${input.profileSummary}`,
    `ÉTAT SERVEUR : ${JSON.stringify(serverState)}`,
    `HISTORIQUE RÉCENT :\n${recent || "Aucun."}`
  ].join("\n");
}

export function parseHadaDecisionResponse(value: string | null): HadaDecision | null {
  if (!value) return null;

  const direct = tryParseJson(value);
  if (direct) return normalizeTurnDecision(direct);

  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const extracted = tryParseJson(match[0]);
  return extracted ? normalizeTurnDecision(extracted) : null;
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function decisionToIntentClassification(
  decision: HadaDecision,
  input: {
    userText: string;
    pendingSearch: PendingSearchSnapshot;
    pendingProposal: PendingProposalSnapshot;
  }
): IntentClassification {
  const isSearchRelevant =
    decision.intent === "search_request" || decision.intent === "search_detail" || decision.intent === "confirm" || decision.proposeSearch;

  // Le LLM extrait les critères ; les regex ne servent qu'à compléter les trous (budget chiffré, invités...).
  const textDetails = extractSearchDetails(input.userText);
  const search = isSearchRelevant
    ? normalizeSearchBrief({
        category: decision.search?.category ?? textDetails.category ?? null,
        location: decision.search?.location ?? textDetails.location ?? null,
        style: decision.search?.style ?? textDetails.style ?? null,
        constraints: decision.search?.constraints ?? textDetails.constraints ?? null,
        budget: decision.search?.budget ?? textDetails.budget ?? null,
        guestCount: decision.search?.guestCount ?? textDetails.guestCount ?? null,
        searchQuery: decision.search?.searchQuery ?? null
      })
    : null;

  return {
    intent: decision.intent,
    confidence: clampConfidence(decision.confidence),
    reply: decision.reply,
    proposeSearch: decision.proposeSearch,
    vendorSearch: search && hasAnySearchField(search) ? search : null,
    unsupportedCategoryLabel: isSearchRelevant && !decision.search?.category ? (decision.search?.rawCategoryLabel ?? null) : null,
    profilePatch: decision.intent === "profile_update" ? decision.profilePatch : null,
    profileSummary: decision.intent === "profile_update" ? decision.profileSummary : null,
    reason: decision.reason
  };
}

/**
 * Porte d'exécution serveur. Ne reclasse JAMAIS une intention par regex :
 * elle vérifie seulement qu'une action coûteuse (recherche, profil) est légitime
 * dans l'état courant, et dégrade proprement sinon.
 */
export function applyExecutionGate(
  classification: IntentClassification,
  input: {
    userText: string;
    pendingSearch: PendingSearchSnapshot;
    pendingProposal: PendingProposalSnapshot;
  }
): IntentClassification {
  const gated = { ...classification };

  if (isLowSignalMessage(input.userText)) {
    return {
      ...gated,
      intent: "unclear",
      proposeSearch: false,
      vendorSearch: null,
      profilePatch: null,
      profileSummary: null,
      reason: "low_signal"
    };
  }

  // Rien à confirmer ou refuser : on retombe en discussion.
  if (gated.intent === "confirm" && !input.pendingProposal && !input.pendingSearch) {
    return { ...gated, intent: "chat", vendorSearch: null, reason: "confirm_without_pending" };
  }
  if (gated.intent === "deny" && !input.pendingProposal && !input.pendingSearch) {
    return { ...gated, intent: "chat", proposeSearch: false, vendorSearch: null, reason: "deny_without_pending" };
  }

  // search_detail n'a de sens que pendant une collecte ou une proposition.
  if (gated.intent === "search_detail" && !input.pendingSearch && !input.pendingProposal) {
    return { ...gated, intent: "chat", vendorSearch: null, reason: "search_detail_without_collect" };
  }

  // Type de prestataire non couvert : réponse honnête, jamais de recherche.
  if ((isSearchExecutionIntent(gated.intent) || gated.proposeSearch) && gated.unsupportedCategoryLabel) {
    return {
      ...gated,
      intent: "advice",
      proposeSearch: false,
      vendorSearch: null,
      reason: "unsupported_category"
    };
  }

  // Recherche incertaine : on propose au lieu d'exécuter (protège le quota).
  if (gated.intent === "search_request" && gated.confidence < 0.55) {
    return { ...gated, intent: "chat", proposeSearch: true, reason: "low_confidence_search_to_proposal" };
  }

  // Mise à jour profil incertaine : on laisse la discussion se poursuivre sans patch.
  if (gated.intent === "profile_update" && gated.confidence < 0.55) {
    return { ...gated, intent: "chat", profilePatch: null, profileSummary: null, reason: "low_confidence_profile" };
  }

  if (isSearchExecutionIntent(gated.intent)) {
    gated.proposeSearch = false;
  }

  if (!isSearchExecutionIntent(gated.intent) && !gated.proposeSearch) {
    gated.vendorSearch = null;
  }

  if (gated.intent !== "profile_update") {
    gated.profilePatch = null;
    gated.profileSummary = null;
  }

  return gated;
}

function isSearchExecutionIntent(intent: ChatV2Intent) {
  return intent === "search_request" || intent === "search_detail" || intent === "confirm";
}

/**
 * Mode dégradé : classification purement heuristique, utilisée uniquement quand
 * le LLM est indisponible. reply reste null (le serveur utilise ses textes de secours).
 */
export function heuristicClassificationV2(
  userText: string,
  pendingSearch: PendingSearchSnapshot,
  pendingProposal: PendingProposalSnapshot = null
): IntentClassification {
  const details = extractSearchDetails(userText);
  const hasPending = Boolean(pendingSearch || pendingProposal);

  if (isLowSignalMessage(userText)) {
    return baseClassification("unclear", 0.42, "heuristic_low_signal");
  }

  if (hasPending && isNegativeReply(userText)) {
    return baseClassification("deny", 0.7, "heuristic_deny");
  }

  if (hasPending && isAffirmativeReply(userText)) {
    return {
      ...baseClassification("confirm", 0.7, "heuristic_confirm"),
      vendorSearch: normalizeSearchBrief({ ...(pendingProposal?.brief ?? pendingSearch?.brief), ...details })
    };
  }

  if (isAdviceOnlyRequest(userText)) {
    return baseClassification("advice", 0.74, "heuristic_advice");
  }

  if (isInspirationOnlyRequest(userText)) {
    return baseClassification("chat", 0.62, "heuristic_inspiration");
  }

  if (pendingSearch && hasUsefulSearchDetails(details)) {
    return {
      ...baseClassification("search_detail", 0.68, "heuristic_search_detail"),
      vendorSearch: normalizeSearchBrief({ ...pendingSearch.brief, ...details })
    };
  }

  if (hasExplicitSearchIntent(userText)) {
    return {
      ...baseClassification("search_request", 0.76, "heuristic_search_request"),
      vendorSearch: normalizeSearchBrief(details)
    };
  }

  const profilePatch = extractHeuristicProfilePatch(userText);
  if (profilePatch) {
    return {
      ...baseClassification("profile_update", 0.62, "heuristic_profile_update"),
      profilePatch
    };
  }

  if (isNonSearchInquiry(userText) || hasVendorContext(userText)) {
    return baseClassification("advice", 0.62, "heuristic_vendor_advice");
  }

  return baseClassification("chat", 0.5, "heuristic_chat");
}

export function normalizeSearchBrief(value: Partial<VendorSearchBrief> | null | undefined): VendorSearchBrief {
  return {
    category: value?.category ? normalizeIntentSearchCategory(value.category) : null,
    location: cleanNullableString(value?.location),
    style: cleanNullableString(value?.style),
    constraints: cleanNullableString(value?.constraints),
    budget: cleanNullableString(value?.budget),
    guestCount: typeof value?.guestCount === "number" && Number.isFinite(value.guestCount) ? value.guestCount : null,
    searchQuery: cleanNullableString(value?.searchQuery)
  };
}

export function extractSearchDetails(userText: string): Partial<VendorSearchBrief> {
  const normalized = normalizeForIntent(userText);
  const styleMatches = normalized.match(
    /\b(moderne|classique|traditionnel|italien|libanais|oriental|vegetarien|vegan|chic|simple|elegant|boheme|romantique|festif|luxe|champetre|rustique|intimiste|convivial|editorial|historique|nature|naturel|naturelle|reportage|artistique|lumineux|lumineuse|spontane|spontanee|vintage|minimaliste|colore|coloree|vue|etang|lac|jardin|terrasse|rooftop)\b/g
  );
  const budget = userText.match(/\b\d{3,6}\s*(?:€|eur|euros?)\b/i)?.[0] ?? null;
  const guestCount = userText.match(/\b(\d{1,4})\s*(?:invites|invités|personnes|convives)\b/i)?.[1];

  return {
    category: normalizeIntentSearchCategory(userText),
    location: extractRequestedLocation(userText),
    style: styleMatches ? Array.from(new Set(styleMatches)).slice(0, 5).join(", ") : null,
    constraints: extractConstraintText(userText),
    budget,
    guestCount: guestCount ? Number(guestCount) : null,
    searchQuery: null
  };
}

/** Réservé au mode dégradé : détection regex d'une demande explicite de prestataires. */
export function hasExplicitSearchIntent(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized || isAdviceOnlyRequest(value) || isInspirationOnlyRequest(value)) return false;

  const hasConcreteObject =
    Boolean(normalizeIntentSearchCategory(value)) ||
    /\b(prestataire|prestataires|option|options|adresse|adresses|contact|contacts|pepite|pepites|fiche|fiches|shortlist|selection)\b/.test(
      normalized
    );

  if (!hasConcreteObject) return false;

  return isDirectSearchCommand(normalized) || isExpressedVendorNeed(normalized);
}

export function isVendorAdviceDiscussion(value: string) {
  return isAdviceOnlyRequest(value);
}

export function isAdviceOnlyRequest(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized || !hasVendorContext(value)) return false;
  if (isDirectSearchCommand(normalized) || isExpressedVendorNeed(normalized)) return false;

  return (
    /\b(conseil|conseils|conseille|conseilles|conseillez|avis|methode|methodes|critere|criteres|comment|comparer|comparaison|difference|differences|choisir|choix|trouver le bon|trouver la bonne|bon traiteur|bonne photographe|utile|necessaire|obligatoire|important|priorite|prioritaire|budget moyen|prix moyen|combien ca coute|a quoi faire attention|quoi regarder|faut il|dois je|doit on|parle moi|parler|discuter|explique|c est quoi|qu est ce que|tu connais|connais tu)\b/.test(
      normalized
    ) ||
    /\b(tu me recommandes quoi|tu me recommande quoi|vous me recommandez quoi|que me recommandes tu|que recommandez vous|quoi comme type|quel type|quels types|quoi choisir)\b/.test(
      normalized
    )
  );
}

export function isNonSearchInquiry(value: string) {
  const normalized = normalizeForIntent(value);
  if (/\bpourquoi pas\b/.test(normalized)) return false;
  return (
    isAdviceOnlyRequest(value) ||
    /\b(c est quoi|c quoi|qu est ce que|ca veut dire quoi|definition|definis|explique|comment ca marche|comment fonctionne|tu connais|connais tu|vous connaissez|avis|conseil|conseils|conseille|conseilles|conseillez|pourquoi|combien ca coute|budget moyen|prix moyen|a quoi ca sert|faut il|dois je|doit on|parle moi|parler|discuter)\b/.test(
      normalized
    )
  );
}

export function isInspirationOnlyRequest(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return false;
  const asksForInspiration = /\b(idee|idees|inspiration|inspirations|inspi|inspis|exemple|exemples|theme|themes|ambiance|ambiances)\b/.test(normalized);
  const asksForConcreteVendors =
    /\b(prestataire|prestataires|adresse|adresses|contact|contacts|pepite|pepites|fiche|fiches|shortlist|selection)\b/.test(normalized);
  return asksForInspiration && !asksForConcreteVendors;
}

export function isLowSignalMessage(value: string) {
  const normalized = normalizeForIntent(value);
  if (!normalized) return true;
  if (normalizeIntentSearchCategory(value)) return false;
  if (isAffirmativeReply(value) || isNegativeReply(value)) return false;
  if (new Set(["test", "essai", "asdf", "azerty", "qwerty", "blabla", "blah", "ok test"]).has(normalized)) return true;
  const compact = normalized.replace(/\s+/g, "");
  if (compact.length <= 2) return true;
  if (compact.length >= 6 && !/[aeiouy]/.test(compact)) return true;
  return compact.length >= 8 && vowelRatio(compact) < 0.18 && !/\d/.test(compact);
}

export function isAffirmativeReply(value: string) {
  const normalized = normalizeForIntent(value);
  return /^(oui|ouais|ouaip|yes|yep|ok|okay|go|vas y|allez|allons y|d accord|daccord|c est bon|cest bon|ca marche|parfait|super|top|carrement|banco|volontiers|avec plaisir|je veux bien|on veut bien|valide|je valide|c est parti|lance|lancez|lance la|lance une)\b/.test(
    normalized
  );
}

export function isNegativeReply(value: string) {
  const normalized = normalizeForIntent(value);
  return (
    /^(non|nope|nan|pas maintenant|pas tout de suite|laisse|laissez|stop|finalement non|non merci)\b/.test(normalized) ||
    /\b(laisse tomber|on annule|j annule|annule la|annulez|plus besoin|on arrete|on abandonne|abandonne)\b/.test(normalized)
  );
}

export function normalizeForIntent(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9€ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type GuardTestCase = {
  name: string;
  userText: string;
  pendingSearch: PendingSearchSnapshot;
  pendingProposal: PendingProposalSnapshot;
  expectedIntent: ChatV2Intent;
};

const COLLECTE_TRAITEUR: PendingSearchSnapshot = {
  brief: {
    category: "caterer",
    location: "Marseille",
    style: null,
    constraints: null,
    budget: null,
    guestCount: null,
    searchQuery: null
  },
  turns: 0
};

const PROPOSAL_PHOTOGRAPHE: PendingProposalSnapshot = {
  brief: {
    category: "photographer",
    location: "Nantes",
    style: null,
    constraints: null,
    budget: null,
    guestCount: null,
    searchQuery: null
  },
  initialMessage: "Il nous faudrait un photographe pour juin à Nantes"
};

/**
 * Cas de garde du mode dégradé (heuristiques + porte d'exécution, sans LLM).
 * Sert de non-régression pour le fallback : npm run test:intent.
 */
export const CHAT_V2_GUARD_TEST_CASES: GuardTestCase[] = [
  // --- Conseil, jamais de recherche ---
  { name: "conseil trouver bon traiteur", userText: "Tu me conseilles quoi pour trouver le bon traiteur ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "comment trouver bon traiteur", userText: "Comment trouver le bon traiteur ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "criteres photographe", userText: "Quels critères pour choisir un photographe ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "type de dj", userText: "Tu me recommandes quoi comme type de DJ ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "conseil lieu sans recherche", userText: "Comment choisir un lieu de mariage ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "question comprehension prestataire", userText: "Non mais c'est quoi un photobooth ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "prix moyen fleuriste", userText: "C'est quoi le budget moyen pour un fleuriste ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "fleurs on fait comment", userText: "Et pour les fleurs, on fait comment ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },

  // --- Demandes explicites de recherche ---
  { name: "recherche traiteurs italiens", userText: "Trouve-moi des traiteurs italiens à Marseille", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "recherche vegetarienne lyon", userText: "Cherche des traiteurs avec option végétarienne autour de Lyon", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "liste photographes bordeaux", userText: "Liste-moi 3 photographes à Bordeaux", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "recommandation concrete traiteurs", userText: "Tu me recommandes des traiteurs à Lyon", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "voir lieux mariage rueil", userText: "Je veux bien voir des lieux de mariages à Rueil malmaison", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "trouve domaine normandie", userText: "Trouve-nous un joli domaine en Normandie", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "propose fleuristes annecy", userText: "propose-nous quelques fleuristes vers Annecy", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "montre salles 77", userText: "Tu peux nous montrer des salles dans le 77 ?", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "il nous faudrait photographe", userText: "Il nous faudrait un photographe pour juin à Nantes", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "besoin dj toulouse", userText: "On aurait besoin d'un DJ sur Toulouse, tu peux nous aider ?", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "a la recherche traiteur libanais", userText: "Je suis à la recherche d'un traiteur libanais", pendingSearch: null, pendingProposal: null, expectedIntent: "search_request" },
  { name: "lance la recherche seule", userText: "Oui, lance la recherche", pendingSearch: null, pendingProposal: PROPOSAL_PHOTOGRAPHE, expectedIntent: "confirm" },

  // --- Confirmations et refus ---
  { name: "oui vas-y avec proposition", userText: "oui vas-y", pendingSearch: null, pendingProposal: PROPOSAL_PHOTOGRAPHE, expectedIntent: "confirm" },
  { name: "ok parfait avec proposition", userText: "Ok parfait !", pendingSearch: null, pendingProposal: PROPOSAL_PHOTOGRAPHE, expectedIntent: "confirm" },
  { name: "vas-y pendant collecte", userText: "vas-y lance", pendingSearch: COLLECTE_TRAITEUR, pendingProposal: null, expectedIntent: "confirm" },
  { name: "refus proposition", userText: "non laisse tomber", pendingSearch: null, pendingProposal: PROPOSAL_PHOTOGRAPHE, expectedIntent: "deny" },
  { name: "annulation pendant collecte", userText: "en fait on annule, on ne cherche plus de traiteur", pendingSearch: COLLECTE_TRAITEUR, pendingProposal: null, expectedIntent: "deny" },
  { name: "oui sans rien en attente", userText: "oui", pendingSearch: null, pendingProposal: null, expectedIntent: "chat" },

  // --- Collecte ---
  { name: "detail pendant collecte", userText: "plutôt moderne, budget 4000 euros", pendingSearch: COLLECTE_TRAITEUR, pendingProposal: null, expectedIntent: "search_detail" },
  {
    name: "detail lieu nature piscine parking pendant collecte",
    userText: "Une espèce de maison nature, avec une piscine si possible. Un accès parking ce serait un plus !",
    pendingSearch: {
      brief: { category: "venue", location: "Rueil-Malmaison", style: null, constraints: null, budget: null, guestCount: null, searchQuery: null },
      turns: 0
    },
    pendingProposal: null,
    expectedIntent: "search_detail"
  },
  { name: "conseil pendant collecte", userText: "comment je choisis entre deux traiteurs ?", pendingSearch: COLLECTE_TRAITEUR, pendingProposal: null, expectedIntent: "advice" },
  {
    name: "style naturel apres echec recherche",
    userText: "Quelque chose de naturel",
    pendingSearch: {
      brief: { category: "photographer", location: "Saint-Cloud", style: null, constraints: null, budget: null, guestCount: null, searchQuery: null },
      turns: 0
    },
    pendingProposal: null,
    expectedIntent: "search_detail"
  },
  {
    name: "peu importe le prix pendant collecte",
    userText: "Peu importe le prix honnêtement",
    pendingSearch: {
      brief: { category: "photographer", location: "Saint-Cloud", style: "naturel", constraints: null, budget: null, guestCount: null, searchQuery: null },
      turns: 1
    },
    pendingProposal: null,
    expectedIntent: "search_detail"
  },
  {
    name: "question conseil prioritaire malgre budget",
    userText: "budget autour de 3000 euros mais dis-moi d'abord comment comparer les menus",
    pendingSearch: COLLECTE_TRAITEUR,
    pendingProposal: null,
    expectedIntent: "advice"
  },

  // --- Profil ---
  { name: "changement invites", userText: "Finalement on sera 150", pendingSearch: null, pendingProposal: null, expectedIntent: "profile_update" },
  { name: "changement invites explicite", userText: "Finalement on sera 150 invités", pendingSearch: null, pendingProposal: null, expectedIntent: "profile_update" },
  { name: "changement budget global", userText: "Notre budget global est plutôt de 25000 euros", pendingSearch: null, pendingProposal: null, expectedIntent: "profile_update" },

  // --- Discussion / inspiration / hors périmètre ---
  { name: "inspiration sans recherche prestataire", userText: "Cherche-moi des idées de décoration champêtre", pendingSearch: null, pendingProposal: null, expectedIntent: "chat" },
  { name: "question identite hada", userText: "Tu es une IA ou une vraie personne ?", pendingSearch: null, pendingProposal: null, expectedIntent: "chat" },
  { name: "emotion fiancailles", userText: "On s'est fiancés hier, on est un peu perdus...", pendingSearch: null, pendingProposal: null, expectedIntent: "chat" },
  { name: "photobooth non couvert", userText: "Cherche-moi un photobooth à Paris", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "patissier non couvert", userText: "Un pâtissier pour le wedding cake, t'as des adresses ?", pendingSearch: null, pendingProposal: null, expectedIntent: "advice" },
  { name: "message tres court", userText: "dd", pendingSearch: null, pendingProposal: null, expectedIntent: "unclear" }
];

export function evaluateChatV2GuardTestCases() {
  return CHAT_V2_GUARD_TEST_CASES.map((testCase) => {
    const classification = applyExecutionGate(
      heuristicClassificationV2(testCase.userText, testCase.pendingSearch, testCase.pendingProposal),
      {
        userText: testCase.userText,
        pendingSearch: testCase.pendingSearch,
        pendingProposal: testCase.pendingProposal
      }
    );

    return {
      ...testCase,
      actualIntent: classification.intent,
      proposeSearch: classification.proposeSearch,
      vendorSearch: classification.vendorSearch,
      passed: classification.intent === testCase.expectedIntent
    };
  });
}

type LlmEvalCase = {
  name: string;
  userText: string;
  pendingSearch: PendingSearchSnapshot;
  pendingProposal: PendingProposalSnapshot;
  profileSummary?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  expectedIntents: ChatV2Intent[];
  expectedProposeSearch?: boolean;
};

/**
 * Jeu d'évaluation du routeur LLM réel (scripts/eval-intent-live.mjs).
 * expectedIntents accepte plusieurs intentions quand la frontière est légitime.
 */
export const CHAT_V2_LLM_EVAL_CASES: LlmEvalCase[] = [
  { name: "conseil trouver bon traiteur", userText: "Tu me conseilles quoi pour trouver le bon traiteur ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["advice"], expectedProposeSearch: false },
  { name: "comment choisir lieu", userText: "Comment choisir un lieu de mariage ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["advice"], expectedProposeSearch: false },
  { name: "combien coute photographe", userText: "Combien coûte un photographe ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["advice"], expectedProposeSearch: false },
  { name: "recherche traiteurs italiens", userText: "Trouve-moi des traiteurs italiens à Marseille", pendingSearch: null, pendingProposal: null, expectedIntents: ["search_request"] },
  { name: "liste photographes bordeaux", userText: "Liste-moi 3 photographes à Bordeaux", pendingSearch: null, pendingProposal: null, expectedIntents: ["search_request"] },
  { name: "montre salles 77", userText: "Tu peux nous montrer des salles dans le 77 ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["search_request"] },
  { name: "a la recherche traiteur libanais", userText: "Je suis à la recherche d'un traiteur libanais", pendingSearch: null, pendingProposal: null, expectedIntents: ["search_request"] },
  { name: "il nous faudrait photographe", userText: "Il nous faudrait un photographe pour juin à Nantes", pendingSearch: null, pendingProposal: null, expectedIntents: ["chat", "advice"], expectedProposeSearch: true },
  { name: "besoin dj toulouse", userText: "On aurait besoin d'un DJ sur Toulouse, tu peux nous aider ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["chat", "advice", "search_request"] },
  { name: "toujours pas de fleuriste", userText: "On n'a toujours pas de fleuriste...", pendingSearch: null, pendingProposal: null, expectedIntents: ["chat", "advice"], expectedProposeSearch: true },
  {
    name: "confirmation lance la recherche",
    userText: "Oui, lance la recherche",
    pendingSearch: null,
    pendingProposal: PROPOSAL_PHOTOGRAPHE,
    history: [
      { role: "user", content: "Il nous faudrait un photographe pour juin à Nantes" },
      { role: "assistant", content: "Bien sûr ! Voulez-vous que je lance une recherche de photographes autour de Nantes ?" }
    ],
    expectedIntents: ["confirm"]
  },
  {
    name: "confirmation vas-y",
    userText: "vas-y",
    pendingSearch: null,
    pendingProposal: PROPOSAL_PHOTOGRAPHE,
    history: [
      { role: "user", content: "Il nous faudrait un photographe pour juin à Nantes" },
      { role: "assistant", content: "Voulez-vous que je lance une recherche de photographes autour de Nantes ?" }
    ],
    expectedIntents: ["confirm"]
  },
  {
    name: "refus proposition",
    userText: "non laisse tomber, on verra plus tard",
    pendingSearch: null,
    pendingProposal: PROPOSAL_PHOTOGRAPHE,
    history: [
      { role: "user", content: "Il nous faudrait un photographe pour juin à Nantes" },
      { role: "assistant", content: "Voulez-vous que je lance une recherche de photographes autour de Nantes ?" }
    ],
    expectedIntents: ["deny"]
  },
  {
    name: "detail pendant collecte",
    userText: "plutôt moderne, budget 4000 euros",
    pendingSearch: COLLECTE_TRAITEUR,
    pendingProposal: null,
    history: [
      { role: "user", content: "Cherche-moi un traiteur à Marseille" },
      { role: "assistant", content: "Avec plaisir ! Quelle ambiance ou quel style de cuisine imaginez-vous ?" }
    ],
    expectedIntents: ["search_detail"]
  },
  {
    name: "conseil pendant collecte",
    userText: "comment je choisis entre deux traiteurs ?",
    pendingSearch: COLLECTE_TRAITEUR,
    pendingProposal: null,
    history: [
      { role: "user", content: "Cherche-moi un traiteur à Marseille" },
      { role: "assistant", content: "Avec plaisir ! Quelle ambiance ou quel style de cuisine imaginez-vous ?" }
    ],
    expectedIntents: ["advice"]
  },
  {
    name: "annulation pendant collecte",
    userText: "en fait on annule, on ne cherche plus de traiteur",
    pendingSearch: COLLECTE_TRAITEUR,
    pendingProposal: null,
    expectedIntents: ["deny"]
  },
  { name: "changement invites", userText: "Finalement on sera 150", pendingSearch: null, pendingProposal: null, expectedIntents: ["profile_update"] },
  { name: "changement budget", userText: "Notre budget global est plutôt de 25 000 €", pendingSearch: null, pendingProposal: null, expectedIntents: ["profile_update"] },
  { name: "inspiration deco", userText: "Cherche-moi des idées de décoration champêtre", pendingSearch: null, pendingProposal: null, expectedIntents: ["chat", "advice"], expectedProposeSearch: false },
  { name: "question identite", userText: "Tu es une IA ou une vraie personne ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["chat"] },
  { name: "emotion fiancailles", userText: "On s'est fiancés hier, on est un peu perdus...", pendingSearch: null, pendingProposal: null, expectedIntents: ["chat", "advice"] },
  { name: "photobooth non couvert", userText: "Cherche-moi un photobooth à Paris", pendingSearch: null, pendingProposal: null, expectedIntents: ["advice", "chat"], expectedProposeSearch: false },
  { name: "patissier non couvert", userText: "Un pâtissier pour le wedding cake, t'as des adresses ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["advice", "chat"], expectedProposeSearch: false },
  { name: "question comprehension photobooth", userText: "Non mais c'est quoi un photobooth ?", pendingSearch: null, pendingProposal: null, expectedIntents: ["advice", "chat"] },
  { name: "message tres court", userText: "dd", pendingSearch: null, pendingProposal: null, expectedIntents: ["unclear"] }
];

function normalizeTurnDecision(raw: Record<string, unknown>): HadaDecision {
  const intent = normalizeRouterIntent(raw.intent ?? raw.action);
  const search = normalizeDecisionSearch(raw.search ?? raw.search_query);
  const profilePatch = intent === "profile_update" ? parseProfilePatch(raw.profile_patch ?? raw.profile_updates) : null;

  return {
    intent,
    confidence: clampConfidence(readNumber(raw.confidence) ?? 0.45),
    reply: readString(raw.reply ?? raw.user_reply),
    proposeSearch: raw.propose_search === true || raw.proposeSearch === true,
    search,
    profilePatch,
    profileSummary: readString(raw.profile_summary) ?? readString((raw.profile_updates as Record<string, unknown> | undefined)?.summary),
    reason: readString(raw.reason)
  };
}

function normalizeRouterIntent(value: unknown): ChatV2Intent {
  const intent = readString(value)?.toLowerCase();
  const mapping: Record<string, ChatV2Intent> = {
    advice: "advice",
    wedding_advice: "advice",
    wedding_chat: "chat",
    chat: "chat",
    off_topic: "chat",
    profile_update: "profile_update",
    profile_update_request: "profile_update",
    profile_update_confirmation: "profile_update",
    search_request: "search_request",
    search_launch: "search_request",
    vendor_search: "search_request",
    vendor_search_request: "search_request",
    search_detail: "search_detail",
    vendor_search_details: "search_detail",
    confirm: "confirm",
    confirmation: "confirm",
    accept: "confirm",
    deny: "deny",
    refuse: "deny",
    decline: "deny",
    cancel: "deny",
    unclear: "unclear"
  };
  return intent ? (mapping[intent] ?? "unclear") : "unclear";
}

function normalizeDecisionSearch(value: unknown): (VendorSearchBrief & { rawCategoryLabel: string | null }) | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawCategoryLabel = readString(raw.category);
  const brief = normalizeSearchBrief({
    category: rawCategoryLabel ? normalizeIntentSearchCategory(rawCategoryLabel) : null,
    location: readString(raw.location),
    style: readString(raw.style),
    constraints: readString(raw.constraints),
    budget: readString(raw.budget) ?? (readNumber(raw.budget) !== null ? `${readNumber(raw.budget)} €` : null),
    guestCount: readNumber(raw.guest_count ?? raw.guestCount),
    searchQuery: readString(raw.search_query ?? raw.searchQuery)
  });

  if (!hasAnySearchField(brief) && !rawCategoryLabel) return null;
  return { ...brief, rawCategoryLabel: brief.category ? null : rawCategoryLabel };
}

function parseProfilePatch(value: unknown): ProfileUpdatePatch | null {
  const raw = unwrapProfilePatch(value);
  if (!raw) return null;
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

function unwrapProfilePatch(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.patch && typeof raw.patch === "object") return raw.patch as Record<string, unknown>;
  return raw;
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

function baseClassification(intent: ChatV2Intent, confidence: number, reason: string): IntentClassification {
  return {
    intent,
    confidence,
    reply: null,
    proposeSearch: false,
    vendorSearch: null,
    unsupportedCategoryLabel: null,
    profilePatch: null,
    profileSummary: null,
    reason
  };
}

function hasVendorContext(value: string) {
  const normalized = normalizeForIntent(value);
  return (
    Boolean(normalizeIntentSearchCategory(value)) ||
    /\b(prestataire|prestataires|photobooth|photo booth|wedding planner|wedding cake|patissier|patisserie|gateau|maquilleuse|maquillage|coiffeur|coiffeuse|coiffure|officiant|officiante|animation|lieu|lieux|salle|salles|domaine|domaines)\b/.test(
      normalized
    )
  );
}

function isDirectSearchCommand(normalized: string) {
  return (
    /\b(cherches?|cherchez|recherches?|recherchez|trouves?|trouvez|deniches?|denichez|selectionnes?|selectionnez|listes?|listez|recommandes?|recommandez|proposes?|proposez|montres?|montrez|presentes?|presentez|affiches?|affichez)[ -]*(moi|nous)?\s+(des|un|une|les|la|le|quelques|plusieurs|deux|trois|quatre|2|3|4)\b/.test(
      normalized
    ) ||
    /\b(peux tu|pouvez vous|tu peux|vous pouvez|tu pourrais|vous pourriez)\s+(me\s+|nous\s+)?(chercher|rechercher|trouver|denicher|selectionner|lister|recommander|proposer|montrer|presenter|afficher)\b/.test(
      normalized
    ) ||
    /\b(je veux bien|je veux|on veut|nous voulons|je voudrais|on voudrait|nous voudrions|j aimerais|on aimerait|nous aimerions)\s+(voir|avoir|consulter|recevoir|obtenir|regarder)\s+(des|les|quelques|un|une)\b/.test(
      normalized
    ) ||
    /\b(lance|lancer|lancez|demarre|demarrer|demarrez|fais|faire|faites|relance|relancer|relancez)\s+(moi\s+|nous\s+)?(la\s+|une\s+|cette\s+)?recherche\b/.test(
      normalized
    ) ||
    /\b(donne moi|donnez moi|donne nous|donnez nous|envoie moi|envoyez moi|sors moi|sort moi|fournis moi|fournissez moi)\s+(des\s+)?(adresses|contacts|fiches|prestataires|options|shortlist)\b/.test(
      normalized
    ) ||
    /\b(je veux|on veut|nous voulons|je voudrais|on voudrait|nous voudrions)\s+(des\s+|un\s+|une\s+)?(prestataires|traiteurs|photographes|dj|fleuristes|videastes|lieux|salles|domaines|adresses|contacts|fiches|options|shortlist)\b/.test(
      normalized
    )
  );
}

/** Formulations de besoin fortes traitées comme demandes en mode dégradé (« il nous faut un... »). */
function isExpressedVendorNeed(normalized: string) {
  return (
    /\b(il|ils?)?\s?(me|nous)\s+(faut|faudrait|faudra)\s+(un|une|des)\b/.test(normalized) ||
    /\b(on a|on aurait|nous avons|nous aurions|j ai|j aurais)\s+besoin\s+d\s?(un|une|e|es)?\b/.test(normalized) ||
    /\b(je suis|nous sommes|on est)\s+a la recherche\s+d\s?(un|une|e|es)?\b/.test(normalized)
  );
}

function extractHeuristicProfilePatch(value: string): ProfileUpdatePatch | null {
  const normalized = normalizeForIntent(value);
  const patch: ProfileUpdatePatch = {};

  const guestMatch = normalized.match(/\b(?:on sera|nous serons|on serait|nous serions|on est passe a|on passe a)\s+(\d{1,4})\b/);
  if (guestMatch) patch.guest_count = Number(guestMatch[1]);

  const budgetMatch = normalized.match(/\b(?:notre budget|le budget|budget global|budget total|budget max)\s+(?:est|sera|serait|passe|monte|descend)?\s*(?:plutot)?\s*(?:a|de|d)?\s*(\d[\d ]{2,7})\s*(?:€|eur|euros)?\b/);
  if (budgetMatch) {
    const amount = Number(budgetMatch[1].replace(/\s+/g, ""));
    if (Number.isFinite(amount) && amount >= 500) patch.budget_max = amount;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function hasUsefulSearchDetails(value: Partial<VendorSearchBrief>) {
  return Boolean(value.location || value.style || value.constraints || value.budget || value.guestCount || value.searchQuery);
}

function hasAnySearchField(value: Partial<VendorSearchBrief>) {
  return Boolean(value.category || value.location || value.style || value.constraints || value.budget || value.guestCount || value.searchQuery);
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
  const match = userText.match(/\b(?:a|à|en|dans|autour de|pres de|près de|vers|sur)\s+([^,.!?;\n]{2,60})/i);
  const raw = match?.[1]
    ?.split(/\b(?:avec|pour|si|mais|style|ambiance|budget|qui|et)\b/i)[0]
    ?.trim();
  if (!raw || raw.split(/\s+/).length > 6) return null;
  return formatDisplayLocation(raw);
}

export function normalizeIntentSearchCategory(value: unknown): VendorCategory | null {
  const normalized = typeof value === "string" ? normalizeForIntent(value) : "";
  if (!normalized) return null;
  if (/\b(lieu|lieux|salle|salles|domaine|domaines|chateau|chateaux|reception|venue)\b/.test(normalized)) return "venue";
  if (/\b(traiteur|traiteurs|caterer|repas|buffet|cocktail|diner|dîner|brunch|menu|menus)\b/.test(normalized)) return "caterer";
  if (/\b(photographe|photographes|photographer|photo|photos)\b/.test(normalized)) return "photographer";
  if (/\b(videaste|videastes|videographer|video|videos|film)\b/.test(normalized)) return "videographer";
  if (/\b(dj|disc jockey|animation musicale|soirée|soiree)\b/.test(normalized)) return "dj";
  if (/\b(groupe|musicien|musiciens|musician|musique live|orchestre|chanteur|chanteuse)\b/.test(normalized)) return "musician";
  if (/\b(fleuriste|fleuristes|flowers|fleurs|bouquet|floral)\b/.test(normalized)) return "flowers";
  if (/\b(deco|decor|decoration|décoration|decorateur|decoratrice|scenographie|scénographie)\b/.test(normalized)) return "decor";
  if (/\b(robe|robes|dress|couture|boutique mariee|mariée)\b/.test(normalized)) return "dress";
  if (/\b(costume|costumes|suit|tailleur)\b/.test(normalized)) return "suit";
  if (/\b(transport|voiture|navette|bus|chauffeur)\b/.test(normalized)) return "transport";
  return null;
}

function compactRecentMessages(messages: UiChatMessage[], count: number) {
  return messages
    .slice(-count)
    .map((message) => `${message.role === "user" ? "Couple" : "Hada"}: ${message.content.replace(/\s+/g, " ").slice(0, 360)}`)
    .join("\n");
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

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function vowelRatio(value: string) {
  const letters = value.replace(/[^a-z]/g, "");
  if (!letters) return 0;
  return (letters.match(/[aeiouy]/g)?.length ?? 0) / letters.length;
}

function formatDisplayLocation(value: string) {
  const normalized = normalizeForIntent(value).replace(/[^a-z0-9]+/g, " ").trim();
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

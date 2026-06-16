import type { ChatMessage, WeddingProfile } from "@/lib/types";

export type PlannerContext = {
  searchedCategories?: string[];
  savedCategories?: string[];
  recentPreferences?: string[];
};

export function formatBudgetSummary(profile: Partial<WeddingProfile> | null) {
  if (!profile) return null;

  const min = profile.budget_min;
  const max = profile.budget_max;

  if (min && max) return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  if (max) return formatCurrency(max);
  if (min) return formatCurrency(min);

  return null;
}

export function buildWeddingSummary(profile: Partial<WeddingProfile> | null) {
  if (!profile) return "Aucun profil mariage n'est encore renseigné.";

  const parts = [
    profile.partner_one_name || profile.partner_two_name
      ? `Prénoms des mariés : ${profile.partner_one_name ?? "?"} & ${profile.partner_two_name ?? "?"}`
      : null,
    profile.wedding_date ? `Date du mariage : ${profile.wedding_date}` : null,
    profile.wedding_period_text ? `Période : ${profile.wedding_period_text}` : null,
    profile.city ? `Lieu du mariage : ${profile.city}` : null,
    profile.region ? `Région : ${profile.region}` : null,
    profile.guest_count ? `Nombre d'invités : ${profile.guest_count}` : null,
    formatBudgetSummary(profile) ? `Budget global : ${formatBudgetSummary(profile)}` : null,
    profile.style ? `Style : ${profile.style}` : null,
    profile.ceremony_type ? `Cérémonie : ${profile.ceremony_type}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : "Profil mariage en cours de construction.";
}

export function buildConversationSummary(messages: ChatMessage[], context: PlannerContext = {}) {
  const recentMessages = messages
    .slice(-6)
    .map((message) => `${message.role === "user" ? "Couple" : "Hada"} : ${compactMessage(message.content, 220)}`)
    .filter(Boolean)
    .slice(-4)
    .join(" | ")
    .slice(0, 900);

  return [
    context.searchedCategories?.length ? `Catégories déjà recherchées : ${context.searchedCategories.join(", ")}` : null,
    context.savedCategories?.length ? `Catégories déjà enregistrées : ${context.savedCategories.join(", ")}` : null,
    context.recentPreferences?.length ? `Préférences récentes : ${context.recentPreferences.join(" | ")}` : null,
    recentMessages ? `Derniers échanges : ${recentMessages}` : "Aucun échange récent."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPlannerSystemPrompt(profile: Partial<WeddingProfile> | null, messages: ChatMessage[], context: PlannerContext = {}) {
  const weddingSummary = buildWeddingSummary(profile);
  const conversationSummary = buildConversationSummary(messages, context);
  const conversationMemory = messages
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()} : ${compactMessage(message.content, 260)}`)
    .join("\n");

  return `
Tu es Hada, une wedding planner experte, chaleureuse, joviale et rassurante.
Tu aides les futurs mariés à trouver les meilleurs prestataires pour leur mariage et à les contacter.
Tu réponds uniquement en français, tu vouvoies le couple, et tu ne révèles jamais que tu es une IA.

## MISSION
Tu pilotes uniquement la conversation de collecte du besoin.
Tu produis soit une réponse courte de clarification, soit un brief de recherche structuré invisible pour le serveur.
Tu ne présentes jamais de prestataires dans le chat.
Tu ne cites jamais de noms de prestataires.
Tu ne dis jamais que la recherche est terminée tant que le serveur ne t'a pas fourni de résultats.

## RÈGLES DE COLLECTE
Lis le profil couple avant de répondre et ne redemande jamais une information déjà connue.
Une recherche de prestataire ne démarre que si le couple demande explicitement de chercher, trouver, proposer, recommander, sélectionner ou lancer une recherche.
Une simple mention d'un prestataire ou une question de compréhension ("c'est quoi...", "tu connais...", "comment ça marche...", "avis sur...") n'est jamais une demande de recherche : réponds en conseil/explication et mets category à null.
Si le type de prestataire est clair et qu'aucune collecte n'est en cours, pose une seule question naturelle sur le style, l'ambiance ou l'envie principale.
Si le type de prestataire n'est pas clair, demande uniquement le type de prestataire recherché.
Dès qu'une collecte est en cours et que le couple répond, considère le brief suffisant et lance la recherche.
Ne demande jamais au couple de confirmer ou de dire "lance la recherche" après ta question de collecte : si la réponse est exploitable, status vaut ready.
Tu ne poses jamais plus de 2 questions pour une même recherche.
Si le contexte indique forceSearch: true, ton prochain message doit impérativement lancer la recherche.

## CATÉGORIES
Utilise uniquement ces catégories internes : venue, caterer, photographer, videographer, dj, musician, flowers, decor, dress, suit, transport.
Musique live, groupe, chanteur, chanteuse, jazz, acoustique, piano, guitare, violon, orchestre, trio, quartet ou live = musician.
DJ, disc jockey, mix ou platines = dj uniquement si le couple le demande explicitement.

## TON
Maximum 3 phrases visibles.
Objectif idéal : 2 phrases, 70 mots maximum.
Jamais de liste à puces, jamais de numérotation, jamais de formulaire déguisé.
Court, humain, confiant, un peu enjoué : comme une amie experte qui prend des notes.
Maximum 1 emoji, seulement si naturel.
Ne commence jamais par "Bien sûr !", "Absolument !" ou "Certainement !".

## CONTRAT DE SORTIE
À la fin de chaque réponse, ajoute exactement ce bloc pour le serveur, sans markdown :
HADA_STATE::{"status":"clarify|ready","category":"...","style":"...","constraints":"...","budget":"...","search_query":"..."}

Le bloc HADA_STATE n'est jamais destiné au couple.
status vaut "clarify" si tu poses une question.
status vaut "ready" si tu annonces que tu lances la recherche.
Si une information est absente, mets null.
Si status vaut "ready", category est obligatoire, search_query contient toujours le mot "mariage", la catégorie au singulier en français, le lieu connu, puis le style ou la contrainte principale si disponible.

## CONTEXTE COUPLE
${weddingSummary}

## RÉSUMÉ DE CONVERSATION
${conversationSummary}

## MÉMOIRE RÉCENTE
${conversationMemory || "Aucun historique."}
`.trim();
}

export function buildSearchAnnouncementPrompt(input: {
  profile: Partial<WeddingProfile> | null;
  categoryLabel: string;
  count: number;
  hasResults: boolean;
  isExternalFallback?: boolean;
}) {
  const weddingSummary = buildWeddingSummary(input.profile);

  return `
Tu es Hada, wedding planner chaleureuse et rassurante.
Écris un unique message visible pour le couple.
Le message doit être naturel, enthousiaste, humain, jamais technique.
Maximum 3 phrases.
Ne liste aucun prestataire et ne cite aucun nom.
Ne mentionne pas Firecrawl, Supabase, cache, API ou base de données.

Contexte couple : ${weddingSummary}
Catégorie recherchée : ${input.categoryLabel}
Nombre de fiches créées : ${input.count}

${
  input.hasResults
    ? "Annonce que tu as trouvé des prestataires et que les fiches sont prêtes à consulter via le bouton."
    : input.isExternalFallback
      ? "Explique que tu n'as pas encore de fiche assez fiable, et invite à ouvrir la recherche externe proposée par le bouton."
      : "Explique que tu n'as pas encore de fiche assez fiable, et invite à pousser une recherche plus large avec le bouton proposé."
}
`.trim();
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("fr-FR")} EUR`;
}

function compactMessage(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1).trim()}…` : compacted;
}

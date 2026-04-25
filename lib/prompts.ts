import type { ChatMessage, WeddingProfile } from "@/lib/types";

export function buildWeddingSummary(profile: Partial<WeddingProfile> | null) {
  if (!profile) {
    return "Aucun profil mariage n'est encore renseigne.";
  }

  const parts = [
    profile.partner_one_name || profile.partner_two_name
      ? `Couple: ${profile.partner_one_name ?? "?"} & ${profile.partner_two_name ?? "?"}`
      : null,
    profile.wedding_date ? `Date: ${profile.wedding_date}` : null,
    profile.wedding_period_text ? `Periode: ${profile.wedding_period_text}` : null,
    profile.city ? `Ville: ${profile.city}` : null,
    profile.guest_count ? `Invites: ${profile.guest_count}` : null,
    profile.budget_min || profile.budget_max
      ? `Budget: ${profile.budget_min ?? "?"} - ${profile.budget_max ?? "?"} EUR`
      : null,
    profile.style ? `Style: ${profile.style}` : null,
    profile.ceremony_type ? `Ceremonie: ${profile.ceremony_type}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : "Profil mariage en cours de construction.";
}

export function buildPlannerSystemPrompt(profile: Partial<WeddingProfile> | null, messages: ChatMessage[]) {
  const summary = buildWeddingSummary(profile);
  const conversationMemory = messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return `
Tu es Hada, un wedding planner IA premium.

Contexte utilisateur:
${summary}

Ton role:
- rappeler les informations deja connues
- identifier le type de prestataire recherche
- poser uniquement les questions necessaires pour completer les informations manquantes
- limiter les questions a 3 maximum a la fois
- si les infos sont suffisantes, reformuler les criteres et proposer de lancer la recherche
- ne jamais inventer des disponibilites, prix ou avis
- ne jamais pretendre qu'un prestataire a ete contacte sans confirmation explicite

Memoire recente:
${conversationMemory || "Aucun historique."}

Reponds en francais, avec un ton rassurant, concret et actionnable.
`.trim();
}

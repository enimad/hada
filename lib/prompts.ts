import type { WeddingProfile } from "@/lib/types";

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

function formatCurrency(value: number) {
  return `${value.toLocaleString("fr-FR")} EUR`;
}

import { env } from "@/lib/env";
import { looksLikeDirectoryPage } from "@/lib/directory-page-detector";
import { collectDisplayImageUrls } from "@/lib/image-url";
import type { VendorCandidateView, VendorCategory, VendorProfile, VendorProfileGeneratedFrom, WeddingProfile } from "@/lib/types";
import type { VendorCatalogEntry } from "@/lib/vendor-catalog";
import type { SearchReadyPayload } from "@/lib/server/hada";

type NormalizeInput = {
  candidate: VendorCatalogEntry;
  profile: Partial<WeddingProfile> | null;
  search: SearchReadyPayload;
};

type MistralMessage = {
  role: "user";
  content: string;
};

const NORMALIZER_VERSION = "vendor-profile-agent-v6";
const NORMALIZER_TIMEOUT_MS = 45000;
const VENDOR_PROFILE_AGENT_ID = process.env.MISTRAL_VENDOR_PROFILE_AGENT_ID?.trim() || "ag_019df51d1f447452afaf38b74a71c7dd";
const VENDOR_PROFILE_AGENT_VERSION = Number(process.env.MISTRAL_VENDOR_PROFILE_AGENT_VERSION?.trim() || 6);

const NORMALIZER_SYSTEM_PROMPT = `Tu es un expert senior en création de fiches prestataires mariage pour Hada.

Ta mission est de transformer des données brutes issues de recherche web en une fiche prestataire structurée, fiable, élégante et directement affichable dans une webapp.

Tu ne fais pas de conversation avec l'utilisateur.
Tu ne rédiges pas de réponse marketing longue.
Tu réponds uniquement en JSON valide.

Règles absolues :
- N'invente jamais une donnée.
- Si une information manque, mets null ou [].
- Ne mélange jamais les sections.
- Les avis clients vont uniquement dans reviews.
- Les images vont uniquement dans media.photos.
- Les coordonnées vont uniquement dans contact.
- Les informations pratiques vont dans logistics.
- Les informations propres au type de prestataire vont dans category_specific.
- La description doit être claire, premium et courte.
- Les points forts doivent être des tags courts, utiles et capitalisés.
- Les limites ou incertitudes vont dans summary.caveats.
- Supprime tout markdown, astérisque, séparateur ou symbole parasite.
- Les photos doivent être de vraies photos exploitables, jamais des logos, favicons, pictogrammes, avatars ou placeholders.
- Pour les lieux, les photos sont critiques : si aucune photo exploitable n'est disponible, ajoute "photos_lieu" dans quality.missing_fields.
- Si une adresse exacte est absente, ne l'invente pas.
- Si les avis structurés sont absents, garde snippets vide mais construis google_reviews_url.
- Si les coordonnées email/téléphone sont absentes, conserve au moins website_url si disponible.

Attention : les données brutes peuvent être désordonnées, mal classées ou présentes dans les mauvais champs.
Tu dois analyser tout le contenu disponible, pas seulement le nom des champs.
Un avis peut être dans description_detaillee, summary, specialites ou texte brut.
Une adresse peut être dans zone_intervention, description, footer ou coordonnées.
Une photo peut être dans une liste d'assets, de liens ou de contenu markdown.
Un tarif peut être mentionné dans une phrase libre.
Un téléphone peut être confondu avec une adresse ou une zone.
Une capacité peut être dans la description ou les points forts.
Le nom exact peut être différent du titre SEO de la page.
Si une information fiable est au mauvais endroit, déplace-la dans la bonne section.
Si elle est ambiguë ou non vérifiable, place-la dans summary.caveats ou quality.missing_fields, mais ne l'affiche pas comme une certitude.

Retourne exactement :
{
  "vendor_profile": {
    "identity": {
      "name": string,
      "category": string,
      "location_label": string,
      "exact_address": string | null,
      "service_area": string | null,
      "website_url": string | null
    },
    "media": {
      "photos": string[],
      "fallback_visual_type": "none" | "category_placeholder"
    },
    "summary": {
      "title": string,
      "about": string,
      "strengths": string[],
      "caveats": string[]
    },
    "contact": {
      "email": string | null,
      "phone": string | null,
      "website_url": string | null,
      "preferred_contact": "email" | "phone" | "website"
    },
    "reviews": {
      "rating": number | null,
      "review_count": number | null,
      "snippets": [],
      "google_reviews_url": string
    },
    "logistics": {
      "price_range": string | null,
      "capacity": string | null,
      "availability": string | null,
      "map_query": string | null
    },
    "category_specific": {},
    "quality": {
      "source_confidence": number,
      "missing_fields": string[],
      "generated_from": "official_site" | "directory" | "mixed_sources"
    }
  }
}`;

export { NORMALIZER_VERSION };

export async function normalizeVendorProfileWithMistral(input: NormalizeInput): Promise<{
  vendorProfile: VendorProfile;
  usedFallback: boolean;
  error?: string;
}> {
  const fallback = buildFallbackVendorProfile(input.candidate);

  if (!env.mistralApiKey) {
    return { vendorProfile: fallback, usedFallback: true, error: "missing_mistral_key" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NORMALIZER_TIMEOUT_MS);
    const messages: MistralMessage[] = [
      { role: "user", content: buildNormalizerUserMessage(input) }
    ];

    const response = await fetch("https://api.mistral.ai/v1/conversations", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.mistralApiKey}`
      },
      body: JSON.stringify({
        agent_id: VENDOR_PROFILE_AGENT_ID,
        agent_version: VENDOR_PROFILE_AGENT_VERSION,
        inputs: messages
      })
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return { vendorProfile: fallback, usedFallback: true, error: `mistral_agent_${response.status}` };
    }

    const data = await response.json();
    const content = extractConversationResponseText(data);
    const parsed = parseNormalizerResponse(content);
    const validated = validateVendorProfile(parsed, input.candidate);

    if (!validated) {
      return { vendorProfile: fallback, usedFallback: true, error: "invalid_vendor_profile" };
    }

    return { vendorProfile: validated, usedFallback: false };
  } catch (error) {
    return {
      vendorProfile: fallback,
      usedFallback: true,
      error: error instanceof Error ? error.message : "normalizer_error"
    };
  }
}

function buildNormalizerUserMessage(input: NormalizeInput) {
  return [
    "Consignes locales à appliquer impérativement :",
    NORMALIZER_SYSTEM_PROMPT,
    "Données à analyser :",
    JSON.stringify(buildNormalizerPayload(input), null, 2)
  ].join("\n\n");
}

export function buildFallbackVendorProfile(candidate: VendorCatalogEntry | VendorCandidateView): VendorProfile {
  const website = candidate.website ?? candidate.sourceUrl ?? null;
  const photos = cleanPhotos([...(candidate.images ?? []), candidate.image ?? null]);
  const googleReviewsUrl = candidate.reviewSearchUrl ?? buildGoogleReviewsUrl(candidate);
  const locationLabel = candidate.city ?? candidate.region ?? candidate.zoneIntervention ?? "France";
  const missingFields = [
    !candidate.email && !candidate.phone ? "coordonnees_directes" : null,
    photos.length === 0 && candidate.category === "venue" ? "photos_lieu" : null,
    !candidate.address ? "adresse_exacte" : null
  ].filter((item): item is string => Boolean(item));

  return {
    identity: {
      name: candidate.name,
      category: candidate.category,
      location_label: locationLabel,
      exact_address: candidate.address ?? null,
      service_area: candidate.zoneIntervention ?? candidate.region ?? candidate.city ?? null,
      website_url: website
    },
    media: {
      photos,
      fallback_visual_type: photos.length > 0 ? "none" : "category_placeholder"
    },
    summary: {
      title: candidate.name,
      about: sanitizeText(candidate.summary ?? candidate.specialties ?? "Fiche prestataire en cours d'enrichissement par Hada.") ?? "Fiche prestataire en cours d'enrichissement par Hada.",
      strengths: normalizeStrengths(candidate.highlights ?? []),
      caveats: normalizeStrengths(candidate.limitations ?? [])
    },
    contact: {
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
      website_url: website,
      preferred_contact: candidate.email ? "email" : candidate.phone ? "phone" : "website"
    },
    reviews: {
      rating: candidate.rating ?? null,
      review_count: candidate.reviewsCount ?? null,
      snippets: candidate.reviewSnippets ?? [],
      google_reviews_url: googleReviewsUrl
    },
    logistics: {
      price_range: candidate.priceRange ?? null,
      capacity: candidate.capacity ?? null,
      availability: candidate.availability ?? candidate.contactLead ?? null,
      map_query: buildMapQuery(candidate)
    },
    category_specific: normalizeCategorySpecific(buildFallbackCategorySpecific(candidate)),
    quality: {
      source_confidence: estimateSourceConfidence(candidate),
      missing_fields: missingFields,
      generated_from: estimateGeneratedFrom(candidate)
    }
  };
}

function buildNormalizerPayload(input: NormalizeInput) {
  return {
    instruction:
      "Analyse toutes les données, même si elles sont mal placées dans le JSON Firecrawl, puis retourne uniquement le JSON final de fiche prestataire compatible avec Hada.",
    display_contract: {
      rule:
        "Chaque information factuelle doit avoir un seul emplacement propriétaire. Ne répète jamais le même fait entre summary.about, summary.strengths, logistics et category_specific.",
      summary_about:
        "2 à 3 phrases éditoriales courtes, sans lister prix, capacité, adresse, téléphone, email, avis ou détails déjà structurés.",
      summary_strengths:
        "Tags courts différenciants uniquement. Jamais de coordonnées, adresse, tarif, capacité, zone, phrase longue ou texte tronqué.",
      logistics: "Prix, capacité, disponibilité et map_query uniquement.",
      contact: "Email, téléphone et site web uniquement.",
      reviews: "Note, nombre, snippets et lien d'avis uniquement.",
      category_specific:
        "Uniquement des détails métier distincts, concis et non répétés. Si deux champs disent la même chose, garde seulement le champ le plus spécifique.",
      forbidden_structured_values: ["à confirmer", "sur demande", "à définir", "non détecté"],
      final_check:
        "Avant de répondre, fais une passe anti-duplication : si un champ reprend summary.about ou un strength entier, mets ce champ à null."
    },
    category: input.search.category,
    couple_profile: {
      date: input.profile?.wedding_date ?? input.profile?.wedding_period_text ?? null,
      location: input.profile?.city ?? input.profile?.region ?? input.profile?.country ?? null,
      guest_count: input.profile?.guest_count ?? null,
      budget: [input.profile?.budget_min, input.profile?.budget_max].filter(Boolean).join(" - ") || null
    },
    search_brief: {
      style: input.search.style,
      constraints: input.search.constraints,
      budget: input.search.budget,
      query: input.search.searchQuery
    },
    raw_firecrawl: input.candidate,
    source: {
      url: input.candidate.sourceUrl,
      domain: getDomain(input.candidate.sourceUrl ?? input.candidate.website)
    }
  };
}

function extractConversationResponseText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractConversationResponseText).filter(Boolean).join("\n") || null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (record.vendor_profile || record.vendorProfile || record.profile || record.identity) {
    return JSON.stringify(record);
  }
  const direct =
    readTextField(record, ["output_text", "text", "content", "message", "response"]) ??
    extractConversationResponseText(record.output) ??
    extractConversationResponseText(record.outputs) ??
    extractConversationResponseText(record.messages) ??
    extractConversationResponseText(record.entries) ??
    extractConversationResponseText(record.data);

  if (direct) return direct;

  const choices = record.choices;
  if (Array.isArray(choices)) {
    return extractConversationResponseText(choices);
  }

  return null;
}

function readTextField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const nested = extractConversationResponseText(value);
      if (nested) return nested;
    }
    if (value && typeof value === "object") {
      const nested = extractConversationResponseText(value);
      if (nested) return nested;
    }
  }

  return null;
}

function parseNormalizerResponse(content: string | null | undefined) {
  if (!content) return null;
  const cleaned = content.replace(/```json|```/gi, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return wrapNormalizerPayload(parsed);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      return wrapNormalizerPayload(parsed);
    } catch {
      return null;
    }
  }
}

function wrapNormalizerPayload(parsed: Record<string, unknown>) {
  if ("vendor_profile" in parsed) return parsed;
  if ("vendorProfile" in parsed) return { vendor_profile: parsed.vendorProfile };
  if ("profile" in parsed) return { vendor_profile: parsed.profile };
  return { vendor_profile: parsed };
}

function validateVendorProfile(parsed: { vendor_profile?: unknown } | null, candidate: VendorCatalogEntry): VendorProfile | null {
  if (!parsed?.vendor_profile || typeof parsed.vendor_profile !== "object") return null;
  const raw = parsed.vendor_profile as VendorProfile;

  const name = sanitizeText(raw.identity?.name ?? candidate.name);
  const category = normalizeCategory(raw.identity?.category, candidate.category);
  const website = cleanUrl(raw.identity?.website_url ?? raw.contact?.website_url ?? candidate.website ?? candidate.sourceUrl ?? null);
  const photos = cleanPhotos(raw.media?.photos ?? candidate.images ?? []);
  const googleReviewsUrl = cleanUrl(raw.reviews?.google_reviews_url) ?? buildGoogleReviewsUrl(candidate);
  const contactEmail = cleanEmail(raw.contact?.email ?? candidate.email ?? null);
  const contactPhone = sanitizeText(raw.contact?.phone ?? candidate.phone ?? null);
  const about = sanitizeText(raw.summary?.about ?? candidate.summary ?? "");

  if (!name || !category || !about || (!website && !contactEmail && !contactPhone)) return null;

  const missingFields = Array.from(
    new Set([
      ...toStringArray(raw.quality?.missing_fields),
      photos.length === 0 && category === "venue" ? "photos_lieu" : null
    ].filter((item): item is string => Boolean(item)))
  );

  return {
    identity: {
      name,
      category,
      location_label: sanitizeText(raw.identity?.location_label ?? candidate.city ?? candidate.region ?? "France") ?? "France",
      exact_address: sanitizeText(raw.identity?.exact_address ?? candidate.address ?? null),
      service_area: sanitizeText(raw.identity?.service_area ?? candidate.zoneIntervention ?? candidate.region ?? null),
      website_url: website
    },
    media: {
      photos,
      fallback_visual_type: photos.length > 0 ? "none" : "category_placeholder"
    },
    summary: {
      title: sanitizeText(raw.summary?.title ?? name) ?? name,
      about,
      strengths: normalizeStrengths(raw.summary?.strengths ?? candidate.highlights ?? []),
      caveats: normalizeStrengths(raw.summary?.caveats ?? candidate.limitations ?? [])
    },
    contact: {
      email: contactEmail,
      phone: contactPhone,
      website_url: website,
      preferred_contact: contactEmail ? "email" : contactPhone ? "phone" : "website"
    },
    reviews: {
      rating: normalizeNumber(raw.reviews?.rating ?? candidate.rating ?? null),
      review_count: normalizeInteger(raw.reviews?.review_count ?? candidate.reviewsCount ?? null),
      snippets: normalizeReviews(raw.reviews?.snippets ?? candidate.reviewSnippets ?? []),
      google_reviews_url: googleReviewsUrl
    },
    logistics: {
      price_range: sanitizeText(raw.logistics?.price_range ?? candidate.priceRange ?? null),
      capacity: sanitizeText(raw.logistics?.capacity ?? candidate.capacity ?? null),
      availability: sanitizeText(raw.logistics?.availability ?? candidate.availability ?? candidate.contactLead ?? null),
      map_query: sanitizeText(raw.logistics?.map_query ?? buildMapQuery(candidate))
    },
    category_specific: normalizeCategorySpecific(raw.category_specific ?? buildFallbackCategorySpecific(candidate)),
    quality: {
      source_confidence: clampConfidence(raw.quality?.source_confidence ?? estimateSourceConfidence(candidate)),
      missing_fields: missingFields,
      generated_from: normalizeGeneratedFrom(raw.quality?.generated_from, candidate)
    }
  };
}

function buildFallbackCategorySpecific(candidate: VendorCatalogEntry | VendorCandidateView) {
  switch (candidate.category) {
    case "venue":
      return {
        type_lieu: conciseValue(candidate.vibe) ?? conciseValue(candidate.specialties) ?? null,
        capacite: candidate.capacity ?? null,
        hebergement: null,
        espaces_exterieurs: null,
        plan_b: null,
        traiteur_impose: null,
        parking: null
      };
    case "caterer":
      return {
        type_cuisine: conciseValue(candidate.specialties) ?? conciseValue(candidate.vibe) ?? null,
        formats: candidate.priceRange ?? null,
        regimes: candidate.limitations?.join(", ") || null,
        service_inclus: candidate.highlights?.join(", ") || null,
        capacite: candidate.capacity ?? null,
        degustation: null
      };
    case "photographer":
      return {
        style_photo: candidate.vibe ?? null,
        approche: candidate.specialties ?? null,
        livraison: null,
        delai_livraison: candidate.availability ?? null,
        galerie: null
      };
    case "videographer":
      return {
        style_video: candidate.vibe ?? null,
        formats_livres: null,
        drone: null,
        delai_livraison: candidate.availability ?? null
      };
    case "dj":
    case "musician":
      return {
        style_musical: conciseValue(candidate.vibe) ?? conciseValue(candidate.specialties) ?? null,
        formats: null,
        materiel: null,
        animation: null,
        experience_mariage: candidate.summary ?? null
      };
    case "flowers":
    case "decor":
      return {
        style: conciseValue(candidate.vibe) ?? null,
        prestations: candidate.specialties ?? null,
        installation: candidate.availability ?? null,
        location_materiel: null
      };
    case "dress":
    case "suit":
      return {
        style: candidate.vibe ?? null,
        gamme_prix: candidate.priceRange ?? null,
        rendez_vous: candidate.availability ?? null,
        delais: null
      };
    case "transport":
      return {
        type_transport: candidate.vibe ?? null,
        capacite: candidate.capacity ?? null,
        zone: candidate.zoneIntervention ?? candidate.region ?? null,
        horaires: candidate.availability ?? null
      };
  }
}

function normalizeCategory(value: unknown, fallback: VendorCategory): VendorCategory {
  const normalized = typeof value === "string" ? value : fallback;
  const allowed: VendorCategory[] = ["venue", "caterer", "photographer", "videographer", "dj", "musician", "decor", "dress", "suit", "flowers", "transport"];
  return allowed.includes(normalized as VendorCategory) ? (normalized as VendorCategory) : fallback;
}

function normalizeCategorySpecific(value: unknown): Record<string, string | string[] | null> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => {
      if (Array.isArray(rawValue)) {
        const values = normalizeStrengths(rawValue);
        return [key, values.length > 0 ? values : null];
      }
      if (typeof rawValue === "string" && rawValue.trim()) return [key, normalizeSpecificText(rawValue)];
      return [key, null];
    })
  );
}

function normalizeReviews(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const review = item as Record<string, unknown>;
      const text = sanitizeText(review.text);
      if (!text || text.length < 12) return null;
      return {
        author: sanitizeText(review.author) || "Client",
        text,
        rating: normalizeNumber(review.rating),
        date: sanitizeText(review.date),
        source: sanitizeText(review.source)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
}

function normalizeStrengths(value: unknown) {
  return Array.from(
    new Set(
      toStringArray(value)
        .map(sanitizeText)
        .filter((item): item is string => Boolean(item))
        .filter((item) => item.length <= 62 && wordCount(item) <= 8 && !isTruncatedText(item))
        .filter((item) => !isWeakPlaceholder(item))
        .map(capitalizeFirst)
    )
  ).slice(0, 6);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (typeof value === "string" && value.trim()) return value.split(/[,;|•]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function cleanPhotos(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return collectDisplayImageUrls(values, null, 8);
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.hostname.replace(/^www\./, "") === "example.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanEmail(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function sanitizeText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/[*#_`>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function conciseValue(value: unknown) {
  const text = sanitizeText(value);
  if (!text || text.length > 80 || isTruncatedText(text) || isWeakPlaceholder(text)) return null;
  return text;
}

function isTruncatedText(value: string) {
  return /(\.\.\.|…)$/.test(value.trim()) || / \.\.\./.test(value);
}

function normalizeSpecificText(value: string) {
  const text = sanitizeText(value);
  if (!text || isWeakPlaceholder(text) || isTruncatedText(text)) return null;
  if (text.length > 110 || wordCount(text) > 14) return null;
  return capitalizeFirst(text);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isWeakPlaceholder(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return ["a confirmer", "a definir", "sur demande", "non detecte", "non disponible", "null"].includes(normalized);
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function clampConfidence(value: unknown) {
  const number = normalizeNumber(value) ?? 0.5;
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

function normalizeGeneratedFrom(value: unknown, candidate: VendorCatalogEntry): VendorProfileGeneratedFrom {
  if (value === "official_site" || value === "directory" || value === "mixed_sources") return value;
  return estimateGeneratedFrom(candidate);
}

function estimateGeneratedFrom(candidate: VendorCatalogEntry | VendorCandidateView): VendorProfileGeneratedFrom {
  const source = candidate.sourceUrl ?? "";
  const website = candidate.website ?? "";
  // Détection structurelle partagée (couvre pagesjaunes sans tiret, zankyou.*, formes d'URL/annuaire...).
  if (source && looksLikeDirectoryPage({ url: source })) return "directory";
  if (source && website && getDomain(source) === getDomain(website)) return "official_site";
  return "mixed_sources";
}

function estimateSourceConfidence(candidate: VendorCatalogEntry | VendorCandidateView) {
  let score = 0.45;
  if (candidate.website) score += 0.15;
  if (candidate.email || candidate.phone) score += 0.15;
  if (candidate.images?.length || candidate.image) score += 0.1;
  if (candidate.rating) score += 0.1;
  if (candidate.summary || candidate.specialties) score += 0.05;
  return Math.min(Number(score.toFixed(2)), 1);
}

function buildGoogleReviewsUrl(candidate: VendorCatalogEntry | VendorCandidateView) {
  const query = `${candidate.name} ${categoryLabel(candidate.category)} ${candidate.city ?? candidate.region ?? ""} mariage avis Google Maps`;
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}

function buildMapQuery(candidate: VendorCatalogEntry | VendorCandidateView) {
  const location = candidate.address ?? candidate.city ?? candidate.region;
  return location ? `${candidate.name} ${location}` : null;
}

function categoryLabel(category: VendorCategory) {
  switch (category) {
    case "venue":
      return "lieu";
    case "caterer":
      return "traiteur";
    case "photographer":
      return "photographe";
    case "videographer":
      return "vidéaste";
    case "dj":
      return "DJ";
    case "musician":
      return "musicien";
    case "flowers":
      return "fleuriste";
    case "decor":
      return "décoration";
    case "dress":
      return "robe";
    case "suit":
      return "costume";
    case "transport":
      return "transport";
  }
}

function getDomain(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function capitalizeFirst(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("fr-FR") + trimmed.slice(1);
}

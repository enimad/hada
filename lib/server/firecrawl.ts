import Firecrawl from "@mendable/firecrawl-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { collectDisplayImageUrls, isLikelyImageUrl } from "@/lib/image-url";
import type { VendorCategory, VendorReviewSnippet, WeddingProfile } from "@/lib/types";
import type { VendorCatalogEntry } from "@/lib/vendor-catalog";

type FirecrawlVendorResult = VendorCatalogEntry;

type SearchResultLike = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

type FirecrawlSearchItem = {
  url?: string | null;
  link?: string | null;
  title?: string | null;
  description?: string | null;
  snippet?: string | null;
  markdown?: string | null;
};

const EXTRACTION_PROMPT = `Tu analyses la page d'un potentiel prestataire de mariage.
Réponds UNIQUEMENT avec un objet JSON. Ne génère rien d'autre.
Si une information est absente de la page, mets null pour ce champ.
N'invente aucune information.

Vérifie en priorité : ce prestataire travaille-t-il explicitement pour des mariages ?
Si la page ne mentionne pas "mariage", "wedding", "union", "cérémonie" ou équivalent, retourne { "hors_perimetre": true } et rien d'autre.

Si le prestataire travaille bien pour des mariages, retourne :
{
  "hors_perimetre": false,
  "nom": "",
  "categorie": "",
  "adresse": "",
  "zone_intervention": "",
  "email": "",
  "telephone": "",
  "site_web": "",
  "note_moyenne": null,
  "nombre_avis": null,
  "fourchette_prix": "",
  "capacite_invites": null,
  "style": "",
  "description_detaillee": "",
  "points_forts": [],
  "specialites": "",
  "contraintes": "",
  "disponibilite": "",
  "references_mariage": "",
  "photos": [],
  "avis": []
}

Le champ "references_mariage" doit contenir une courte phrase extraite de la page qui confirme que ce prestataire fait des mariages.`;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    hors_perimetre: { type: ["boolean", "null"] },
    nom: { type: ["string", "null"] },
    categorie: { type: ["string", "null"] },
    adresse: { type: ["string", "null"] },
    zone_intervention: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    telephone: { type: ["string", "null"] },
    site_web: { type: ["string", "null"] },
    note_moyenne: { type: ["string", "number", "null"] },
    nombre_avis: { type: ["string", "number", "null"] },
    fourchette_prix: { type: ["string", "null"] },
    capacite_invites: { type: ["string", "number", "null"] },
    style: { type: ["string", "null"] },
    description_detaillee: { type: ["string", "null"] },
    points_forts: {
      type: ["array", "null"],
      items: { type: "string" }
    },
    specialites: { type: ["string", "null"] },
    contraintes: { type: ["string", "null"] },
    disponibilite: { type: ["string", "null"] },
    references_mariage: { type: ["string", "null"] },
    photos: {
      type: ["array", "null"],
      items: { type: "string" }
    },
    avis: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          auteur: { type: ["string", "null"] },
          note: { type: ["string", "number", "null"] },
          date: { type: ["string", "null"] },
          texte: { type: ["string", "null"] },
          source: { type: ["string", "null"] }
        }
      }
    }
  }
} as const;

export async function searchVendorsWithFirecrawl(
  supabase: SupabaseClient,
  input: {
    userId: string;
    category: VendorCategory;
    query: string;
    profile: Partial<WeddingProfile> | null;
    mode?: "strict" | "expanded";
  }
): Promise<FirecrawlVendorResult[]> {
  const apiKeys = env.firecrawlApiKeys;
  if (apiKeys.length === 0) {
    return [];
  }

  const disabledKeyIndexes = new Set<number>();

  try {
    // Clés API Firecrawl à renseigner dans .env.local via FIRECRAWL_API_KEY ou FIRECRAWL_API_KEYS.
    const existingDomains = await loadExistingDomains(supabase, input.userId);
    const mode = input.mode ?? "strict";
    const searchQuery = buildFirecrawlQuery(input.category, input.query, input.profile, mode);

    const searchResults = await withFirecrawlKeyRotation(apiKeys, disabledKeyIndexes, "search", (firecrawl) =>
      firecrawl.search(searchQuery, {
        sources: ["web"],
        limit: 10,
        lang: "fr",
        timeout: 12000,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
          fastMode: true
        }
      } as never)
    );

    const selectedResults = readFirecrawlSearchItems(searchResults)
      .map((item) => ({
        url: extractUrl(item) ?? "",
        title: item.title ?? undefined,
        description: item.description ?? item.snippet ?? item.markdown ?? undefined,
        markdown: item.markdown ?? undefined
      }))
      .filter((item) => item.url)
      .filter((item) => passesPreScrapeFilters(item, input.category, existingDomains, mode))
      .slice(0, 5);

    const results = await Promise.all(
      selectedResults.map((result) => scrapeVendorResult(apiKeys, disabledKeyIndexes, result, input.category, input.query, input.profile, mode))
    );

    const validResults = results
      .filter((item): item is FirecrawlVendorResult => Boolean(item))
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, 3);

    if (validResults.length >= 3) return validResults;

    const fallbackResults = selectedResults
      .filter((result) => !validResults.some((candidate) => sameDomain(candidate.website ?? candidate.sourceUrl ?? "", result.url)))
      .map((result) => buildSearchResultCandidate(result, input.category, input.query, input.profile))
      .filter((item): item is FirecrawlVendorResult => Boolean(item));

    return [...validResults, ...fallbackResults]
      .filter((candidate) => hasEnoughDataForProfile(candidate, input.category))
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, 3);
  } catch (error) {
    console.error("Firecrawl search error", error);
    return [];
  }
}

async function scrapeVendorResult(
  apiKeys: string[],
  disabledKeyIndexes: Set<number>,
  searchResult: SearchResultLike,
  category: VendorCategory,
  query: string,
  profile: Partial<WeddingProfile> | null,
  mode: "strict" | "expanded"
) {
  try {
    const doc = await withFirecrawlKeyRotation(apiKeys, disabledKeyIndexes, "scrape", (firecrawl) =>
      firecrawl.scrape(searchResult.url, {
        formats: [
          "markdown",
          {
            type: "json",
            prompt: EXTRACTION_PROMPT,
            schema: EXTRACTION_SCHEMA
          }
        ],
        onlyMainContent: true,
        fastMode: true,
        timeout: 12000
      } as never)
    );

    const document = unwrapFirecrawlDocument(doc);
    const extracted = document.json ?? document.extract ?? document.data ?? null;
    const markdown =
      [document.markdown, document.content].find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;

    return toVendorResult(extracted, searchResult, category, query, profile, mode, markdown);
  } catch (error) {
    console.error("Firecrawl scrape error", error);
    return null;
  }
}

async function withFirecrawlKeyRotation<T>(
  apiKeys: string[],
  disabledKeyIndexes: Set<number>,
  operation: "search" | "scrape",
  run: (firecrawl: Firecrawl) => Promise<T>
) {
  let lastError: unknown = null;

  for (let index = 0; index < apiKeys.length; index += 1) {
    if (disabledKeyIndexes.has(index)) continue;

    try {
      const apiKey = apiKeys[index];
      if (!apiKey) continue;
      // Clé API Firecrawl à renseigner dans .env.local ou FIRECRAWL_API_KEYS.
      const firecrawl = new Firecrawl({ apiKey });
      return await run(firecrawl);
    } catch (error) {
      lastError = error;
      if (!shouldRotateFirecrawlKey(error)) throw error;

      disabledKeyIndexes.add(index);
      console.warn(`Firecrawl ${operation}: clé ${index + 1}/${apiKeys.length} indisponible, bascule vers la suivante.`);
    }
  }

  throw lastError ?? new Error("Toutes les clés Firecrawl sont indisponibles.");
}

function shouldRotateFirecrawlKey(error: unknown) {
  const details = readFirecrawlErrorDetails(error);
  if ([401, 402, 403, 429].includes(details.status)) return true;
  return /(credit|credits|quota|billing|payment|rate.?limit|unauthorized|forbidden|api.?key|insufficient)/i.test(`${details.code} ${details.message}`);
}

function readFirecrawlErrorDetails(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const status = Number(record.status ?? record.statusCode ?? record.codeStatus ?? 0);
  const code = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return { status, code, message };
}

async function loadExistingDomains(supabase: SupabaseClient, userId: string) {
  const { data: requests } = await supabase.from("vendor_requests").select("id").eq("user_id", userId);
  const requestIds = (requests ?? []).map((item) => item.id);
  if (requestIds.length === 0) return new Set<string>();

  const { data: candidates } = await supabase.from("vendor_candidates").select("source_url, website, score, metadata_json").in("vendor_request_id", requestIds);
  return new Set(
    (candidates ?? [])
      .filter((item) => item.metadata_json?.normalizer_error !== true)
      .filter((item) => Number(item.score ?? 0) >= 45)
      .flatMap((item) => [item.source_url, item.website])
      .filter(Boolean)
      .map((url) => extractDomain(url as string))
  );
}

function readFirecrawlSearchItems(raw: unknown): FirecrawlSearchItem[] {
  if (Array.isArray(raw)) return raw as FirecrawlSearchItem[];
  if (!raw || typeof raw !== "object") return [];

  const response = raw as Record<string, unknown>;
  const nestedData = response.data && typeof response.data === "object" && !Array.isArray(response.data) ? (response.data as Record<string, unknown>) : null;
  const sources = [
    response.web,
    response.data,
    response.results,
    response.items,
    nestedData?.web,
    nestedData?.results,
    nestedData?.items
  ];
  return sources.find((value): value is FirecrawlSearchItem[] => Array.isArray(value)) ?? [];
}

function unwrapFirecrawlDocument(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};

  const document = raw as Record<string, unknown>;
  const data = document.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    return {
      ...payload,
      json: payload.json ?? payload.extract ?? document.json ?? document.extract ?? null,
      markdown: payload.markdown ?? document.markdown ?? null,
      content: payload.content ?? document.content ?? null
    };
  }

  return document;
}

function buildFirecrawlQuery(category: VendorCategory, query: string, profile: Partial<WeddingProfile> | null, mode: "strict" | "expanded") {
  const location = getPrimarySearchLocation(profile);
  const baseQuery = buildCategorySearchCore(category, location);
  const modifiers = cleanSearchModifiers(query, category, location);
  const directoryHint = mode === "expanded" ? "mariages.net zankyou bridebook" : "";
  return compactFirecrawlQuery(`${baseQuery} ${modifiers} ${directoryHint}`, mode === "expanded" ? 12 : 10).slice(0, 160);
}

function getPrimarySearchLocation(profile: Partial<WeddingProfile> | null) {
  const raw = profile?.city ?? profile?.region ?? profile?.country ?? "France";
  const withoutContext = raw
    .split(",")[0]
    .replace(/\([^)]*\)/g, "")
    .trim();
  return withoutContext || raw;
}

function buildCategorySearchCore(category: VendorCategory, location: string) {
  switch (category) {
    case "venue":
      return `lieu réception mariage ${location}`;
    case "caterer":
      return `traiteur mariage ${location}`;
    case "photographer":
      return `photographe mariage ${location}`;
    case "videographer":
      return `vidéaste mariage ${location} film mariage`;
    case "dj":
      return `DJ mariage ${location}`;
    case "musician":
      return `groupe musique live mariage ${location}`;
    case "flowers":
      return `fleuriste mariage ${location}`;
    case "decor":
      return `décorateur mariage ${location}`;
    case "dress":
      return `robe mariée ${location} boutique mariage`;
    case "suit":
      return `costume mariage ${location} boutique homme`;
    case "transport":
      return `transport mariage ${location} chauffeur voiture`;
  }
}

function cleanSearchModifiers(query: string, category: VendorCategory, location: string) {
  const blacklist = new Set([
    "mariage",
    normalize(categoryToShortLabel(category)),
    "avis",
    "avisclient",
    "avisclients",
    "client",
    "clients",
    "google",
    "site",
    "officiel",
    "officielle",
    "contact",
    "contacts",
    "invite",
    "invites",
    "invité",
    "invités",
    "convive",
    "convives",
    "personne",
    "personnes",
    "nombre",
    "note",
    "notes",
    "etoile",
    "etoiles",
    "étoile",
    "étoiles"
  ]);
  for (const token of normalize(location).split(/\s+/)) {
    if (token) blacklist.add(token);
  }

  const categorySynonymsSeen = new Set<string>();
  const seen = new Set<string>();

  return query
    .replace(/[()"'“”‘’.,;:!?[\]{}|/\\]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => {
      const normalized = normalize(word);
      if (normalized.length <= 2 || blacklist.has(normalized) || /^\d+$/.test(normalized) || seen.has(normalized)) return false;
      seen.add(normalized);

      const synonymGroup = categorySearchSynonymGroup(category);
      if (synonymGroup.has(normalized)) {
        if (categorySynonymsSeen.size > 0) return false;
        categorySynonymsSeen.add(normalized);
      }

      return true;
    })
    .slice(0, 5)
    .join(" ");
}

function compactFirecrawlQuery(value: string, maxTerms: number) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const word of value.replace(/[()"'“”‘’.,;:!?[\]{}|/\\]+/g, " ").split(/\s+/)) {
    const trimmed = word.trim();
    const normalized = normalize(trimmed);
    if (!trimmed || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(trimmed);
    if (output.length >= maxTerms) break;
  }

  return output.join(" ");
}

function categorySearchSynonymGroup(category: VendorCategory) {
  switch (category) {
    case "venue":
      return new Set(["domaine", "chateau", "château", "salle", "reception", "réception"]);
    case "caterer":
      return new Set(["cocktail", "diner", "dîner", "buffet", "reception", "réception"]);
    case "photographer":
      return new Set(["reportage", "naturel", "photo"]);
    case "videographer":
      return new Set(["film", "video", "vidéo"]);
    case "dj":
      return new Set(["soiree", "soirée", "animation"]);
    case "musician":
      return new Set(["chanteur", "acoustique", "orchestre"]);
    case "flowers":
      return new Set(["decoration", "décoration", "florale"]);
    case "decor":
      return new Set(["scenographie", "scénographie", "decoration", "décoration"]);
    default:
      return new Set<string>();
  }
}

function extractUrl(item: { url?: string | null; link?: string | null }) {
  const value = item.url ?? item.link;
  return typeof value === "string" && value.trim() ? value : null;
}

function passesPreScrapeFilters(
  item: SearchResultLike,
  category: VendorCategory,
  existingDomains: Set<string>,
  mode: "strict" | "expanded"
) {
  const domain = extractDomain(item.url);
  const lowerUrl = item.url.toLowerCase();
  const lowerTarget = normalize(`${item.url} ${item.title ?? ""} ${item.description ?? ""}`);

  if (isSocialDomain(domain)) return false;
  if (mode === "strict" && isGenericDirectoryDomain(domain) && !isUsefulWeddingDirectoryDomain(domain)) return false;
  if (/\/(blog|article|guide|conseil|inspiration|tendance|actualite)\//i.test(lowerUrl)) return false;
  if (existingDomains.has(domain)) return false;
  if (mode === "strict" && !categoryKeywords(category).some((keyword) => lowerTarget.includes(normalize(keyword)))) return false;

  return true;
}

function isGenericDirectoryDomain(domain: string) {
  return /(^|\.)mariages\.net$|(^|\.)mariage\.com$|(^|\.)zankyou\.fr$|pages-jaunes\.fr|(^|\.)yelp\.fr$|(^|\.)tripadvisor\.fr$|leboncoin\.fr|(^|\.)annuaire\.|(^|\.)directory\.|(^|\.)list\./.test(
    domain
  );
}

function isUsefulWeddingDirectoryDomain(domain: string) {
  return /(^|\.)mariages\.net$|(^|\.)mariage\.com$|(^|\.)zankyou\.fr$|(^|\.)bridebook\.com$/.test(domain);
}

function isSocialDomain(domain: string) {
  return /facebook\.com|instagram\.com|linkedin\.com|pinterest\.com|tiktok\.com/.test(domain);
}

function isLikelyOfficialProviderPage(item: SearchResultLike, category: VendorCategory) {
  const domain = extractDomain(item.url);
  const target = normalize(`${item.url} ${item.title ?? ""} ${item.description ?? ""}`);

  if (isSocialDomain(domain)) return false;
  if (/\/(blog|article|guide|conseil|inspiration|tendance|actualite)\//i.test(item.url)) return false;
  if (!target.includes("mariage") && !target.includes("wedding") && !target.includes(categoryToShortLabel(category))) return false;
  if (!categoryKeywords(category).some((keyword) => target.includes(normalize(keyword)))) return false;

  return true;
}

function buildSearchResultCandidate(
  searchResult: SearchResultLike,
  category: VendorCategory,
  query: string,
  profile: Partial<WeddingProfile> | null
): FirecrawlVendorResult | null {
  if (!isLikelyOfficialProviderPage(searchResult, category)) return null;

  const name = extractProviderName(searchResult);
  if (!name) return null;
  if (isGenericProviderName(name, category)) return null;

  const website = sanitizeWebsite(searchResult.url, searchResult.url);
  if (!website) return null;

  const city = extractLocationFromSearchResult(searchResult, profile);
  const richText = [searchResult.markdown, searchResult.description, searchResult.title].filter(Boolean).join("\n");
  const summary = buildSearchResultSummary(searchResult, category);
  const sourceLabel = extractDomain(website);
  const reviewSearchUrl = buildReviewSearchUrl(name, category, city);
  const email = extractEmail(richText);
  const phone = extractPhone(richText);
  const images = readImages({}, website, searchResult.markdown ?? null);
  const highlights = buildFallbackHighlights(searchResult, category);
  const score = Math.max(
    computeQualityScore({
      profile,
      zoneIntervention: city,
      rating: null,
      reviewsCount: null,
      email,
      priceRange: null,
      weddingReference: summary
    }),
    website && summary ? (email || phone || images.length > 0 ? 45 : 35) : 0
  );

  if (score < 25) return null;

  return {
    id: `firecrawl-search-${slugify(name)}-${sourceLabel}`,
    slug: slugify(name),
    name,
    category,
    website,
    email,
    phone,
    address: null,
    city,
    region: city,
    priceRange: null,
    priceValue: 0,
    guestCapacity: 0,
    score,
    summary,
    sourceUrl: searchResult.url,
    image: images[0] ?? null,
    images,
    capacity: null,
    vibe: null,
    rating: null,
    reviewsCount: null,
    highlights,
    tags: buildTags(category, city, null, null),
    match: null,
    contactLead: email || phone ? "Coordonnées détectées depuis la page source." : "Coordonnées à vérifier sur le site web.",
    sourceLabel,
    keywords: buildKeywords(category, query, city, null, null),
    limitations: ["Fiche à compléter depuis le site web"],
    reviewSearchUrl,
    reviewSnippets: [],
    availability: null,
    specialties: null,
    zoneIntervention: city
  };
}

function buildFallbackHighlights(searchResult: SearchResultLike, category: VendorCategory) {
  const values = [categoryToShortLabel(category), extractDomain(searchResult.url), searchResult.description]
    .filter(Boolean)
    .flatMap((value) => splitValues(String(value)))
    .map(capitalizeFirst)
    .filter((value) => value.length >= 3 && value.length <= 70);

  return Array.from(new Set(values)).slice(0, 3);
}

function buildSearchResultSummary(searchResult: SearchResultLike, category: VendorCategory) {
  const description = searchResult.description?.replace(/\s+/g, " ").trim();
  if (description && description.length >= 40) {
    return isTruncatedSeoText(description)
      ? `${description.replace(/(\.\.\.|…)$/g, "").trim()}. Informations à confirmer sur le site source.`
      : description;
  }

  return `Prestataire identifié depuis une recherche web ciblée ${categoryToShortLabel(category)} mariage. Informations à confirmer sur le site source.`;
}

function extractProviderName(searchResult: SearchResultLike) {
  const title = searchResult.title?.trim();
  if (!title) return null;

  return title
    .split(/\s[-–|]\s/)
    .map((part) => part.trim())
    .find((part) => part.length >= 3 && !/traiteur mariage|mariage|avis|toulouse|site officiel/i.test(part))
    ?.slice(0, 80) ?? title.split(/\s[-–|]\s/)[0]?.trim().slice(0, 80) ?? null;
}

function extractLocationFromSearchResult(searchResult: SearchResultLike, profile: Partial<WeddingProfile> | null) {
  const target = `${searchResult.title ?? ""} ${searchResult.description ?? ""}`;
  const knownLocation = profile?.city ?? profile?.region ?? null;
  if (knownLocation && normalize(target).includes(normalize(knownLocation))) return knownLocation;
  return knownLocation;
}

function isGenericProviderName(name: string, category: VendorCategory) {
  const normalized = normalize(name);
  const label = normalize(categoryToShortLabel(category));
  const genericPatterns = [
    "les meilleurs",
    "top ",
    "selection",
    "annuaire",
    "salle reception",
    "salle de reception",
    "lieu reception",
    "lieu de reception",
    "traiteur mariage",
    "photographe mariage",
    "videaste mariage",
    "dj mariage",
    "musicien mariage",
    "fleuriste mariage",
    "prestataire mariage"
  ];

  return genericPatterns.some((pattern) => normalized === pattern || normalized.startsWith(`${pattern} `)) || normalized === label || normalized === `${label} mariage`;
}

function isTruncatedSeoText(value: string) {
  const trimmed = value.trim();
  return /(\.\.\.|…)$/.test(trimmed) || / \.\.\./.test(trimmed) || trimmed.length < 80;
}

function sameDomain(left: string, right: string) {
  if (!left || !right) return false;
  return extractDomain(left) === extractDomain(right);
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function toVendorResult(
  raw: unknown,
  searchResult: SearchResultLike,
  category: VendorCategory,
  query: string,
  profile: Partial<WeddingProfile> | null,
  mode: "strict" | "expanded",
  markdown: string | null = null
): FirecrawlVendorResult | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  if (data.hors_perimetre === true) return null;

  const name = readText(data, ["nom"]);
  if (!name) return null;
  if (isGenericProviderName(name, category)) return null;

  const searchText = [markdown, searchResult.title, searchResult.description, searchResult.url].filter(Boolean).join("\n");
  const extractedCategory = normalizeExtractedCategory(readText(data, ["categorie"]));
  const normalizedSearchText = normalize(`${searchText} ${searchResult.url}`);
  const hasCategorySignal = categoryKeywords(category).some((keyword) => normalizedSearchText.includes(normalize(keyword)));
  const hasWeddingSignal = /\b(mariage|wedding|union|ceremonie|cérémonie|reception|réception)\b/i.test(searchText);
  if (extractedCategory && extractedCategory !== category && !hasCategorySignal) return null;
  if (!extractedCategory && mode === "strict" && !hasCategorySignal) return null;

  const email = readText(data, ["email"]) ?? extractEmail(searchText);
  const phone = readText(data, ["telephone"]) ?? extractPhone(searchText);

  const weddingReference = readText(data, ["references_mariage"]);

  const website = sanitizeWebsite(readText(data, ["site_web"]), searchResult.url);
  if (!email && !phone && !website) return null;
  if (!weddingReference && mode === "strict" && !hasWeddingSignal) return null;
  const rating = readNumber(data, ["note_moyenne"]);
  if (rating !== null && rating < 4) return null;

  const reviewsCount = readInteger(data, ["nombre_avis"]);
  const address = readText(data, ["adresse"]);
  const zoneIntervention = readText(data, ["zone_intervention"]);
  const city = zoneIntervention ?? address;
  const style = readText(data, ["style"]);
  const detailedDescription = readText(data, ["description_detaillee"]);
  const strongPoints = readStringArray(data, ["points_forts"]);
  const extractedSpecialties = readText(data, ["specialites"]);
  const specialties = [extractedSpecialties, weddingReference].filter(Boolean).join(". ") || null;
  const constraints = readText(data, ["contraintes"]);
  const priceRange = readText(data, ["fourchette_prix"]);
  const capacity = readText(data, ["capacite_invites"]);
  const availability = readText(data, ["disponibilite"]);
  const sourceLabel = extractDomain(website ?? searchResult.url);
  const images = readImages(data, website ?? searchResult.url, markdown);
  const image = images[0] ?? null;
  const reviewSnippets = readReviewSnippets(data);

  const score = computeQualityScore({
    profile,
    zoneIntervention,
    rating,
    reviewsCount,
    email,
    priceRange,
    weddingReference
  });

  return {
    id: `firecrawl-${slugify(name)}-${sourceLabel}`,
    slug: slugify(name),
    name,
    category,
    website,
    email,
    phone,
    address,
    city,
    region: zoneIntervention ?? city,
    priceRange,
    priceValue: estimatePriceValue(priceRange),
    guestCapacity: estimateGuestCapacity(capacity),
    score,
    summary: buildVendorSummary(category, detailedDescription ?? specialties, style, zoneIntervention, sourceLabel, searchResult.description),
    sourceUrl: searchResult.url,
    image,
    images,
    capacity,
    vibe: style,
    rating,
    reviewsCount,
    highlights: buildHighlights(strongPoints, specialties, style, availability),
    tags: buildTags(category, city, style, extractedSpecialties),
    match: constraints ? `Point de vigilance : ${constraints}` : null,
    contactLead: availability,
    sourceLabel,
    keywords: buildKeywords(category, query, city, style, extractedSpecialties),
    limitations: constraints ? splitValues(constraints) : [],
    reviewSearchUrl: buildReviewSearchUrl(name, category, city),
    reviewSnippets,
    availability,
    specialties,
    zoneIntervention
  };
}

function hasEnoughDataForProfile(candidate: FirecrawlVendorResult, category: VendorCategory) {
  const hasContactPath = Boolean(candidate.email || candidate.phone || candidate.website);
  const hasUsefulSummary = Boolean(candidate.summary && candidate.summary.length >= 45);
  if (!hasContactPath || !hasUsefulSummary) return false;

  if (category === "venue") {
    return Boolean(candidate.website || candidate.address || candidate.capacity || candidate.zoneIntervention || candidate.city);
  }

  return Boolean(candidate.website || candidate.email || candidate.phone || candidate.rating || candidate.priceRange || (candidate.highlights?.length ?? 0) > 0);
}

function buildVendorSummary(
  category: VendorCategory,
  specialties: string | null,
  style: string | null,
  zoneIntervention: string | null,
  sourceLabel: string,
  fallbackDescription?: string
) {
  const fragments = [specialties, style ? `Ambiance ${style.toLowerCase()}` : null, zoneIntervention ? `Intervient sur ${zoneIntervention}` : null]
    .filter(Boolean)
    .slice(0, 3);

  if (fragments.length > 0) return fragments.join(". ");
  return fallbackDescription?.trim() || `Fiche ${categoryToShortLabel(category)} enrichie depuis ${sourceLabel}.`;
}

function readImages(source: Record<string, unknown>, baseUrl: string, markdown: string | null = null) {
  const raw = source.photos;
  const values = [...(Array.isArray(raw) ? raw : []), ...extractImagesFromMarkdown(markdown)];
  return collectDisplayImageUrls(values, baseUrl, 6);
}

function extractImagesFromMarkdown(markdown: string | null) {
  if (!markdown) return [];
  const urls = new Set<string>();
  const markdownImageRegex = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const rawImageRegex = /https?:\/\/[^\s)'"<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s)'"<>]*)?/gi;

  for (const match of markdown.matchAll(markdownImageRegex)) {
    urls.add(match[1]);
  }
  for (const match of markdown.matchAll(rawImageRegex)) {
    urls.add(match[0]);
  }

  return Array.from(urls);
}

function normalizeImageUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLowValueImage(url: string) {
  const normalized = normalize(url);
  return !isLikelyImageUrl(url) || /(logo|icon|favicon|sprite|placeholder|blank|avatar|pictogram)/.test(normalized);
}

function readReviewSnippets(source: Record<string, unknown>): VendorReviewSnippet[] {
  const raw = source.avis;
  if (!Array.isArray(raw)) return [];

  const snippets: Array<VendorReviewSnippet | null> = raw.map((item) => {
    if (!item || typeof item !== "object") return null;
    const review = item as Record<string, unknown>;
    const author = readText(review, ["auteur", "author", "nom"]) ?? "Client";
    const text = readText(review, ["texte", "text", "avis", "commentaire"]);
    if (!text || text.length < 12) return null;

    return {
      author,
      text,
      rating: readNumber(review, ["note", "rating"]),
      date: readText(review, ["date"]),
      source: readText(review, ["source"]) ?? "Site web"
    } satisfies VendorReviewSnippet;
  });

  return snippets.filter((item): item is VendorReviewSnippet => Boolean(item)).slice(0, 3);
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function extractPhone(value: string) {
  const match = value.match(/(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}/);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

function buildHighlights(points: string[], specialties: string | null, style: string | null, availability: string | null) {
  const values = [...points, specialties, style, availability].flatMap((value) => (value ? splitValues(value) : []));
  return Array.from(new Set(values.map(capitalizeFirst))).filter(Boolean).slice(0, 4);
}

function buildTags(category: VendorCategory, city: string | null, style: string | null, specialties: string | null) {
  return Array.from(new Set([categoryToShortLabel(category), city, style, ...splitValues(specialties ?? "")].filter(Boolean) as string[])).slice(0, 4);
}

function buildKeywords(category: VendorCategory, query: string, city: string | null, style: string | null, specialties: string | null) {
  return Array.from(new Set([categoryToShortLabel(category), city ?? "", style ?? "", specialties ?? "", query].join(" ").split(/\s+/).filter((item) => item.length > 2)));
}

function computeQualityScore(input: {
  profile: Partial<WeddingProfile> | null;
  zoneIntervention: string | null;
  rating: number | null;
  reviewsCount: number | null;
  email: string | null;
  priceRange: string | null;
  weddingReference: string | null;
}) {
  let score = 0;

  if (input.rating !== null && input.rating >= 4.5) score += 35;
  if (input.rating !== null && input.rating >= 4.8) score += 15;
  if (input.reviewsCount !== null && input.reviewsCount >= 30) score += 10;
  if (input.reviewsCount !== null && input.reviewsCount >= 100) score += 10;
  if (input.email) score += 10;
  if (input.priceRange) score += 10;
  if (input.weddingReference) score += 10;
  if (locationMatches(input.zoneIntervention, input.profile)) score += 10;

  return Math.min(score, 100);
}

function locationMatches(zoneIntervention: string | null, profile: Partial<WeddingProfile> | null) {
  if (!zoneIntervention) return false;
  const zone = normalize(zoneIntervention);
  return [profile?.city, profile?.region, profile?.country].filter(Boolean).some((value) => zone.includes(normalize(value as string)));
}

function readText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const match = Object.keys(source).find((candidate) => normalize(candidate) === normalize(key));
    const value = match ? source[match] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  const value = readText(source, keys);
  if (!value) return null;
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function readInteger(source: Record<string, unknown>, keys: string[]) {
  const value = readText(source, keys);
  if (!value) return null;
  const match = value.match(/\d+/g);
  return match ? Number(match.join("")) : null;
}

function readStringArray(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const match = Object.keys(source).find((candidate) => normalize(candidate) === normalize(key));
    const value = match ? source[match] : undefined;
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    }
    if (typeof value === "string" && value.trim()) return splitValues(value);
  }
  return [];
}

function sanitizeWebsite(website: string | null, fallbackUrl: string) {
  if (website && !isExampleDomain(website)) return website;
  return isExampleDomain(fallbackUrl) ? null : fallbackUrl;
}

function isExampleDomain(url: string | null) {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "example.com";
  } catch {
    return false;
  }
}

function buildReviewSearchUrl(name: string, category: VendorCategory, city: string | null) {
  const query = `${name} ${categoryToShortLabel(category)} ${city ?? ""} mariage avis Google Maps`;
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}

function estimatePriceValue(priceRange: string | null) {
  if (!priceRange) return 0;
  const cleaned = priceRange.replace(/\s/g, "").replace(",", ".");
  const match = cleaned.match(/\d[\d.]*/);
  if (!match) return 0;
  return Number(match[0].replace(/[^\d.]/g, ""));
}

function estimateGuestCapacity(capacity: string | null) {
  if (!capacity) return 0;
  const match = capacity.match(/\d+/g);
  return match ? Number(match[match.length - 1]) : 0;
}

function splitValues(value: string) {
  return value
    .split(/[,;•|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function capitalizeFirst(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("fr-FR") + trimmed.slice(1);
}

function slugify(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeExtractedCategory(value: string | null): VendorCategory | null {
  const normalized = normalize(value ?? "");
  if (!normalized) return null;
  if (/(lieu|venue|domaine|chateau|salle)/.test(normalized)) return "venue";
  if (/(traiteur|wedding_cake|gateau|patisserie)/.test(normalized)) return "caterer";
  if (/(photographe|photo)/.test(normalized)) return "photographer";
  if (/(videaste|video)/.test(normalized)) return "videographer";
  if (/(dj|disc jockey|mix|platines)/.test(normalized)) return "dj";
  if (/(musicien|musique live|groupe|chanteur|chanteuse|jazz|acoustique|piano|guitariste|violoniste|orchestre|trio|quartet|live)/.test(normalized)) {
    return "musician";
  }
  if (/(fleuriste|fleur|floral)/.test(normalized)) return "flowers";
  if (/(decoration|decorateur|scenographie)/.test(normalized)) return "decor";
  if (/(robe)/.test(normalized)) return "dress";
  if (/(costume)/.test(normalized)) return "suit";
  if (/(transport|chauffeur|navette)/.test(normalized)) return "transport";
  return null;
}

function categoryKeywords(category: VendorCategory) {
  switch (category) {
    case "venue":
      return ["lieu", "domaine", "chateau", "salle", "reception", "mariage", "wedding", "venue"];
    case "caterer":
      return ["traiteur", "cocktail", "diner", "repas", "mariage", "wedding", "cake", "gateau"];
    case "photographer":
      return ["photo", "photographe", "photographer", "mariage", "wedding"];
    case "videographer":
      return ["video", "videaste", "film", "mariage", "wedding"];
    case "dj":
      return ["dj", "disc jockey", "mix", "platines", "mariage", "wedding"];
    case "musician":
      return ["groupe", "musicien", "chanteur", "jazz", "acoustique", "orchestre", "live", "mariage", "wedding"];
    case "flowers":
      return ["fleur", "fleuriste", "floral", "mariage", "wedding"];
    case "decor":
      return ["decoration", "deco", "scenographie", "mariage", "wedding"];
    case "dress":
      return ["robe", "mariee", "mariage", "wedding"];
    case "suit":
      return ["costume", "marie", "mariage", "wedding"];
    case "transport":
      return ["transport", "chauffeur", "navette", "voiture", "mariage", "wedding"];
  }
}

function categoryToShortLabel(category: VendorCategory) {
  switch (category) {
    case "venue":
      return "lieu";
    case "caterer":
      return "traiteur";
    case "photographer":
      return "photographe";
    case "videographer":
      return "vidéaste";
    case "flowers":
      return "fleuriste";
    case "dj":
      return "DJ";
    case "musician":
      return "musicien";
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

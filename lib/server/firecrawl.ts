import Firecrawl from "@mendable/firecrawl-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isBlockedWeddingDirectoryHost, isBlockedWeddingDirectoryUrl } from "@/lib/blocked-vendor-sources";
import { isGenericDirectoryHost, looksLikeDirectoryPage } from "@/lib/directory-page-detector";
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

Détermine D'ABORD le type de page ("type_de_page") :
- "site_prestataire" : le site officiel d'UN SEUL prestataire (portfolio, site vitrine, page de présentation ou de contact du prestataire lui-même).
- "annuaire_ou_liste" : annuaire, comparateur, place de marché ou toute page listant PLUSIEURS prestataires (ex. mariages.net, pagesjaunes, "les 10 meilleurs traiteurs...", page de résultats de recherche, fiche hébergée sur une plateforme tierce).
- "blog_ou_media" : article de blog, magazine, guide éditorial.
- "autre" : tout le reste.
Si le type n'est pas "site_prestataire", retourne { "type_de_page": "...", "hors_perimetre": true } et rien d'autre.

Vérifie ensuite : ce prestataire travaille-t-il explicitement pour des mariages ?
Si la page ne mentionne pas "mariage", "wedding", "union", "cérémonie" ou équivalent, retourne { "type_de_page": "site_prestataire", "hors_perimetre": true } et rien d'autre.

Le message utilisateur peut préciser le lieu du mariage recherché. Dans ce cas, détermine "couvre_zone_recherchee" :
- true : le prestataire peut raisonnablement intervenir sur ce lieu (zone d'intervention annoncée couvrant ce secteur, mention "toute la France" / "national" / "à l'étranger", ou adresse située dans le même secteur géographique).
- false : la page annonce clairement une zone d'intervention ou une adresse qui NE couvre PAS ce lieu (autre région française éloignée, départements listés incompatibles).
- null : la page ne permet pas de le savoir, ou aucun lieu recherché n'est fourni.

Si le prestataire travaille bien pour des mariages, retourne :
{
  "type_de_page": "site_prestataire",
  "hors_perimetre": false,
  "couvre_zone_recherchee": null,
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

Le champ "references_mariage" doit contenir une courte phrase extraite de la page qui confirme que ce prestataire fait des mariages.
Limites strictes pour garder un JSON court : "photos" contient au maximum 4 URLs, "avis" au maximum 3 entrées, "description_detaillee" au maximum 2 phrases, "points_forts" au maximum 4 éléments.`;

// NB : l'extraction structurée est réalisée par Mistral (extractVendorDataWithMistral),
// le schéma JSON attendu est décrit directement dans EXTRACTION_PROMPT.

const FIRECRAWL_OPERATION_TIMEOUT_MS = 9000;
// Scrape markdown seul (l'extraction JSON est faite par Mistral, pas par Firecrawl) :
// 15 s suffisent pour un rendu fastMode, même sur les portfolios lourds.
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 15000;
// Réutilisation du cache de scrape Firecrawl (page déjà scrapée récemment = réponse immédiate).
const FIRECRAWL_SCRAPE_CACHE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const MISTRAL_EXTRACTION_TIMEOUT_MS = 15000;
// Limites relevées pour compenser des filtres anti-annuaires plus stricts :
// plus de résultats bruts, plus de scrapes en parallèle (budget temps inchangé,
// coût crédits Firecrawl plus élevé par recherche).
const FIRECRAWL_SEARCH_LIMIT = 10;
const FIRECRAWL_SCRAPE_LIMIT = 5;
// Suffixe best-effort transmis au moteur de recherche (opérateurs Google-style).
// Ajouté APRÈS compactFirecrawlQuery, qui détruirait les ':' et '.'.
const NEGATIVE_QUERY_SUFFIX = "-annuaire -site:mariages.net -site:zankyou.fr -site:pagesjaunes.fr";

export async function searchVendorsWithFirecrawl(
  supabase: SupabaseClient,
  input: {
    userId: string;
    category: VendorCategory;
    query: string;
    location?: string | null;
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
    const searchQuery = buildFirecrawlQuery(input.category, input.query, input.profile, mode, input.location);

    const searchResults = await withFirecrawlKeyRotation(apiKeys, disabledKeyIndexes, "search", (firecrawl) =>
      firecrawl.search(searchQuery, {
        sources: ["web"],
        limit: FIRECRAWL_SEARCH_LIMIT,
        // NB : "lang" n'est pas un paramètre supporté par le SDK (silencieusement ignoré) ;
        // "location" est le paramètre officiel de localisation des résultats.
        location: "France",
        // Pas de scrapeOptions ici : avec limit=10, scraper chaque résultat pendant
        // la recherche dépasse le timeout (14 s constatés) et coûte des crédits pour
        // rien — titre + description SERP suffisent aux filtres pré-scrape, le scrape
        // dédié n'a lieu qu'après sélection.
        timeout: FIRECRAWL_OPERATION_TIMEOUT_MS
      } as never)
    );

    const parsedItems = readFirecrawlSearchItems(searchResults)
      .map((item) => ({
        url: extractUrl(item) ?? "",
        title: item.title ?? undefined,
        description: item.description ?? item.snippet ?? item.markdown ?? undefined,
        markdown: item.markdown ?? undefined
      }))
      .filter((item) => item.url);

    const selectedResults: SearchResultLike[] = [];
    for (const item of parsedItems) {
      const rejectReason = getPreScrapeRejectReason(item, input.category, existingDomains, mode);
      if (rejectReason) {
        console.info("firecrawl_reject", rejectReason, item.url);
        continue;
      }
      selectedResults.push(item);
      if (selectedResults.length >= FIRECRAWL_SCRAPE_LIMIT) break;
    }

    const results = await Promise.all(
      selectedResults.map((result) =>
        scrapeVendorResult(apiKeys, disabledKeyIndexes, result, input.category, input.query, input.profile, mode, input.location)
      )
    );

    // Politique produit : une fiche n'est créée QUE depuis une page scrapée et
    // vérifiée comme site du prestataire. Pas de fiche de secours construite
    // depuis les seuls résultats de recherche.
    return results
      .filter((item): item is FirecrawlVendorResult => Boolean(item))
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
  mode: "strict" | "expanded",
  searchLocation?: string | null
) {
  try {
    // Fetch découplé de l'extraction : demander à Firecrawl le JSON structuré
    // (rendu complet + LLM côté Firecrawl) produisait des SCRAPE_TIMEOUT en série
    // sur les sites vitrines lourds. Ici : markdown seul (rapide, avec cache),
    // puis extraction structurée via Mistral, sous notre contrôle.
    const doc = await withFirecrawlKeyRotation(apiKeys, disabledKeyIndexes, "scrape", (firecrawl) =>
      firecrawl.scrape(searchResult.url, {
        formats: ["markdown"],
        onlyMainContent: true,
        fastMode: true,
        // Réutilise un scrape récent du cache Firecrawl si disponible (quasi instantané).
        maxAge: FIRECRAWL_SCRAPE_CACHE_MAX_AGE_MS,
        timeout: FIRECRAWL_SCRAPE_TIMEOUT_MS
      } as never)
    );

    const document = unwrapFirecrawlDocument(doc);
    const markdown =
      [document.markdown, document.content].find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
    if (!markdown) return null;

    const extracted = await extractVendorDataWithMistral(markdown, searchResult, searchLocation);
    if (!extracted) return null;

    return toVendorResult(extracted, searchResult, category, query, profile, mode, markdown, searchLocation);
  } catch (error) {
    console.error("Firecrawl scrape error", error);
    return null;
  }
}

/**
 * Extraction structurée du contenu scrapé via l'API Mistral (JSON mode).
 * Concurrence limitée : les scrapes tournent en parallèle mais le compte Mistral
 * est rate-limité, donc les extractions passent par un petit sas.
 */
async function extractVendorDataWithMistral(
  markdown: string,
  searchResult: SearchResultLike,
  searchLocation?: string | null
): Promise<Record<string, unknown> | null> {
  if (!env.mistralApiKey) return null;

  const content = markdown.replace(/\n{3,}/g, "\n\n").slice(0, 14000);
  await mistralExtractionSemaphore.acquire();
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MISTRAL_EXTRACTION_TIMEOUT_MS);

      try {
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.mistralApiKey}`
          },
          body: JSON.stringify({
            model: env.mistralExtractionModel,
            temperature: 0,
            max_tokens: 1800,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: EXTRACTION_PROMPT },
              {
                role: "user",
                content: [
                  `URL de la page : ${searchResult.url}`,
                  `Titre : ${searchResult.title ?? ""}`,
                  searchLocation ? `Lieu du mariage recherché : ${searchLocation} (le prestataire doit pouvoir y intervenir).` : null,
                  "",
                  `Contenu de la page (markdown) :\n${content}`
                ]
                  .filter((line): line is string => line !== null)
                  .join("\n")
              }
            ]
          }),
          signal: controller.signal
        });

        if (response.status === 429) {
          await sleepMs(1200 * (attempt + 1));
          continue;
        }
        if (!response.ok) return null;

        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content?.trim();
        if (!text) return null;

        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          const match = text.match(/\{[\s\S]*\}/);
          return match ? (JSON.parse(match[0]) as Record<string, unknown>) : null;
        }
      } catch {
        // abort (timeout) ou erreur réseau : on tente la seconde passe puis on abandonne.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  } finally {
    mistralExtractionSemaphore.release();
  }
}

class AsyncSemaphore {
  private queue: Array<() => void> = [];
  private available: number;

  constructor(count: number) {
    this.available = count;
  }

  async acquire() {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.available += 1;
  }
}

const mistralExtractionSemaphore = new AsyncSemaphore(2);

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildFirecrawlQuery(
  category: VendorCategory,
  query: string,
  profile: Partial<WeddingProfile> | null,
  mode: "strict" | "expanded",
  searchLocation?: string | null
) {
  const location = getPrimarySearchLocation(profile, searchLocation);
  const baseQuery = buildCategorySearchCore(category, location);
  const modifiers = cleanSearchModifiers(query, category, location);
  const compacted = compactFirecrawlQuery(`${baseQuery} ${modifiers} site officiel`, mode === "expanded" ? 12 : 10).slice(0, 160);
  return `${compacted} ${NEGATIVE_QUERY_SUFFIX}`;
}

function getPrimarySearchLocation(profile: Partial<WeddingProfile> | null, searchLocation?: string | null) {
  const raw = searchLocation ?? profile?.city ?? profile?.region ?? profile?.country ?? "France";
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

/**
 * Filtres pré-scrape. Les contrôles anti-annuaires sont INCONDITIONNELS
 * (identiques en strict et étendu) : seuls les critères de pertinence
 * (mots-clés catégorie) restent réservés au mode strict.
 * Retourne la raison du rejet (pour observabilité), ou null si le résultat est retenu.
 */
function getPreScrapeRejectReason(
  item: SearchResultLike,
  category: VendorCategory,
  existingDomains: Set<string>,
  mode: "strict" | "expanded"
): string | null {
  const domain = extractDomain(item.url);
  const lowerUrl = item.url.toLowerCase();
  const lowerTarget = normalize(`${item.url} ${item.title ?? ""} ${item.description ?? ""}`);

  if (isBlockedWeddingDirectoryHost(domain)) return "blocked_host";
  if (isSocialDomain(domain)) return "social";
  if (isGenericDirectoryHost(domain)) return "generic_directory_host";
  if (looksLikeDirectoryPage({ url: item.url, title: item.title, description: item.description })) return "directory_shape";
  if (/\/(blog|article|guide|conseil|inspiration|tendance|actualite)\//i.test(lowerUrl)) return "editorial_path";
  if (existingDomains.has(domain)) return "already_known_domain";
  if (mode === "strict" && !categoryKeywords(category).some((keyword) => lowerTarget.includes(normalize(keyword)))) return "missing_category_keyword";

  return null;
}

function isSocialDomain(domain: string) {
  return /facebook\.com|instagram\.com|linkedin\.com|pinterest\.com|tiktok\.com/.test(domain);
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
  markdown: string | null = null,
  searchLocation?: string | null
): FirecrawlVendorResult | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  if (data.hors_perimetre === true) return null;

  // Rejet dur, TOUS modes : la page doit être le site du prestataire lui-même.
  const pageType = readText(data, ["type_de_page"]);
  if (pageType && pageType !== "site_prestataire") {
    console.info("firecrawl_reject", `page_type_${pageType}`, searchResult.url);
    return null;
  }

  // Rejet dur, TOUS modes : le prestataire doit pouvoir intervenir sur le lieu demandé.
  // (ex. food truck breton proposé pour un mariage à Saint-Cloud). null = doute → on garde.
  if (data.couvre_zone_recherchee === false) {
    console.info("firecrawl_reject", "geo_mismatch", searchResult.url);
    return null;
  }

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
  const city = zoneIntervention ?? address ?? searchLocation ?? profile?.city ?? profile?.region ?? null;
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
  if (isBlockedWeddingDirectoryUrl(searchResult.url) || isBlockedWeddingDirectoryUrl(website)) return null;
  // Ceinture et bretelles : re-check structurel sur la source ET le site extrait.
  if (looksLikeDirectoryPage({ url: searchResult.url, title: searchResult.title, description: searchResult.description })) {
    console.info("firecrawl_reject", "directory_shape_post_scrape", searchResult.url);
    return null;
  }
  if (website && website !== searchResult.url && looksLikeDirectoryPage({ url: website })) {
    console.info("firecrawl_reject", "directory_shape_website", website);
    return null;
  }
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
  if (website && !isExampleDomain(website) && !isBlockedWeddingDirectoryUrl(website)) return website;
  if (isExampleDomain(fallbackUrl) || isBlockedWeddingDirectoryUrl(fallbackUrl)) return null;
  return fallbackUrl;
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

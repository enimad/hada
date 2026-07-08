import type { SupabaseClient } from "@supabase/supabase-js";
import { isBlockedWeddingDirectoryUrl } from "@/lib/blocked-vendor-sources";
import { looksLikeDirectoryPage } from "@/lib/directory-page-detector";
import { getBudgetAllocationForVendorCategory } from "@/lib/budget";
import { buildWeddingSummary, formatBudgetSummary, type PlannerContext } from "@/lib/prompts";
import type { ChatMessage, UiChatMessage, VendorCandidateView, VendorCategory, WeddingProfile } from "@/lib/types";
import { searchVendorCatalog, type VendorCatalogEntry } from "@/lib/vendor-catalog";
import { searchVendorsWithFirecrawl } from "@/lib/server/firecrawl";
import { NORMALIZER_VERSION, normalizeVendorProfileWithMistral } from "@/lib/server/vendor-profile-normalizer";

const categoryConfig: Record<VendorCategory, { label: string; plural: string; ctaLabel: string }> = {
  venue: { label: "lieu", plural: "lieux", ctaLabel: "Voir les lieux" },
  caterer: { label: "traiteur", plural: "traiteurs", ctaLabel: "Voir mes traiteurs" },
  photographer: { label: "photographe", plural: "photographes", ctaLabel: "Voir mes photographes" },
  videographer: { label: "vidéaste", plural: "vidéastes", ctaLabel: "Voir mes vidéastes" },
  dj: { label: "DJ", plural: "DJ", ctaLabel: "Voir mes DJ" },
  musician: { label: "musicien", plural: "musiciens", ctaLabel: "Voir mes musiciens" },
  decor: { label: "décorateur", plural: "décorateurs", ctaLabel: "Voir ma décoration" },
  dress: { label: "robe", plural: "robes", ctaLabel: "Voir mes robes" },
  suit: { label: "costume", plural: "costumes", ctaLabel: "Voir mes costumes" },
  flowers: { label: "fleuriste", plural: "fleuristes", ctaLabel: "Voir mes fleuristes" },
  transport: { label: "transport", plural: "prestataires transport", ctaLabel: "Voir mes transports" }
};

export type SearchReadyPayload = {
  category: VendorCategory;
  location: string | null;
  style: string | null;
  constraints: string | null;
  budget: string | null;
  searchQuery: string;
};

export type SearchResultsOutcome = {
  request: unknown | null;
  candidates: VendorCatalogEntry[];
  fromCache: boolean;
  mode: "cache" | "strict" | "expanded" | "external_fallback";
  externalSearchUrl?: string;
};

type SearchOptions = {
  skipCache?: boolean;
  expandedOnly?: boolean;
  trackQuota?: boolean;
};

const SEARCH_QUOTA_LIMIT = 2;
const SEARCH_QUOTA_WINDOW_HOURS = 48;
const SEARCH_QUOTA_WINDOW_MS = SEARCH_QUOTA_WINDOW_HOURS * 60 * 60 * 1000;
const SEARCH_QUOTA_MARKER = { beta_search_quota: "v1" };
// Budgets alignés sur le scrape Firecrawl à 20 s (+ marge SDK) : recherche SERP ~3 s
// puis scrapes en parallèle. Total pire cas strict+étendu ≈ 48 s, sous le maxDuration
// de 60 s de la route chat-v2.
const STRICT_VENDOR_SEARCH_TIMEOUT_MS = 26000;
const EXPANDED_VENDOR_SEARCH_TIMEOUT_MS = 22000;

export type SearchQuotaStatus = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  isBlocked: boolean;
};

export async function ensureActiveConversation(supabase: SupabaseClient, userId: string) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: "Conversation Hada",
      status: "active"
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listConversationMessages(supabase: SupabaseClient, conversationId: string): Promise<UiChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    ctaHref: message.metadata_json?.ctaHref ?? undefined,
    ctaLabel: message.metadata_json?.ctaLabel ?? undefined,
    ctaAction: message.metadata_json?.action ?? undefined,
    createdAt: message.created_at
  }));
}

export async function insertConversationMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      metadata_json: input.metadata ?? {}
    })
    .select("*")
    .single();

  if (error) throw error;

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", input.conversationId);

  return {
    id: data.id,
    role: data.role === "user" ? "user" : "assistant",
    content: data.content,
    ctaHref: data.metadata_json?.ctaHref ?? undefined,
    ctaLabel: data.metadata_json?.ctaLabel ?? undefined,
    ctaAction: data.metadata_json?.action ?? undefined,
    createdAt: data.created_at
  } satisfies UiChatMessage;
}

export function buildInitialAssistantMessages(profile: Partial<WeddingProfile> | null): Omit<UiChatMessage, "id">[] {
  const summary = buildWeddingSummary(profile);
  const partnerLabel =
    profile?.partner_one_name || profile?.partner_two_name
      ? `${profile?.partner_one_name ?? "?"} & ${profile?.partner_two_name ?? "?"}`
      : "Votre duo";

  return [
    {
      role: "assistant",
      content: `${partnerLabel} - Synthèse\nJe relis votre profil mariage : ${summary}.`
    },
    {
      role: "assistant",
      content:
        "Je suis là pour vous aider à trouver les bons prestataires, sans vous noyer sous les questions. Dites-moi simplement ce que vous cherchez, et je lance la recherche dès que j'ai l'essentiel."
    }
  ];
}

export async function bootstrapConversationIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  profile: Partial<WeddingProfile> | null
) {
  const conversation = await ensureActiveConversation(supabase, userId);
  const existingMessages = await listConversationMessages(supabase, conversation.id);

  if (existingMessages.length > 0) {
    return { conversation, messages: existingMessages };
  }

  const seeded: UiChatMessage[] = [];
  for (const message of buildInitialAssistantMessages(profile)) {
    const inserted = await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: message.role,
      content: message.content
    });
    seeded.push(inserted);
  }

  return { conversation, messages: seeded };
}

export async function createSearchResultsForUser(
  supabase: SupabaseClient,
  input: {
    userId: string;
    conversationId: string;
    search: SearchReadyPayload;
    profile: Partial<WeddingProfile> | null;
    options?: SearchOptions;
  }
): Promise<SearchResultsOutcome> {
  const options = input.options ?? {};
  const requirements = {
    ...(options.trackQuota === false ? {} : SEARCH_QUOTA_MARKER),
    summary: buildWeddingSummary(input.profile),
    query: input.search.searchQuery,
    category: input.search.category,
    location: input.search.location,
    style: input.search.style,
    constraints: input.search.constraints,
    budget: input.search.budget
  };
  const cachedCandidates = options.skipCache ? [] : await loadCachedCandidatesForUser(supabase, input.userId, input.search.category);
  const reusableCachedCandidates = filterReusableCachedCandidates(cachedCandidates, input.search, input.profile).slice(0, 3);
  const hasSavedCandidatesForCategory = cachedCandidates.length > 0;

  if (!options.skipCache && !hasSavedCandidatesForCategory && reusableCachedCandidates.length >= 3) {
    const { data: request, error: requestError } = await supabase
      .from("vendor_requests")
      .insert({
        user_id: input.userId,
        conversation_id: input.conversationId,
        vendor_category: input.search.category,
        status: "cache_hit",
        requirements_json: requirements,
        search_query_text: input.search.searchQuery
      })
      .select("*")
      .single();

    if (requestError) throw requestError;

    return {
      request,
      candidates: reusableCachedCandidates,
      fromCache: true,
      mode: "cache"
    };
  }

  const { data: request, error: requestError } = await supabase
    .from("vendor_requests")
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      vendor_category: input.search.category,
      status: "searching",
      requirements_json: requirements,
      search_query_text: input.search.searchQuery
    })
    .select("*")
    .single();

  if (requestError) throw requestError;

  const firecrawlCandidates = options.expandedOnly
    ? []
    : await searchVendorsWithTimeBudget(
        searchVendorsWithFirecrawl(supabase, {
          userId: input.userId,
          category: input.search.category,
          query: input.search.searchQuery,
          location: input.search.location,
          profile: input.profile,
          mode: "strict"
        }),
        STRICT_VENDOR_SEARCH_TIMEOUT_MS,
        "strict"
      );

  let candidates = firecrawlCandidates.slice(0, 3);
  let mode: SearchResultsOutcome["mode"] = "strict";

  if (candidates.length === 0) {
    const expandedCandidates = await searchVendorsWithTimeBudget(
      searchVendorsWithFirecrawl(supabase, {
        userId: input.userId,
        category: input.search.category,
        query: buildExpandedSearchQuery(input.search, input.profile),
        location: input.search.location,
        profile: input.profile,
        mode: "expanded"
      }),
      EXPANDED_VENDOR_SEARCH_TIMEOUT_MS,
      "expanded"
    );
    candidates = expandedCandidates.slice(0, 3);
    mode = "expanded";
  }

  if (candidates.length === 0 && canUseCatalogFallback()) {
    candidates = searchVendorCatalog({
      category: input.search.category,
      query: input.search.searchQuery,
      profile: input.profile
    }).slice(0, 3);
  }

  if (candidates.length > 0) {
    const normalizedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const normalized = await normalizeVendorProfileWithMistral({
          candidate,
          profile: input.profile,
          search: input.search
        });
        return { candidate, normalized };
      })
    );

    const usableNormalizedCandidates = normalizedCandidates.filter(({ candidate, normalized }) => {
      if (!hasUsableNormalizedProfile(candidate, normalized.vendorProfile, normalized.usedFallback)) return false;

      // Porte de création : jamais de fiche depuis une page d'annuaire.
      // Check déterministe (structure de l'URL source) puis signal du normalizer
      // (loggé pour observer les éventuels faux positifs du LLM).
      if (candidate.sourceUrl && looksLikeDirectoryPage({ url: candidate.sourceUrl })) {
        console.warn("vendor_candidate_rejected", "directory_source", candidate.sourceUrl);
        return false;
      }
      if (normalized.vendorProfile.quality.generated_from === "directory") {
        console.warn("vendor_candidate_rejected", "normalizer_directory_flag", candidate.sourceUrl ?? candidate.website ?? candidate.name);
        return false;
      }

      return true;
    });

    if (usableNormalizedCandidates.length === 0) {
      await supabase.from("vendor_requests").update({ status: "no_results" }).eq("id", request.id);
      candidates = [];
    }

    const payload = usableNormalizedCandidates.map(({ candidate, normalized }) => {
      const vendorProfile = normalized.vendorProfile;
      const photos = vendorProfile.media.photos;
      const website = vendorProfile.contact.website_url ?? vendorProfile.identity.website_url ?? candidate.website;
      const email = vendorProfile.contact.email ?? candidate.email;
      const phone = vendorProfile.contact.phone ?? candidate.phone;
      const location = vendorProfile.identity.location_label || candidate.city || candidate.region;

      return {
        vendor_request_id: request.id,
        name: vendorProfile.identity.name || candidate.name,
        category: vendorProfile.identity.category || candidate.category,
        website,
        email,
        phone,
        city: location,
        region: vendorProfile.identity.service_area ?? candidate.region,
        price_range: vendorProfile.logistics.price_range ?? candidate.priceRange,
        score: candidate.score,
        summary: vendorProfile.summary.about ?? candidate.summary,
        source_url: candidate.sourceUrl,
        metadata_json: {
          slug: slugify(vendorProfile.identity.name || candidate.name),
          vendor_profile: vendorProfile,
          raw_firecrawl: candidate,
          normalized_at: new Date().toISOString(),
          normalizer_version: NORMALIZER_VERSION,
          normalizer_error: normalized.usedFallback,
          normalizer_error_message: normalized.error ?? null,

          address: vendorProfile.identity.exact_address ?? candidate.address ?? null,
          image: photos[0] ?? candidate.image,
          images: photos.length > 0 ? photos : candidate.images ?? [],
          capacity: vendorProfile.logistics.capacity ?? candidate.capacity,
          vibe: inferVibeFromProfile(vendorProfile.category_specific) ?? candidate.vibe,
          rating: vendorProfile.reviews.rating,
          reviewsCount: vendorProfile.reviews.review_count,
          highlights: vendorProfile.summary.strengths,
          tags: candidate.tags,
          match: vendorProfile.summary.caveats.length > 0 ? vendorProfile.summary.caveats.join(" · ") : candidate.match,
          contactLead: vendorProfile.logistics.availability ?? candidate.contactLead,
          categoryLabel: categoryConfig[candidate.category].label,
          sourceLabel: candidate.sourceLabel ?? null,
          sourceType: vendorProfile.quality.generated_from,
          sourceConfidence: vendorProfile.quality.source_confidence,
          weddingProof: candidate.specialties ?? null,
          descriptionLongue: vendorProfile.summary.about,
          reviewSearchUrl: vendorProfile.reviews.google_reviews_url,
          reviewSnippets: vendorProfile.reviews.snippets,
          availability: vendorProfile.logistics.availability,
          specialties: inferSpecialtiesFromProfile(vendorProfile.category_specific) ?? candidate.specialties,
          limitations: vendorProfile.summary.caveats,
          zoneIntervention: vendorProfile.identity.service_area ?? candidate.zoneIntervention ?? null,
          specific: vendorProfile.category_specific
        }
      };
    });

    if (payload.length > 0) {
      const { error: candidatesError } = await supabase.from("vendor_candidates").insert(payload);
      if (candidatesError) throw candidatesError;
      candidates = usableNormalizedCandidates.map(({ candidate }) => candidate);
    }
  }

  await supabase
    .from("vendor_requests")
    .update({ status: candidates.length > 0 ? "results_ready" : "no_results" })
    .eq("id", request.id);

  return {
    request,
    candidates: candidates.slice(0, 3),
    fromCache: false,
    mode: candidates.length > 0 ? mode : "external_fallback",
    externalSearchUrl: candidates.length > 0 ? undefined : buildExternalSearchUrl(input.search, input.profile)
  };
}

async function searchVendorsWithTimeBudget(
  searchPromise: Promise<VendorCatalogEntry[]>,
  timeoutMs: number,
  mode: SearchResultsOutcome["mode"]
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const safeSearchPromise = searchPromise.catch((error) => {
    console.error("Vendor search failed", { mode, error: error instanceof Error ? error.message : "Unknown error" });
    return [];
  });

  const timeoutPromise = new Promise<VendorCatalogEntry[]>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn("Vendor search exceeded time budget", { mode, timeoutMs });
      resolve([]);
    }, timeoutMs);
  });

  try {
    return await Promise.race([safeSearchPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function getSearchQuotaStatus(supabase: SupabaseClient, userId: string): Promise<SearchQuotaStatus> {
  const windowStart = new Date(Date.now() - SEARCH_QUOTA_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("vendor_requests")
    .select("created_at")
    .eq("user_id", userId)
    .contains("requirements_json", SEARCH_QUOTA_MARKER)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const used = data?.length ?? 0;
  const oldestSearchAt = data?.[0]?.created_at ? new Date(data[0].created_at).getTime() : null;
  const resetAt = oldestSearchAt && used >= SEARCH_QUOTA_LIMIT ? new Date(oldestSearchAt + SEARCH_QUOTA_WINDOW_MS).toISOString() : null;

  return {
    limit: SEARCH_QUOTA_LIMIT,
    used,
    remaining: Math.max(SEARCH_QUOTA_LIMIT - used, 0),
    resetAt,
    isBlocked: used >= SEARCH_QUOTA_LIMIT
  };
}

export async function getMostRecentSearchCategory(supabase: SupabaseClient, userId: string): Promise<VendorCategory | null> {
  const { data } = await supabase
    .from("vendor_requests")
    .select("vendor_category")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return normalizeSearchCategory(data?.vendor_category);
}

export async function getMostRecentRetryableSearch(supabase: SupabaseClient, userId: string): Promise<SearchReadyPayload | null> {
  const { data } = await supabase
    .from("vendor_requests")
    .select("vendor_category, requirements_json, search_query_text")
    .eq("user_id", userId)
    .eq("status", "no_results")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const category = normalizeSearchCategory(data?.vendor_category);
  if (!category) return null;

  const requirements = (data?.requirements_json ?? {}) as Record<string, unknown>;
  return {
    category,
    location: readOptionalString(requirements.location),
    style: readOptionalString(requirements.style),
    constraints: readOptionalString(requirements.constraints),
    budget: readOptionalString(requirements.budget),
    searchQuery: readOptionalString(data?.search_query_text) ?? ""
  };
}

async function loadCachedCandidatesForUser(supabase: SupabaseClient, userId: string, category: VendorCategory): Promise<VendorCatalogEntry[]> {
  const { data: requests } = await supabase.from("vendor_requests").select("id").eq("user_id", userId).eq("vendor_category", category);
  const requestIds = (requests ?? []).map((request) => request.id);
  if (requestIds.length === 0) return [];

  const { data: candidates } = await supabase
    .from("vendor_candidates")
    .select("*")
    .in("vendor_request_id", requestIds)
    .eq("category", category)
    .order("score", { ascending: false })
    .limit(5);

  return (candidates ?? [])
    .filter((candidate) => !isBlockedWeddingDirectoryUrl(candidate.source_url) && !isBlockedWeddingDirectoryUrl(candidate.website))
    // Hygiène cache : les fiches historiques issues d'annuaires ne sont jamais resservies.
    .filter((candidate) => ((candidate.metadata_json ?? {}).sourceType ?? null) !== "directory")
    .filter(
      (candidate) =>
        !(candidate.source_url && looksLikeDirectoryPage({ url: candidate.source_url })) &&
        !(candidate.website && looksLikeDirectoryPage({ url: candidate.website }))
    )
    .map((candidate) => {
      const metadata = candidate.metadata_json ?? {};
      return {
        id: candidate.id,
        slug: metadata.slug ?? slugify(candidate.name),
        name: candidate.name,
        category: candidate.category as VendorCategory,
        website: candidate.website,
        email: candidate.email,
        phone: candidate.phone,
        address: metadata.address ?? null,
        city: candidate.city,
        region: candidate.region,
        priceRange: candidate.price_range,
        priceValue: estimatePriceValue(candidate.price_range),
        guestCapacity: estimateGuestCapacity(metadata.capacity ?? null),
        score: candidate.score ? Number(candidate.score) : null,
        summary: candidate.summary,
        sourceUrl: candidate.source_url,
        image: metadata.image ?? null,
        images: Array.isArray(metadata.images) ? metadata.images : [],
        capacity: metadata.capacity ?? null,
        vibe: metadata.vibe ?? null,
        rating: metadata.rating ?? null,
        reviewsCount: metadata.reviewsCount ?? null,
        highlights: Array.isArray(metadata.highlights) ? metadata.highlights : [],
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        match: metadata.match ?? null,
        contactLead: metadata.contactLead ?? null,
        sourceLabel: metadata.sourceLabel ?? "Cache Hada",
        keywords: [],
        limitations: Array.isArray(metadata.limitations) ? metadata.limitations : [],
        reviewSearchUrl: metadata.reviewSearchUrl ?? null,
        reviewSnippets: Array.isArray(metadata.reviewSnippets) ? metadata.reviewSnippets : [],
        availability: metadata.availability ?? null,
        specialties: metadata.specialties ?? null,
        zoneIntervention: metadata.zoneIntervention ?? null
      } satisfies VendorCatalogEntry;
    });
}

function filterReusableCachedCandidates(
  candidates: VendorCatalogEntry[],
  search: SearchReadyPayload,
  profile: Partial<WeddingProfile> | null
) {
  const location = normalize([search.location, profile?.city, profile?.region, profile?.country].filter(Boolean).join(" "));
  const style = normalize(search.style ?? "");
  const constraints = normalize(search.constraints ?? "");
  // Pour l'exigence géographique dure, on n'utilise PAS le pays (sinon « France »
  // matcherait n'importe quel prestataire français).
  const requestedLocation = normalize(search.location ?? profile?.city ?? profile?.region ?? "");

  return candidates
    .filter((candidate) => candidate.category === search.category)
    .filter((candidate) => !isBlockedWeddingDirectoryUrl(candidate.sourceUrl) && !isBlockedWeddingDirectoryUrl(candidate.website))
    .filter((candidate) => (candidate.score ?? 0) >= 45)
    .filter((candidate) => hasUsableVendorData(candidate))
    .filter((candidate) => matchesRequestedLocation(candidate, requestedLocation))
    .map((candidate) => ({
      candidate,
      relevance: computeCacheRelevance(candidate, { location, style, constraints })
    }))
    .filter((item) => item.relevance >= 2)
    .sort((left, right) => {
      const scoreDiff = (right.candidate.score ?? 0) - (left.candidate.score ?? 0);
      return scoreDiff || right.relevance - left.relevance;
    })
    .map((item) => item.candidate);
}

function computeCacheRelevance(
  candidate: VendorCatalogEntry,
  input: {
    location: string;
    style: string;
    constraints: string;
  }
) {
  const haystack = normalize(
    [
      candidate.name,
      candidate.city,
      candidate.region,
      candidate.zoneIntervention,
      candidate.summary,
      candidate.vibe,
      candidate.specialties,
      candidate.highlights?.join(" "),
      candidate.tags?.join(" ")
    ]
      .filter(Boolean)
      .join(" ")
  );

  let score = 0;
  if (!input.location || input.location.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word))) score += 2;
  if (!input.style || input.style.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word))) score += 1;
  if (!input.constraints || input.constraints.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word))) score += 1;
  if (candidate.images?.length || candidate.image) score += 1;
  if (candidate.website || candidate.email || candidate.phone) score += 1;
  return score;
}

/**
 * Exigence géographique du cache : quand un lieu est demandé, le candidat doit
 * mentionner ce lieu (hors particules génériques de toponymes : « saint », « sur »...)
 * ou annoncer une couverture nationale. Les fiches sans correspondance sont écartées
 * plutôt que resservies hors zone (ex. food truck breton pour Saint-Cloud).
 */
function matchesRequestedLocation(candidate: VendorCatalogEntry, requestedLocation: string) {
  if (!requestedLocation) return true;

  const haystack = normalize(
    [candidate.city, candidate.region, candidate.zoneIntervention, candidate.address, candidate.summary].filter(Boolean).join(" ")
  );
  if (!haystack) return false;

  if (/\b(toute la france|france entiere|partout en france|national|a l etranger|international|destination wedding)\b/.test(haystack)) {
    return true;
  }

  const stopwords = new Set(["saint", "sainte", "st", "ste", "sur", "sous", "les", "le", "la", "aux", "mont", "ville", "pres", "chez", "de", "du", "des", "en", "et", "france"]);
  const tokens = requestedLocation.split(/\s+/).filter((word) => word.length > 2 && !stopwords.has(word));
  if (tokens.length === 0) return haystack.includes(requestedLocation.trim());
  return tokens.some((token) => haystack.includes(token));
}

function hasUsableVendorData(candidate: VendorCatalogEntry) {
  if (isBlockedWeddingDirectoryUrl(candidate.sourceUrl) || isBlockedWeddingDirectoryUrl(candidate.website)) return false;
  if (candidate.sourceUrl && looksLikeDirectoryPage({ url: candidate.sourceUrl })) return false;
  if (candidate.website && looksLikeDirectoryPage({ url: candidate.website })) return false;
  const hasContact = Boolean(candidate.website || candidate.email || candidate.phone);
  const hasContent = Boolean(candidate.summary || candidate.highlights?.length || candidate.specialties);
  return hasContact && hasContent;
}

function buildExpandedSearchQuery(search: SearchReadyPayload, profile: Partial<WeddingProfile> | null) {
  const region = profile?.region ?? profile?.country ?? "France";
  return [
    categoryToSearchLabel(search.category),
    "mariage",
    search.location ?? region,
    search.style,
    region
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function buildRetrySearchPayload(search: SearchReadyPayload, profile: Partial<WeddingProfile> | null): SearchReadyPayload {
  const location = search.location ?? profile?.city ?? profile?.region ?? profile?.country ?? null;
  const relaxedQuery = [
    categoryToSearchLabel(search.category),
    "mariage",
    location,
    search.style
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return {
    ...search,
    location,
    constraints: null,
    searchQuery: relaxedQuery
  };
}

function buildExternalSearchUrl(search: SearchReadyPayload, profile: Partial<WeddingProfile> | null) {
  const query = [
    categoryToSearchLabel(search.category),
    "mariage",
    search.location ?? profile?.city ?? profile?.region ?? "France",
    search.style,
    search.constraints,
    "avis",
    "contact"
  ]
    .filter(Boolean)
    .join(" ");

  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
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

function sameDomain(left: string, right: string) {
  try {
    return new URL(left).hostname.replace(/^www\./, "") === new URL(right).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function estimateSourceConfidence(candidate: VendorCatalogEntry) {
  let score = 0.4;
  if (candidate.website) score += 0.2;
  if (candidate.email || candidate.phone) score += 0.15;
  if (candidate.images?.length) score += 0.1;
  if (candidate.rating) score += 0.1;
  if (candidate.specialties || candidate.summary) score += 0.05;
  return Math.min(Number(score.toFixed(2)), 1);
}

function buildCategorySpecificMetadata(candidate: VendorCatalogEntry) {
  switch (candidate.category) {
    case "photographer":
    case "videographer":
      return {
        style_photo: candidate.vibe ?? candidate.specialties ?? null,
        format_livraison: null,
        delai_livraison: candidate.availability ?? null,
        materiel: null
      };
    case "caterer":
      return {
        type_cuisine: candidate.specialties ?? null,
        options_regime: candidate.limitations?.join(", ") || null,
        formules: candidate.priceRange ?? null,
        service_inclus: candidate.highlights?.join(", ") || null,
        capacite_couverts: candidate.capacity ?? null
      };
    case "venue":
      return {
        type_lieu: candidate.vibe ?? candidate.specialties ?? null,
        capacite_min: null,
        capacite_max: candidate.capacity ?? null,
        hebergement: null,
        exclusivite_traiteur: null,
        parking: null
      };
    case "dj":
    case "musician":
      return {
        genres_musicaux: candidate.vibe ?? candidate.specialties ?? null,
        materiel_sono: null,
        experience_mariage: candidate.summary ?? null,
        references: candidate.reviewSnippets?.map((review) => review.text).join(" | ") || null
      };
    case "flowers":
      return {
        styles_floraux: candidate.vibe ?? candidate.specialties ?? null,
        livraison_mise_en_place: candidate.availability ?? null,
        location_vases: null
      };
    default:
      return {
        description_libre: candidate.summary ?? null
      };
  }
}

function inferVibeFromProfile(specific: Record<string, string | string[] | null>) {
  return readFirstSpecificValue(specific, [
    "style",
    "style_photo",
    "style_video",
    "style_musical",
    "type_lieu",
    "type_cuisine"
  ]);
}

function inferSpecialtiesFromProfile(specific: Record<string, string | string[] | null>) {
  return readFirstSpecificValue(specific, [
    "prestations",
    "service_inclus",
    "formats",
    "approche",
    "experience_mariage",
    "type_cuisine",
    "espaces_exterieurs"
  ]);
}

function readFirstSpecificValue(specific: Record<string, string | string[] | null>, keys: string[]) {
  for (const key of keys) {
    const value = specific[key];
    if (Array.isArray(value) && value.length > 0) return value.join(", ");
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function hasUsableNormalizedProfile(candidate: VendorCatalogEntry, profile: NonNullable<VendorCandidateView["vendorProfile"]>, usedFallback: boolean) {
  const hasContactPath = Boolean(profile.contact.email || profile.contact.phone || profile.contact.website_url || candidate.email || candidate.phone || candidate.website);
  const hasRealContent = Boolean(profile.summary.about && profile.summary.about.length >= 45);
  const hasLocationSignal = Boolean(profile.identity.exact_address || profile.identity.service_area || profile.identity.location_label || candidate.city || candidate.region);
  const hasMedia = profile.media.photos.length > 0;
  const score = candidate.score ?? 0;

  if (!hasContactPath || !hasRealContent) return false;

  // Fallback-only search snippets are allowed when Firecrawl found a real source page with enough factual material.
  if (usedFallback) {
    if (score < 25) return false;
    if (!candidate.email && !candidate.phone && !candidate.website && !profile.contact.website_url) return false;
  }

  if (candidate.category === "venue") {
    const hasVenueBasics = hasMedia || Boolean(profile.identity.exact_address) || Boolean(profile.logistics.capacity);
    if (usedFallback) return Boolean(hasVenueBasics || profile.contact.website_url || candidate.website) && hasLocationSignal;
    return hasLocationSignal;
  }

  return hasLocationSignal;
}

export async function buildPlannerContext(
  supabase: SupabaseClient,
  input: {
    userId: string;
    messages: UiChatMessage[];
  }
): Promise<PlannerContext> {
  const { data: requests } = await supabase
    .from("vendor_requests")
    .select("id, vendor_category, requirements_json, search_query_text, created_at")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: candidates } =
    requestIds.length > 0
      ? await supabase.from("vendor_candidates").select("category, metadata_json").in("vendor_request_id", requestIds)
      : { data: [] };

  const searchedCategories = Array.from(new Set((requests ?? []).map((request) => labelCategory(request.vendor_category)).filter(isString)));
  const savedCategories = Array.from(new Set((candidates ?? []).map((candidate) => labelCategory(candidate.category)).filter(isString)));

  const requestPreferences = (requests ?? [])
    .slice(0, 5)
    .map((request) => {
      const requirements = request.requirements_json ?? {};
      return [
        labelCategory(request.vendor_category),
        requirements.style ? `style ${requirements.style}` : null,
        requirements.constraints ? `contraintes ${requirements.constraints}` : null,
        requirements.budget ? `budget ${requirements.budget}` : null,
        request.search_query_text ? `requête ${request.search_query_text}` : null
      ]
        .filter(Boolean)
        .join(" : ");
    })
    .filter(Boolean);

  const recentUserPreferences = input.messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => message.content.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    searchedCategories,
    savedCategories,
    recentPreferences: [...requestPreferences, ...recentUserPreferences].slice(0, 8)
  };
}

export function extractConversationForModel(messages: UiChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

export function buildSearchCta(category: VendorCategory) {
  const redirectPath = `/vendors?category=${category}`;
  return {
    action: "show_vendors",
    categorie: categoryConfig[category].label,
    redirect_path: redirectPath,
    ctaHref: redirectPath,
    ctaLabel: "Voir les prestataires →"
  };
}

export function getVendorCategoryLabel(category: VendorCategory, count = 1) {
  const config = categoryConfig[category];
  return count > 1 ? config.plural : config.label;
}

export function normalizeSearchCategory(value: string | null | undefined): VendorCategory | null {
  const normalized = normalize(value ?? "");
  if (!normalized) return null;

  const internalCategories: Record<string, VendorCategory> = {
    venue: "venue",
    caterer: "caterer",
    photographer: "photographer",
    videographer: "videographer",
    dj: "dj",
    musician: "musician",
    flowers: "flowers",
    decor: "decor",
    dress: "dress",
    suit: "suit",
    transport: "transport"
  };

  if (internalCategories[normalized]) return internalCategories[normalized];

  if (/\b(lieu|lieux|domaine|chateau|salle|reception|venue|grange|ferme|mas|bastide|manoir|auberge|jardin|parc|etang|lac|rooftop|terrasse|orangerie)\b/.test(normalized)) {
    return "venue";
  }
  if (/\b(traiteur|traiteurs|restauration|cocktail|diner|repas|wedding cake|wedding_cake|gateau|patisserie)\b/.test(normalized)) return "caterer";
  if (/\b(photographe|photographes|photographer|photo|photos|photobooth|photomaton|borne photo|borne photos)\b/.test(normalized)) return "photographer";
  if (/\b(videaste|videastes|video|videos|film|videographer|cameraman|cadreur|realisation|realisateur)\b/.test(normalized)) return "videographer";
  if (/(dj|disc jockey|mix|platines)/.test(normalized)) return "dj";
  if (/(groupe|chanteur|chanteuse|chante|jazz|acoustique|piano|guitariste|violoniste|contrebasse|quartet|trio|duo musical|orchestre|musique live|live|musicien|musique)/.test(normalized)) {
    return "musician";
  }
  if (/(fleur|floral|fleuriste)/.test(normalized)) return "flowers";
  if (/(deco|decoration|scenographie)/.test(normalized)) return "decor";
  if (/(robe|dress)/.test(normalized)) return "dress";
  if (/(costume|suit)/.test(normalized)) return "suit";
  if (/(transport|navette|chauffeur|voiture)/.test(normalized)) return "transport";

  return null;
}

export function buildContactDraft(candidate: VendorCandidateView, profile: Partial<WeddingProfile> | null) {
  const weddingDate = profile?.wedding_date ?? profile?.wedding_period_text ?? "date à confirmer";
  const names =
    profile?.partner_one_name || profile?.partner_two_name
      ? `${profile?.partner_one_name ?? ""}${profile?.partner_two_name ? ` & ${profile.partner_two_name}` : ""}`.trim()
      : "Nous";
  const place = profile?.city ?? profile?.region ?? "lieu à confirmer";
  const guests = profile?.guest_count ? `${profile.guest_count} invités` : "nombre d'invités à confirmer";
  const vendorBudget = getBudgetAllocationForVendorCategory(profile, candidate.category);
  const budget = vendorBudget?.hint ?? formatBudgetSummary(profile) ?? "budget à confirmer";
  const subject = `Demande d'information – Mariage le ${weddingDate} à ${place}`;
  const intro = `${names} organisons notre mariage le ${weddingDate} à ${place}.`;
  const categoryLine = contactOpeningByCategory(candidate.category);

  const body = [
    "Bonjour,",
    "",
    intro,
    `Nous prévoyons environ ${guests}.`,
    `Budget indicatif : ${budget}.`,
    categoryLine,
    "",
    `Nous aimerions en savoir plus sur ${candidate.name}, vos disponibilités, vos tarifs et les modalités de collaboration.`,
    "Si vous êtes disponibles, pouvez-vous nous indiquer les prochaines étapes ?",
    "",
    "Merci beaucoup,",
    `${names}`
  ].join("\r\n");

  return {
    to: candidate.email ?? "",
    subject,
    body
  };
}

export function buildContactMailto(candidate: VendorCandidateView, profile: Partial<WeddingProfile> | null) {
  const draft = buildContactDraft(candidate, profile);
  return `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

function slugify(value: string | null | undefined) {
  const slug = normalize(value ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "prestataire";
}

function estimatePriceValue(priceRange: string | null | undefined) {
  if (!priceRange) return 0;
  const cleaned = priceRange.replace(/\s/g, "").replace(",", ".");
  const match = cleaned.match(/\d[\d.]*/);
  return match ? Number(match[0].replace(/[^\d.]/g, "")) : 0;
}

function estimateGuestCapacity(capacity: unknown) {
  if (typeof capacity === "number") return capacity;
  if (typeof capacity !== "string") return 0;
  const matches = capacity.match(/\d+/g);
  return matches ? Number(matches[matches.length - 1]) : 0;
}

function canUseCatalogFallback() {
  return !process.env.FIRECRAWL_API_KEY && !process.env.FIRECRAWL_API_KEYS;
}

function labelCategory(category: string | null | undefined) {
  const normalized = normalizeSearchCategory(category);
  return normalized ? categoryConfig[normalized].label : category ?? null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contactOpeningByCategory(category: VendorCategory) {
  switch (category) {
    case "photographer":
      return "Nous cherchons un regard sensible et naturel pour raconter cette journée.";
    case "videographer":
      return "Nous cherchons une vidéo élégante et vivante, fidèle à l'ambiance du jour J.";
    case "caterer":
      return "Nous cherchons une proposition gourmande, fluide en service et adaptée à nos contraintes éventuelles.";
    case "flowers":
      return "Nous cherchons un univers floral cohérent avec l'ambiance de notre mariage.";
    default:
      return "Nous cherchons un prestataire fiable, chaleureux et aligné avec notre mariage.";
  }
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

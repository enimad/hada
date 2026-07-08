import { NextRequest, NextResponse } from "next/server";
import { looksLikeDirectoryPage } from "@/lib/directory-page-detector";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVendorCategories } from "@/lib/vendor-catalog";
import type { VendorCandidateView, VendorCategory } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const category = request.nextUrl.searchParams.get("category") as VendorCategory | null;
    const slug = request.nextUrl.searchParams.get("slug");

    const supabase = createSupabaseServerClient();
    const { data: requests, error: requestsError } = await supabase
      .from("vendor_requests")
      .select("id, vendor_category, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (requestsError) {
      return NextResponse.json({ error: requestsError.message }, { status: 500 });
    }

    const requestIds = (requests ?? []).map((item) => item.id);
    if (requestIds.length === 0) {
      return NextResponse.json({
        categories: getVendorCategories().map((item) => ({ ...item, count: 0 })),
        candidates: []
      });
    }

    let query = supabase.from("vendor_candidates").select("*").in("vendor_request_id", requestIds).order("created_at", { ascending: false });
    if (category) {
      query = query.eq("category", category);
    }

    const { data: candidates, error: candidatesError } = await query;

    if (candidatesError) {
      return NextResponse.json({ error: candidatesError.message }, { status: 500 });
    }

    // Porte d'affichage : les fiches historiques issues d'annuaires (avant le
    // durcissement de la recherche) disparaissent immédiatement, même sans purge.
    const displayableRows = (candidates ?? []).filter(
      (candidate) =>
        ((candidate.metadata_json ?? {}).sourceType ?? null) !== "directory" &&
        !(candidate.source_url && looksLikeDirectoryPage({ url: candidate.source_url })) &&
        !(candidate.website && looksLikeDirectoryPage({ url: candidate.website }))
    );

    const normalized: VendorCandidateView[] = displayableRows.map((candidate) => ({
      id: candidate.id,
      slug: candidate.metadata_json?.slug ?? slugify(candidate.name),
      name: candidate.name,
      category: candidate.category as VendorCategory,
      website: candidate.website,
      email: candidate.email,
      phone: candidate.phone,
      address: candidate.metadata_json?.address ?? null,
      city: candidate.city,
      region: candidate.region,
      priceRange: candidate.price_range,
      score: candidate.score ? Number(candidate.score) : null,
      summary: candidate.summary,
      sourceUrl: candidate.source_url,
      image: candidate.metadata_json?.image ?? null,
      images: Array.isArray(candidate.metadata_json?.images) ? candidate.metadata_json.images : [],
      capacity: candidate.metadata_json?.capacity ?? null,
      vibe: candidate.metadata_json?.vibe ?? null,
      rating: candidate.metadata_json?.rating ?? null,
      reviewsCount: candidate.metadata_json?.reviewsCount ?? null,
      highlights: Array.isArray(candidate.metadata_json?.highlights) ? candidate.metadata_json.highlights : [],
      tags: Array.isArray(candidate.metadata_json?.tags) ? candidate.metadata_json.tags : [],
      match: candidate.metadata_json?.match ?? null,
      contactLead: candidate.metadata_json?.contactLead ?? null,
      sourceLabel: candidate.metadata_json?.sourceLabel ?? null,
      reviewSearchUrl: candidate.metadata_json?.reviewSearchUrl ?? null,
      reviewSnippets: Array.isArray(candidate.metadata_json?.reviewSnippets) ? candidate.metadata_json.reviewSnippets : [],
      availability: candidate.metadata_json?.availability ?? null,
      specialties: candidate.metadata_json?.specialties ?? null,
      limitations: Array.isArray(candidate.metadata_json?.limitations) ? candidate.metadata_json.limitations : [],
      zoneIntervention: candidate.metadata_json?.zoneIntervention ?? null,
      vendorProfile: candidate.metadata_json?.vendor_profile ?? null,
      normalizerError: Boolean(candidate.metadata_json?.normalizer_error)
    }));

    const deduped = dedupeCandidates(normalized.filter(isDisplayableCandidate));
    const filtered = slug ? deduped.filter((candidate) => candidate.slug === slug) : deduped;
    const categories = getVendorCategories().map((item) => ({
      ...item,
      count: deduped.filter((candidate) => candidate.category === item.key).length
    }));

    return NextResponse.json({
      categories,
      candidates: filtered
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupeCandidates(candidates: VendorCandidateView[]) {
  const seen = new Map<string, VendorCandidateView>();

  for (const candidate of candidates) {
    const existing = seen.get(candidate.slug);
    if (!existing || displayCompletenessScore(candidate) > displayCompletenessScore(existing)) {
      seen.set(candidate.slug, candidate);
    }
  }

  return Array.from(seen.values());
}

function displayCompletenessScore(candidate: VendorCandidateView) {
  const profile = candidate.vendorProfile;
  let score = candidate.score ?? 0;
  if (profile?.media?.photos?.length || candidate.images?.length || candidate.image) score += 18;
  if (profile?.contact?.email || candidate.email) score += 12;
  if (profile?.contact?.phone || candidate.phone) score += 10;
  if (profile?.identity?.exact_address || candidate.address) score += 8;
  if (profile?.reviews?.snippets?.length || candidate.reviewSnippets?.length) score += 8;
  if (profile?.logistics?.capacity || candidate.capacity) score += 6;
  if (profile?.logistics?.price_range || candidate.priceRange) score += 6;
  if (profile?.summary?.strengths?.length || candidate.highlights?.length) score += 6;
  if (profile?.summary?.about || candidate.summary) score += 4;
  if (candidate.normalizerError) score -= 15;
  return score;
}

function isGenericDisplayName(value: string | null | undefined) {
  const normalized = normalize(value ?? "");
  if (!normalized) return true;

  return [
    "selection de",
    "les meilleurs",
    "top ",
    "annuaire",
    "comparatif",
    "liste de",
    "10 meilleurs",
    "meilleurs traiteurs",
    "meilleurs domaines",
    "meilleurs prestataires"
  ].some((pattern) => normalized.startsWith(pattern) || normalized.includes(` ${pattern}`));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isDisplayableCandidate(candidate: VendorCandidateView) {
  if (isGenericDisplayName(candidate.vendorProfile?.identity?.name ?? candidate.name)) return false;

  const hasContactPath = Boolean(candidate.email || candidate.phone || candidate.website || candidate.vendorProfile?.contact?.website_url);
  const summary = candidate.vendorProfile?.summary?.about ?? candidate.summary;
  const hasUsefulSummary = Boolean(summary && summary.length >= 45);
  if (!hasContactPath || !hasUsefulSummary) return false;

  if ((!candidate.vendorProfile || candidate.normalizerError) && (candidate.score ?? 0) > 0 && (candidate.score ?? 0) < 25) return false;

  if (candidate.category === "venue") {
    if (candidate.vendorProfile && !candidate.normalizerError) return true;
    return Boolean((candidate.images?.length ?? 0) > 0 || candidate.address || candidate.capacity || candidate.website || candidate.vendorProfile?.contact?.website_url);
  }

  return true;
}

function isTruncatedText(value: string) {
  const trimmed = value.trim();
  return /(\.\.\.|…)$/.test(trimmed) || / \.\.\./.test(trimmed);
}

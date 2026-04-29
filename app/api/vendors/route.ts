import { NextRequest, NextResponse } from "next/server";
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

    const normalized: VendorCandidateView[] = (candidates ?? []).map((candidate) => ({
      id: candidate.id,
      slug: candidate.metadata_json?.slug ?? slugify(candidate.name),
      name: candidate.name,
      category: candidate.category as VendorCategory,
      website: candidate.website,
      email: candidate.email,
      phone: candidate.phone,
      city: candidate.city,
      region: candidate.region,
      priceRange: candidate.price_range,
      score: candidate.score ? Number(candidate.score) : null,
      summary: candidate.summary,
      sourceUrl: candidate.source_url,
      image: candidate.metadata_json?.image ?? null,
      capacity: candidate.metadata_json?.capacity ?? null,
      vibe: candidate.metadata_json?.vibe ?? null,
      rating: candidate.metadata_json?.rating ?? null,
      reviewsCount: candidate.metadata_json?.reviewsCount ?? null,
      highlights: Array.isArray(candidate.metadata_json?.highlights) ? candidate.metadata_json.highlights : [],
      tags: Array.isArray(candidate.metadata_json?.tags) ? candidate.metadata_json.tags : [],
      match: candidate.metadata_json?.match ?? null,
      contactLead: candidate.metadata_json?.contactLead ?? null
    }));

    const deduped = dedupeCandidates(normalized);
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
    if (!seen.has(candidate.slug)) {
      seen.set(candidate.slug, candidate);
    }
  }

  return Array.from(seen.values());
}

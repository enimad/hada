import { NextRequest, NextResponse } from "next/server";
import { buildContactDraft, buildContactMailto, ensureActiveConversation, insertConversationMessage } from "@/lib/server/hada";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await request.json();
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
    const previewOnly = body.preview === true;

    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const conversation = await ensureActiveConversation(supabase, user.id);

    const { data: candidate, error: candidateError } = await supabase.from("vendor_candidates").select("*").eq("id", candidateId).single();
    if (candidateError || !candidate) {
      return NextResponse.json({ error: candidateError?.message ?? "Prestataire introuvable" }, { status: 404 });
    }

    const candidateView = {
      id: candidate.id,
      slug: candidate.metadata_json?.slug ?? candidate.name.toLowerCase().replace(/\s+/g, "-"),
      name: candidate.metadata_json?.vendor_profile?.identity?.name ?? candidate.name,
      category: candidate.metadata_json?.vendor_profile?.identity?.category ?? candidate.category,
      website: candidate.metadata_json?.vendor_profile?.contact?.website_url ?? candidate.metadata_json?.vendor_profile?.identity?.website_url ?? candidate.website,
      email: candidate.metadata_json?.vendor_profile?.contact?.email ?? candidate.email,
      phone: candidate.metadata_json?.vendor_profile?.contact?.phone ?? candidate.phone,
      city: candidate.city,
      region: candidate.region,
      priceRange: candidate.metadata_json?.vendor_profile?.logistics?.price_range ?? candidate.price_range,
      score: candidate.score ? Number(candidate.score) : null,
      summary: candidate.metadata_json?.vendor_profile?.summary?.about ?? candidate.summary,
      sourceUrl: candidate.source_url,
      image: candidate.metadata_json?.vendor_profile?.media?.photos?.[0] ?? candidate.metadata_json?.image ?? null,
      capacity: candidate.metadata_json?.vendor_profile?.logistics?.capacity ?? candidate.metadata_json?.capacity ?? null,
      vibe: candidate.metadata_json?.vibe ?? null,
      rating: candidate.metadata_json?.vendor_profile?.reviews?.rating ?? candidate.metadata_json?.rating ?? null,
      reviewsCount: candidate.metadata_json?.vendor_profile?.reviews?.review_count ?? candidate.metadata_json?.reviewsCount ?? null,
      highlights: Array.isArray(candidate.metadata_json?.vendor_profile?.summary?.strengths)
        ? candidate.metadata_json.vendor_profile.summary.strengths
        : Array.isArray(candidate.metadata_json?.highlights)
          ? candidate.metadata_json.highlights
          : [],
      tags: Array.isArray(candidate.metadata_json?.tags) ? candidate.metadata_json.tags : [],
      match: candidate.metadata_json?.match ?? null,
      contactLead: candidate.metadata_json?.vendor_profile?.logistics?.availability ?? candidate.metadata_json?.contactLead ?? null,
      vendorProfile: candidate.metadata_json?.vendor_profile ?? null
    };

    const emailDraft = buildContactDraft(candidateView, profile);
    const mailtoUrl = buildContactMailto(candidateView, profile);

    if (previewOnly) {
      return NextResponse.json({
        mailtoUrl,
        emailDraft
      });
    }

    const { data: thread, error: threadError } = await supabase
      .from("outreach_threads")
      .insert({
        user_id: user.id,
        vendor_candidate_id: candidate.id,
        channel: "email",
        subject: decodeURIComponent(mailtoUrl.split("subject=")[1]?.split("&body=")[0] ?? ""),
        status: "draft",
        last_message_at: new Date().toISOString()
      })
      .select("*")
      .single();

    if (threadError) {
      return NextResponse.json({ error: threadError.message }, { status: 500 });
    }

    await supabase.from("outreach_messages").insert({
      outreach_thread_id: thread.id,
      direction: "outbound",
      sender_label: "Utilisateur",
      content: decodeURIComponent(mailtoUrl.split("&body=")[1] ?? "")
    });

    await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "assistant",
      content: `Prestataire contacté : ${candidate.name}. J’ai préparé un brouillon d’email avec les informations de votre mariage.`,
      metadata: {
        ctaHref: candidateView.category === "venue" ? `/venues/${candidateView.slug}` : `/vendors/${candidateView.slug}`,
        ctaLabel: "Revoir la fiche prestataire"
      }
    });

    return NextResponse.json({
      mailtoUrl,
      emailDraft
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

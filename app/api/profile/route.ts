import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function computeCompletionScore(payload: Record<string, unknown>) {
  const trackedFields = [
    payload.partner_one_name,
    payload.partner_two_name,
    payload.wedding_date ?? payload.wedding_period_text,
    payload.city,
    payload.guest_count,
    payload.budget_min ?? payload.budget_max,
    payload.style,
    payload.ceremony_type
  ];

  const completed = trackedFields.filter(Boolean).length;
  return Math.round((completed / trackedFields.length) * 100);
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("wedding_profiles").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const payload = {
    user_id: body.userId,
    partner_one_name: body.partner_one_name ?? null,
    partner_two_name: body.partner_two_name ?? null,
    wedding_date: body.wedding_date ?? null,
    wedding_period_text: body.wedding_period_text ?? null,
    city: body.city ?? null,
    region: body.region ?? null,
    country: body.country ?? null,
    guest_count: body.guest_count ?? null,
    budget_min: body.budget_min ?? null,
    budget_max: body.budget_max ?? null,
    style: body.style ?? null,
    ceremony_type: body.ceremony_type ?? null,
    notes: body.notes ?? null,
    profile_completion_score: computeCompletionScore(body)
  };

  const { data, error } = await supabase
    .from("wedding_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

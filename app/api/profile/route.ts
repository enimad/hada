import { NextRequest, NextResponse } from "next/server";
import { normalizeWeddingBudgetOverrides } from "@/lib/budget";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeWeddingChecklist } from "@/lib/wedding-checklist";

let weddingChecklistColumnAvailable: boolean | null = null;
let weddingBudgetOverridesColumnAvailable: boolean | null = null;

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

function formatProfileError(message: string) {
  if (message.includes("public.wedding_profiles")) {
    return "La table Supabase `public.wedding_profiles` est introuvable. Ouvre Supabase > SQL Editor puis execute le contenu de `supabase/schema.sql`.";
  }

  if (message.includes("wedding_checklist")) {
    return "La colonne Supabase `public.wedding_profiles.wedding_checklist` est introuvable. Ouvre Supabase > SQL Editor puis execute la migration checklist de `supabase/schema.sql`.";
  }

  if (message.includes("wedding_budget_overrides")) {
    return "La colonne Supabase `public.wedding_profiles.wedding_budget_overrides` est introuvable. Ouvre Supabase > SQL Editor puis execute la migration budget de `supabase/schema.sql`.";
  }

  return message;
}

export async function GET(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: formatProfileError(error.message) }, { status: 500 });
  }

  return NextResponse.json({
    profile: data
      ? {
          ...data,
          wedding_checklist: normalizeWeddingChecklist(data.wedding_checklist),
          wedding_budget_overrides: normalizeWeddingBudgetOverrides(data.wedding_budget_overrides)
        }
      : data
  });
}

export async function PUT(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const body = await request.json();

  const supabase = createSupabaseServerClient();
  const { data: currentProfile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
  let weddingChecklist = null;
  if (body.wedding_checklist !== undefined) {
    weddingChecklist = normalizeWeddingChecklist(body.wedding_checklist);
  } else if (weddingChecklistColumnAvailable !== false) {
    weddingChecklist = normalizeWeddingChecklist(currentProfile?.wedding_checklist);
  }
  const isSavingBudgetOverrides = body.wedding_budget_overrides !== undefined;
  const weddingBudgetOverrides = isSavingBudgetOverrides ? normalizeWeddingBudgetOverrides(body.wedding_budget_overrides) : undefined;
  const payloadBase = {
    user_id: user.id,
    partner_one_name: body.partner_one_name !== undefined ? body.partner_one_name : (currentProfile?.partner_one_name ?? null),
    partner_two_name: body.partner_two_name !== undefined ? body.partner_two_name : (currentProfile?.partner_two_name ?? null),
    wedding_date: body.wedding_date !== undefined ? body.wedding_date : (currentProfile?.wedding_date ?? null),
    wedding_period_text: body.wedding_period_text !== undefined ? body.wedding_period_text : (currentProfile?.wedding_period_text ?? null),
    city: body.city !== undefined ? body.city : (currentProfile?.city ?? null),
    region: body.region !== undefined ? body.region : (currentProfile?.region ?? null),
    country: body.country !== undefined ? body.country : (currentProfile?.country ?? null),
    guest_count: body.guest_count !== undefined ? body.guest_count : (currentProfile?.guest_count ?? null),
    budget_min: body.budget_min !== undefined ? body.budget_min : (currentProfile?.budget_min ?? null),
    budget_max: body.budget_max !== undefined ? body.budget_max : (currentProfile?.budget_max ?? null),
    style: body.style !== undefined ? body.style : (currentProfile?.style ?? null),
    ceremony_type: body.ceremony_type !== undefined ? body.ceremony_type : (currentProfile?.ceremony_type ?? null),
    notes: body.notes !== undefined ? body.notes : (currentProfile?.notes ?? null),
    profile_completion_score: 0
  };
  payloadBase.profile_completion_score = computeCompletionScore(payloadBase);
  const payloadWithChecklist =
    weddingChecklistColumnAvailable === false || !weddingChecklist ? payloadBase : { ...payloadBase, wedding_checklist: weddingChecklist };
  const payload =
    (!isSavingBudgetOverrides && weddingBudgetOverridesColumnAvailable === false) || weddingBudgetOverrides === undefined
      ? payloadWithChecklist
      : { ...payloadWithChecklist, wedding_budget_overrides: weddingBudgetOverrides };

  let { data, error } = await supabase
    .from("wedding_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error && error.message.includes("wedding_budget_overrides") && isSavingBudgetOverrides) {
    return NextResponse.json({ error: formatProfileError(error.message) }, { status: 500 });
  }

  if (error && (error.message.includes("wedding_checklist") || error.message.includes("wedding_budget_overrides"))) {
    if (error.message.includes("wedding_checklist")) weddingChecklistColumnAvailable = false;
    if (error.message.includes("wedding_budget_overrides")) weddingBudgetOverridesColumnAvailable = false;

    const fallbackPayload =
      weddingChecklistColumnAvailable === false || !weddingChecklist ? payloadBase : { ...payloadBase, wedding_checklist: weddingChecklist };
    const fallbackPayloadWithBudget =
      weddingBudgetOverrides !== undefined && weddingBudgetOverridesColumnAvailable !== false
        ? { ...fallbackPayload, wedding_budget_overrides: weddingBudgetOverrides }
        : fallbackPayload;
    const fallbackResult = await supabase
      .from("wedding_profiles")
      .upsert(fallbackPayloadWithBudget, { onConflict: "user_id" })
      .select("*")
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  } else if (!error) {
    if (weddingChecklist) weddingChecklistColumnAvailable = true;
    if (weddingBudgetOverrides !== undefined) weddingBudgetOverridesColumnAvailable = true;
  }

  if (error) {
    return NextResponse.json({ error: formatProfileError(error.message) }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      ...data,
      wedding_checklist: normalizeWeddingChecklist(data.wedding_checklist),
      wedding_budget_overrides: normalizeWeddingBudgetOverrides(data.wedding_budget_overrides)
    }
  });
}

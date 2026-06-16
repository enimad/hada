import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedPlans = new Set(["essential", "serenity"]);
const allowedBillingModes = new Set(["monthly", "one_time"]);

function formatOfferPreferenceError(message: string) {
  if (message.includes("public.offer_preferences") || message.includes("offer_preferences")) {
    return "La table Supabase `public.offer_preferences` est introuvable. Exécute le SQL de création de la page Mon offre dans Supabase.";
  }

  return message;
}

export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const body = (await request.json()) as {
    selected_plan?: unknown;
    billing_mode?: unknown;
  };

  const selectedPlan = typeof body.selected_plan === "string" ? body.selected_plan : "";
  const billingMode = typeof body.billing_mode === "string" ? body.billing_mode : "";

  if (!allowedPlans.has(selectedPlan) || !allowedBillingModes.has(billingMode)) {
    return NextResponse.json({ error: "Choix d'offre invalide." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("offer_preferences")
    .upsert(
      {
        user_id: user.id,
        selected_plan: selectedPlan,
        billing_mode: billingMode,
        source_path: "/mon-offre"
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: formatOfferPreferenceError(error.message) }, { status: 500 });
  }

  return NextResponse.json({ preference: data });
}

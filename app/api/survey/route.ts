import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SurveyPayload = {
  sourcePath?: string;
  sourceVendorSlug?: string;
  rating?: number;
  appreciated?: string;
  frustrated?: string;
  reuseIntent?: string;
  dreamFeature?: string;
};

type SurveyContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: unknown;
  conversations: unknown[];
  messages: unknown[];
  vendorRequests: unknown[];
  vendorCandidates: unknown[];
  outreachThreads: unknown[];
  submittedAt: string;
};

export async function GET(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("user_id", user.id)
    .eq("email_sent", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Survey status check failed", error);
    return NextResponse.json({ completed: false });
  }

  return NextResponse.json({ completed: Boolean(data?.length) });
}

export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const body = (await request.json()) as SurveyPayload;
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
    return NextResponse.json({ error: "Note invalide." }, { status: 400 });
  }

  const appreciated = normalizeAnswer(body.appreciated);
  const frustrated = normalizeAnswer(body.frustrated);
  const reuseIntent = normalizeAnswer(body.reuseIntent);
  if (!appreciated || !frustrated || !reuseIntent) {
    return NextResponse.json({ error: "Réponses obligatoires manquantes." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const context = await buildSurveyContext(supabase, user.id, user.email ?? null);
  const emailText = buildSurveyEmailText({
    rating,
    appreciated,
    frustrated,
    reuseIntent,
    dreamFeature: normalizeAnswer(body.dreamFeature),
    sourcePath: body.sourcePath ?? null,
    sourceVendorSlug: body.sourceVendorSlug ?? null,
    context
  });
  const emailSent = await sendSurveyEmail(emailText, user.email ?? "utilisateur Hada");

  const { error: insertError } = await supabase.from("survey_responses").insert({
    user_id: user.id,
    source_path: body.sourcePath ?? null,
    source_vendor_slug: body.sourceVendorSlug ?? null,
    rating,
    appreciated,
    frustrated,
    reuse_intent: reuseIntent,
    dream_feature: normalizeAnswer(body.dreamFeature),
    context_json: context,
    email_sent: emailSent
  });

  if (insertError) {
    console.error("Survey insert failed", insertError);
    return NextResponse.json(
      {
        error: "Le survey est prêt, mais la table Supabase `survey_responses` est introuvable. Exécutez `supabase/schema.sql` dans Supabase."
      },
      { status: 500 }
    );
  }

  if (!emailSent) {
    return NextResponse.json({ error: "Impossible d'envoyer l'email du survey pour le moment.", emailSent: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailSent });
}

function normalizeAnswer(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function buildSurveyContext(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string, email: string | null): Promise<SurveyContext> {
  const [{ data: profile }, { data: conversations }, { data: vendorRequests }, { data: outreachThreads }] = await Promise.all([
    supabase.from("wedding_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("conversations").select("id, title, status, created_at, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(3),
    supabase.from("vendor_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    supabase.from("outreach_threads").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10)
  ]);

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
  const vendorRequestIds = (vendorRequests ?? []).map((vendorRequest) => vendorRequest.id);

  const [{ data: messages }, { data: vendorCandidates }] = await Promise.all([
    conversationIds.length > 0
      ? supabase.from("messages").select("role, content, created_at, conversation_id").in("conversation_id", conversationIds).order("created_at", { ascending: true }).limit(80)
      : Promise.resolve({ data: [] }),
    vendorRequestIds.length > 0
      ? supabase.from("vendor_candidates").select("*").in("vendor_request_id", vendorRequestIds).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] })
  ]);

  return {
    user: {
      id: userId,
      email
    },
    profile: profile ?? null,
    conversations: conversations ?? [],
    messages: messages ?? [],
    vendorRequests: vendorRequests ?? [],
    vendorCandidates: vendorCandidates ?? [],
    outreachThreads: outreachThreads ?? [],
    submittedAt: new Date().toISOString()
  };
}

function buildSurveyEmailText({
  rating,
  appreciated,
  frustrated,
  reuseIntent,
  dreamFeature,
  sourcePath,
  sourceVendorSlug,
  context
}: {
  rating: number;
  appreciated: string;
  frustrated: string;
  reuseIntent: string;
  dreamFeature: string;
  sourcePath: string | null;
  sourceVendorSlug: string | null;
  context: SurveyContext;
}) {
  return [
    "Nouveau retour survey Hada",
    "",
    `Email utilisateur : ${context.user.email ?? "Non disponible"}`,
    `Fiche quittée : ${sourcePath ?? "Non disponible"}`,
    `Slug prestataire : ${sourceVendorSlug ?? "Non disponible"}`,
    `Note recommandation : ${rating}/10`,
    "",
    "Ce que l'utilisateur a apprécié :",
    appreciated,
    "",
    "Ce qui a frustré ou semblé compliqué :",
    frustrated,
    "",
    "Réutilisation de Hada :",
    reuseIntent,
    "",
    "Feature rêvée :",
    dreamFeature || "Non renseigné",
    "",
    "Contexte complet :",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

async function sendSurveyEmail(text: string, userLabel: string) {
  if (!env.resendApiKey || !env.surveyNotifyTo || !env.surveyNotifyFrom) {
    console.warn("Survey email not sent: RESEND_API_KEY, SURVEY_NOTIFY_TO or SURVEY_NOTIFY_FROM is missing.");
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.surveyNotifyFrom,
      to: [env.surveyNotifyTo],
      subject: `Nouveau retour survey Hada - ${userLabel}`,
      text
    })
  });

  if (!response.ok) {
    console.error("Survey email failed", await response.text());
    return false;
  }

  return true;
}

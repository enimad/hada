import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWeddingSummary } from "@/lib/prompts";
import type { UiChatMessage, VendorCandidateView, VendorCategory, WeddingProfile } from "@/lib/types";
import { canLaunchSearch, detectVendorCategory, missingSearchFields, searchVendorCatalog } from "@/lib/vendor-catalog";

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
      content: `${partnerLabel} - Synthese\nJe relis votre profil mariage : ${summary}.`
    },
    {
      role: "assistant",
      content:
        "Je vais vous guider prestataire par prestataire. En general, le point de depart le plus structurant est le lieu, car il influence la capacite, le budget et le reste des recommandations."
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
    category: VendorCategory;
    query: string;
    profile: Partial<WeddingProfile> | null;
  }
) {
  const candidates = searchVendorCatalog({
    category: input.category,
    query: input.query,
    profile: input.profile
  });

  const requirements = {
    summary: buildWeddingSummary(input.profile),
    query: input.query,
    category: input.category
  };

  const { data: request, error: requestError } = await supabase
    .from("vendor_requests")
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      vendor_category: input.category,
      status: "results_ready",
      requirements_json: requirements,
      search_query_text: input.query
    })
    .select("*")
    .single();

  if (requestError) throw requestError;

  if (candidates.length > 0) {
    const payload = candidates.map((candidate) => ({
      vendor_request_id: request.id,
      name: candidate.name,
      category: candidate.category,
      website: candidate.website,
      email: candidate.email,
      phone: candidate.phone,
      city: candidate.city,
      region: candidate.region,
      price_range: candidate.priceRange,
      score: candidate.score,
      summary: candidate.summary,
      source_url: candidate.sourceUrl,
      metadata_json: {
        slug: candidate.slug,
        image: candidate.image,
        capacity: candidate.capacity,
        vibe: candidate.vibe,
        rating: candidate.rating,
        reviewsCount: candidate.reviewsCount,
        highlights: candidate.highlights,
        tags: candidate.tags,
        match: candidate.match,
        contactLead: candidate.contactLead
      }
    }));

    const { error: candidatesError } = await supabase.from("vendor_candidates").insert(payload);
    if (candidatesError) throw candidatesError;
  }

  return {
    request,
    candidates
  };
}

export function extractConversationForModel(messages: UiChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

export function computeSearchIntent(userText: string, profile: Partial<WeddingProfile> | null) {
  const category = detectVendorCategory(userText);
  return {
    category,
    canLaunch: canLaunchSearch(category, profile),
    missingFields: missingSearchFields(category, profile)
  };
}

export function buildSearchAnnouncement(category: VendorCategory, count: number) {
  if (category === "venue") {
    return `J'ai trouve ${count} lieux qui semblent bien correspondre a votre mariage. Je vous ai prepare une selection a consulter tout de suite.`;
  }

  return `J'ai prepare une premiere selection de ${count} prestataires pour cette categorie.`;
}

export function buildContactMailto(candidate: VendorCandidateView, profile: Partial<WeddingProfile> | null) {
  const weddingDate = profile?.wedding_date ?? profile?.wedding_period_text ?? "date a confirmer";
  const names =
    profile?.partner_one_name || profile?.partner_two_name
      ? `${profile?.partner_one_name ?? ""} ${profile?.partner_two_name ? `et ${profile.partner_two_name}` : ""}`.trim()
      : "Nous";
  const place = profile?.city ?? "lieu a confirmer";
  const guests = profile?.guest_count ? `${profile.guest_count} invites` : "nombre d'invites a confirmer";
  const budget =
    profile?.budget_max || profile?.budget_min
      ? `${profile?.budget_min ?? ""}${profile?.budget_min && profile?.budget_max ? " - " : ""}${profile?.budget_max ?? ""} EUR`
      : "budget a confirmer";

  const subject = `Demande d'informations - Mariage ${weddingDate}`;
  const body = [
    "Bonjour,",
    "",
    `${names} organisons notre mariage pour ${weddingDate}.`,
    `Lieu envisage: ${place}.`,
    `Nombre d'invites: ${guests}.`,
    `Budget indicatif: ${budget}.`,
    "",
    `Nous aimerions obtenir plus d'informations sur ${candidate.name}, vos disponibilites, vos conditions et vos tarifs.`,
    "",
    "Merci beaucoup,",
    "Bien cordialement"
  ].join("\r\n");

  return `mailto:${encodeURIComponent(candidate.email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type WeddingProfile = {
  id: string;
  user_id: string;
  partner_one_name: string | null;
  partner_two_name: string | null;
  wedding_date: string | null;
  wedding_period_text: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  guest_count: number | null;
  budget_min: number | null;
  budget_max: number | null;
  style: string | null;
  ceremony_type: string | null;
  notes: string | null;
  profile_completion_score: number | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

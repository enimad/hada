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

export type VendorReviewSnippet = {
  author: string;
  text: string;
  rating?: number | null;
  source?: string | null;
  date?: string | null;
};

export type VendorProfileGeneratedFrom = "official_site" | "directory" | "mixed_sources";

export type VendorProfilePreferredContact = "email" | "phone" | "website";

export type VendorProfile = {
  identity: {
    name: string;
    category: VendorCategory;
    location_label: string;
    exact_address: string | null;
    service_area: string | null;
    website_url: string | null;
  };
  media: {
    photos: string[];
    fallback_visual_type: "none" | "category_placeholder";
  };
  summary: {
    title: string;
    about: string;
    strengths: string[];
    caveats: string[];
  };
  contact: {
    email: string | null;
    phone: string | null;
    website_url: string | null;
    preferred_contact: VendorProfilePreferredContact;
  };
  reviews: {
    rating: number | null;
    review_count: number | null;
    snippets: VendorReviewSnippet[];
    google_reviews_url: string;
  };
  logistics: {
    price_range: string | null;
    capacity: string | null;
    availability: string | null;
    map_query: string | null;
  };
  category_specific: Record<string, string | string[] | null>;
  quality: {
    source_confidence: number;
    missing_fields: string[];
    generated_from: VendorProfileGeneratedFrom;
  };
};

export type UiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ctaHref?: string;
  ctaLabel?: string;
  ctaAction?: string | null;
  createdAt?: string;
};

export type VendorCategory =
  | "venue"
  | "caterer"
  | "photographer"
  | "videographer"
  | "dj"
  | "musician"
  | "decor"
  | "dress"
  | "suit"
  | "flowers"
  | "transport";

export type VendorCandidateView = {
  id: string;
  slug: string;
  name: string;
  category: VendorCategory;
  website: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  city: string | null;
  region: string | null;
  priceRange: string | null;
  score: number | null;
  summary: string | null;
  sourceUrl: string | null;
  image: string | null;
  images?: string[];
  capacity: string | null;
  vibe: string | null;
  rating: number | null;
  reviewsCount: number | null;
  highlights: string[];
  tags: string[];
  match: string | null;
  contactLead: string | null;
  sourceLabel?: string | null;
  reviewSearchUrl?: string | null;
  reviewSnippets?: VendorReviewSnippet[];
  availability?: string | null;
  specialties?: string | null;
  limitations?: string[];
  zoneIntervention?: string | null;
  vendorProfile?: VendorProfile | null;
  normalizerError?: boolean;
};

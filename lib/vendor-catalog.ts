import type { VendorCategory, VendorCandidateView, WeddingProfile } from "@/lib/types";

export type VendorCatalogEntry = VendorCandidateView & {
  priceValue: number;
  guestCapacity: number;
  sourceLabel: string;
};

const venueCatalog: VendorCatalogEntry[] = [
  {
    id: "catalog-venue-domaine-des-oliviers",
    slug: "domaine-des-oliviers",
    name: "Domaine des Oliviers",
    category: "venue",
    website: "https://example.com/domaine-des-oliviers",
    email: "contact@domainedesoliviers.fr",
    phone: "+33 4 00 00 00 01",
    city: "Aix-en-Provence",
    region: "Provence",
    priceRange: "A partir de 7 500 EUR",
    priceValue: 7500,
    guestCapacity: 120,
    score: null,
    summary: "Mas provencal avec oliveraie, hebergement sur place et grande terrasse pour cocktail.",
    sourceUrl: "https://example.com/domaine-des-oliviers",
    image: "/venue-olive.svg",
    capacity: "120 invites",
    vibe: "Elegant et lumineux",
    rating: 5,
    reviewsCount: 24,
    highlights: ["Hebergement sur place", "Grande terrasse", "Plan B interieur"],
    tags: ["Provence", "Terrasse", "Hebergement"],
    match: "Correspond a un mariage elegant en Provence avec hebergement sur place.",
    contactLead: "Reponse moyenne en 24h",
    sourceLabel: "Catalogue Hada"
  },
  {
    id: "catalog-venue-bastide-saint-loup",
    slug: "bastide-saint-loup",
    name: "Bastide Saint-Loup",
    category: "venue",
    website: "https://example.com/bastide-saint-loup",
    email: "bonjour@bastidesaintloup.fr",
    phone: "+33 4 00 00 00 02",
    city: "Luberon",
    region: "Provence",
    priceRange: "A partir de 9 200 EUR",
    priceValue: 9200,
    guestCapacity: 150,
    score: null,
    summary: "Belle cour en pierre, chambres sur place et vue degagee pour un diner exterieur.",
    sourceUrl: "https://example.com/bastide-saint-loup",
    image: "/venue-bastide.svg",
    capacity: "150 invites",
    vibe: "Bastide chic",
    rating: 4.9,
    reviewsCount: 31,
    highlights: ["Vue degagee", "Chambres sur place", "Cour centrale en pierre"],
    tags: ["Luberon", "Vue", "Week-end"],
    match: "Tres bon fit pour une ambiance editoriale et un mariage sur plusieurs jours.",
    contactLead: "Reponse moyenne en 48h",
    sourceLabel: "Catalogue Hada"
  },
  {
    id: "catalog-venue-manoir-des-jardins",
    slug: "manoir-des-jardins",
    name: "Manoir des Jardins",
    category: "venue",
    website: "https://example.com/manoir-des-jardins",
    email: "events@manoirdesjardins.fr",
    phone: "+33 4 00 00 00 03",
    city: "Avignon",
    region: "Provence",
    priceRange: "A partir de 6 800 EUR",
    priceValue: 6800,
    guestCapacity: 100,
    score: null,
    summary: "Lieu intimiste avec jardin structure et salons elegants pour un mariage raffine.",
    sourceUrl: "https://example.com/manoir-des-jardins",
    image: "/venue-manoir.svg",
    capacity: "100 invites",
    vibe: "Romantique et intimiste",
    rating: 4.8,
    reviewsCount: 19,
    highlights: ["Jardins formalises", "Interieur + exterieur", "Acces facile"],
    tags: ["Avignon", "Jardins", "Romantique"],
    match: "Ideal si vous cherchez un lieu raffine avec plan B interieur.",
    contactLead: "Reponse moyenne en 24h",
    sourceLabel: "Catalogue Hada"
  },
  {
    id: "catalog-venue-grange-de-javon",
    slug: "grange-de-javon",
    name: "La Grange de Javon",
    category: "venue",
    website: "https://example.com/grange-de-javon",
    email: "contact@grangedejavon.fr",
    phone: "+33 4 00 00 00 04",
    city: "Sault",
    region: "Provence",
    priceRange: "A partir de 4 500 EUR",
    priceValue: 4500,
    guestCapacity: 150,
    score: null,
    summary: "Domaine de caractere avec vue campagne, ideal pour une celebration conviviale en Provence.",
    sourceUrl: "https://example.com/grange-de-javon",
    image: "/venue-olive.svg",
    capacity: "150 invites",
    vibe: "Authentique et chaleureux",
    rating: 4.9,
    reviewsCount: 28,
    highlights: ["Grande capacite", "Vue campagne", "Budget accessible"],
    tags: ["Campagne", "Convivial", "Vue"],
    match: "Excellent rapport capacite / budget pour un mariage chaleureux.",
    contactLead: "Reponse moyenne en 24h",
    sourceLabel: "Catalogue Hada"
  },
  {
    id: "catalog-venue-domaine-du-vallon",
    slug: "domaine-du-vallon",
    name: "Domaine du Vallon",
    category: "venue",
    website: "https://example.com/domaine-du-vallon",
    email: "hello@domaineduvallon.fr",
    phone: "+33 4 00 00 00 05",
    city: "L'Isle-sur-la-Sorgue",
    region: "Provence",
    priceRange: "A partir de 8 400 EUR",
    priceValue: 8400,
    guestCapacity: 130,
    score: null,
    summary: "Maison de maitre lumineuse avec grand jardin et espaces cocktails tres photogeniques.",
    sourceUrl: "https://example.com/domaine-du-vallon",
    image: "/venue-bastide.svg",
    capacity: "130 invites",
    vibe: "Naturel et editorial",
    rating: 4.7,
    reviewsCount: 16,
    highlights: ["Grand jardin", "Lumiere naturelle", "Tres photogenique"],
    tags: ["Nature", "Editorial", "Jardin"],
    match: "Tres bon candidat pour un mariage editorial avec beaucoup d'exterieur.",
    contactLead: "Reponse moyenne en 48h",
    sourceLabel: "Catalogue Hada"
  }
];

export function getVendorCategories(): { key: VendorCategory; label: string }[] {
  return [
    { key: "venue", label: "Lieux" },
    { key: "caterer", label: "Restauration" },
    { key: "photographer", label: "Photographe" },
    { key: "videographer", label: "Videaste" },
    { key: "dj", label: "DJ" },
    { key: "decor", label: "Decoration" },
    { key: "dress", label: "Robe" },
    { key: "suit", label: "Costume" },
    { key: "flowers", label: "Fleurs" },
    { key: "transport", label: "Transport" }
  ];
}

export function detectVendorCategory(text: string): VendorCategory | null {
  const normalized = text.toLowerCase();

  if (/(lieu|domaine|bastide|chateau|salle|manoir|reception|ceremonie)/.test(normalized)) return "venue";
  if (/(traiteur|restauration|repas|cocktail|diner|brunch)/.test(normalized)) return "caterer";
  if (/(photographe|photo)/.test(normalized)) return "photographer";
  if (/(videaste|video)/.test(normalized)) return "videographer";
  if (/(dj|musique|soir[eé]e|dancefloor)/.test(normalized)) return "dj";
  if (/(deco|decoration|scenographie)/.test(normalized)) return "decor";
  if (/(robe)/.test(normalized)) return "dress";
  if (/(costume)/.test(normalized)) return "suit";
  if (/(fleur|fleurs|flor)/.test(normalized)) return "flowers";
  if (/(transport|navette|voiture|bus)/.test(normalized)) return "transport";

  return null;
}

export function canLaunchSearch(category: VendorCategory | null, profile: Partial<WeddingProfile> | null) {
  if (!category) return false;

  if (category === "venue") {
    const hasLocation = Boolean(profile?.city || profile?.region || profile?.country);
    const hasBudget = Boolean(profile?.budget_max || profile?.budget_min);
    const hasGuests = Boolean(profile?.guest_count);
    return [hasLocation, hasBudget, hasGuests].filter(Boolean).length >= 2;
  }

  return false;
}

export function missingSearchFields(category: VendorCategory | null, profile: Partial<WeddingProfile> | null) {
  if (category !== "venue") return [];

  const missing: string[] = [];
  if (!profile?.city && !profile?.region) missing.push("la zone geographique visee");
  if (!profile?.guest_count) missing.push("le nombre d'invites");
  if (!profile?.budget_max && !profile?.budget_min) missing.push("une enveloppe budget");
  return missing;
}

export function searchVendorCatalog({
  category,
  query,
  profile
}: {
  category: VendorCategory;
  query: string;
  profile: Partial<WeddingProfile> | null;
}): VendorCatalogEntry[] {
  const normalizedQuery = query.toLowerCase();
  const normalizedLocation = `${profile?.city ?? ""} ${profile?.region ?? ""} ${profile?.country ?? ""}`.toLowerCase();
  const budget = profile?.budget_max ?? profile?.budget_min ?? null;
  const guests = profile?.guest_count ?? null;

  const catalog = category === "venue" ? venueCatalog : [];

  return catalog
    .map((entry) => {
      let score = 50;
      const searchableText = `${entry.name} ${entry.city} ${entry.region} ${entry.vibe} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase();

      if (normalizedLocation && searchableText.includes(normalizedLocation.split(" ")[0] || "")) score += 18;
      if (normalizedQuery && searchableText.includes(normalizedQuery.split(" ")[0] || "")) score += 10;

      if (budget) {
        if (entry.priceValue <= budget) score += 20;
        else if (entry.priceValue <= budget * 1.2) score += 8;
        else score -= 10;
      }

      if (guests) {
        if (entry.guestCapacity >= guests) score += 18;
        else score -= 20;
      }

      if (/(provence|aix|luberon|avignon|sorgue|sault)/.test(normalizedQuery) && searchableText.includes("provence")) score += 10;
      if (/(nature|campagne|jardin|exterieur)/.test(normalizedQuery) && /(nature|campagne|jardin|terrasse)/.test(searchableText)) score += 8;
      if (/(elegant|luxe|chic|editorial)/.test(normalizedQuery) && /(elegant|chic|editorial)/.test(searchableText)) score += 8;

      return {
        ...entry,
        score
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
}

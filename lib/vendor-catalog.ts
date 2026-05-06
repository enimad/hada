import type { VendorCategory, VendorCandidateView, WeddingProfile } from "@/lib/types";

export type VendorCatalogEntry = VendorCandidateView & {
  priceValue: number;
  guestCapacity: number;
  sourceLabel: string;
  keywords: string[];
  limitations: string[];
};

const vendorCatalog: Record<VendorCategory, VendorCatalogEntry[]> = {
  venue: [
    createEntry({
      id: "catalog-venue-domaine-des-oliviers",
      slug: "domaine-des-oliviers",
      name: "Domaine des Oliviers",
      category: "venue",
      city: "Aix-en-Provence",
      region: "Provence",
      website: "https://example.com/domaine-des-oliviers",
      email: "contact@domainedesoliviers.fr",
      phone: "+33 4 00 00 00 01",
      priceRange: "À partir de 7 500 EUR",
      priceValue: 7500,
      guestCapacity: 120,
      summary: "Mas provençal avec oliveraie, hébergement sur place et grande terrasse pour cocktail.",
      image: "/venue-olive.svg",
      capacity: "120 invités",
      vibe: "Élégant et lumineux",
      rating: 5,
      reviewsCount: 24,
      highlights: ["Hébergement sur place", "Grande terrasse", "Plan B intérieur"],
      tags: ["Provence", "Terrasse", "Hébergement"],
      match: "Très adapté à un mariage élégant avec dîner extérieur et hébergement sur place.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["provence", "terrasse", "hébergement", "élégant"],
      limitations: []
    }),
    createEntry({
      id: "catalog-venue-bastide-saint-loup",
      slug: "bastide-saint-loup",
      name: "Bastide Saint-Loup",
      category: "venue",
      city: "Luberon",
      region: "Provence",
      website: "https://example.com/bastide-saint-loup",
      email: "bonjour@bastidesaintloup.fr",
      phone: "+33 4 00 00 00 02",
      priceRange: "À partir de 9 200 EUR",
      priceValue: 9200,
      guestCapacity: 150,
      summary: "Belle cour en pierre, chambres sur place et vue dégagée pour un dîner extérieur.",
      image: "/venue-bastide.svg",
      capacity: "150 invités",
      vibe: "Bastide chic",
      rating: 4.9,
      reviewsCount: 31,
      highlights: ["Vue dégagée", "Chambres sur place", "Cour centrale en pierre"],
      tags: ["Luberon", "Vue", "Week-end"],
      match: "Très bon choix pour une ambiance éditoriale sur plusieurs jours.",
      contactLead: "Réponse moyenne en 48h",
      keywords: ["bastide", "chic", "week-end", "vue"],
      limitations: []
    }),
    createEntry({
      id: "catalog-venue-manoir-des-jardins",
      slug: "manoir-des-jardins",
      name: "Manoir des Jardins",
      category: "venue",
      city: "Avignon",
      region: "Provence",
      website: "https://example.com/manoir-des-jardins",
      email: "events@manoirdesjardins.fr",
      phone: "+33 4 00 00 00 03",
      priceRange: "À partir de 6 800 EUR",
      priceValue: 6800,
      guestCapacity: 100,
      summary: "Lieu intimiste avec jardin structuré et salons élégants pour un mariage raffiné.",
      image: "/venue-manoir.svg",
      capacity: "100 invités",
      vibe: "Romantique et intimiste",
      rating: 4.8,
      reviewsCount: 19,
      highlights: ["Jardins formalisés", "Intérieur + extérieur", "Accès facile"],
      tags: ["Avignon", "Jardins", "Romantique"],
      match: "Idéal si vous cherchez un lieu raffiné avec plan B intérieur.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["romantique", "intimiste", "jardin"],
      limitations: []
    }),
    createEntry({
      id: "catalog-venue-grange-de-javon",
      slug: "grange-de-javon",
      name: "La Grange de Javon",
      category: "venue",
      city: "Sault",
      region: "Provence",
      website: "https://example.com/grange-de-javon",
      email: "contact@grangedejavon.fr",
      phone: "+33 4 00 00 00 04",
      priceRange: "À partir de 4 500 EUR",
      priceValue: 4500,
      guestCapacity: 150,
      summary: "Domaine de caractère avec vue campagne, idéal pour une célébration conviviale en Provence.",
      image: "/venue-olive.svg",
      capacity: "150 invités",
      vibe: "Authentique et chaleureux",
      rating: 4.9,
      reviewsCount: 28,
      highlights: ["Grande capacité", "Vue campagne", "Budget accessible"],
      tags: ["Campagne", "Convivial", "Vue"],
      match: "Excellent rapport capacité / budget pour un mariage chaleureux.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["campagne", "convivial", "budget"],
      limitations: []
    }),
    createEntry({
      id: "catalog-venue-domaine-du-vallon",
      slug: "domaine-du-vallon",
      name: "Domaine du Vallon",
      category: "venue",
      city: "L'Isle-sur-la-Sorgue",
      region: "Provence",
      website: "https://example.com/domaine-du-vallon",
      email: "hello@domaineduvallon.fr",
      phone: "+33 4 00 00 00 05",
      priceRange: "À partir de 8 400 EUR",
      priceValue: 8400,
      guestCapacity: 130,
      summary: "Maison de maître lumineuse avec grand jardin et espaces cocktails très photogéniques.",
      image: "/venue-bastide.svg",
      capacity: "130 invités",
      vibe: "Naturel et éditorial",
      rating: 4.7,
      reviewsCount: 16,
      highlights: ["Grand jardin", "Lumière naturelle", "Très photogénique"],
      tags: ["Nature", "Éditorial", "Jardin"],
      match: "Très bon candidat pour un mariage éditorial avec beaucoup d'extérieur.",
      contactLead: "Réponse moyenne en 48h",
      keywords: ["nature", "éditorial", "jardin"],
      limitations: []
    })
  ],
  caterer: [
    createEntry({
      id: "catalog-caterer-maison-cerise",
      slug: "maison-cerise",
      name: "Maison Cerise",
      category: "caterer",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/maison-cerise",
      email: "bonjour@maisoncerise.fr",
      phone: "+33 1 00 00 00 10",
      priceRange: "À partir de 95 EUR / invité",
      priceValue: 7600,
      guestCapacity: 180,
      summary: "Traiteur créatif avec service complet cocktail, dîner assis et options végétariennes soignées.",
      image: null,
      capacity: "180 invités",
      vibe: "Créatif et raffiné",
      rating: 4.9,
      reviewsCount: 42,
      highlights: ["Options végétariennes", "Service complet", "Très fluide le jour J"],
      tags: ["Traiteur", "Paris", "Cocktail"],
      match: "Pertinent pour un mariage urbain avec belle exigence de service.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["traiteur", "végétarien", "cocktail", "raffiné"],
      limitations: []
    }),
    createEntry({
      id: "catalog-caterer-brut-saison",
      slug: "brut-saison",
      name: "Brut Saison",
      category: "caterer",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/brut-saison",
      email: "hello@brutsaison.fr",
      phone: "+33 1 00 00 00 11",
      priceRange: "À partir de 78 EUR / invité",
      priceValue: 6240,
      guestCapacity: 120,
      summary: "Cuisine de saison, dressages modernes et belle souplesse pour les formats cocktail + dîner.",
      image: null,
      capacity: "120 invités",
      vibe: "Moderne et chaleureux",
      rating: 4.8,
      reviewsCount: 27,
      highlights: ["Cuisine de saison", "Bonne souplesse", "Très bon rapport qualité-prix"],
      tags: ["Saison", "Moderne", "Paris"],
      match: "Très cohérent pour un couple qui veut une expérience moderne sans exploser le budget.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["moderne", "saison", "cocktail"],
      limitations: []
    }),
    createEntry({
      id: "catalog-caterer-atelier-marcel",
      slug: "atelier-marcel",
      name: "Atelier Marcel",
      category: "caterer",
      city: "Versailles",
      region: "Île-de-France",
      website: "https://example.com/atelier-marcel",
      email: "contact@ateliermarcel.fr",
      phone: "+33 1 00 00 00 12",
      priceRange: "À partir de 68 EUR / invité",
      priceValue: 5440,
      guestCapacity: 100,
      summary: "Traiteur généreux et réactif, apprécié pour ses menus français revisités et ses équipes attentives.",
      image: null,
      capacity: "100 invités",
      vibe: "Généreux et élégant",
      rating: 4.7,
      reviewsCount: 18,
      highlights: ["Réactif", "Cuisine française revisitée", "Équipe appréciée"],
      tags: ["Versailles", "Français", "Réactif"],
      match: "Bon compromis budget / qualité pour un mariage chaleureux.",
      contactLead: "Réponse moyenne en 12h",
      keywords: ["français", "généreux", "réactif"],
      limitations: []
    })
  ],
  photographer: [
    createEntry({
      id: "catalog-photographer-clara-morel",
      slug: "clara-morel-studio",
      name: "Clara Morel Studio",
      category: "photographer",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/clara-morel",
      email: "bonjour@claramorel.fr",
      phone: "+33 1 00 00 00 20",
      priceRange: "À partir de 2 600 EUR",
      priceValue: 2600,
      guestCapacity: 220,
      summary: "Photographe reportage avec rendu lumineux et vraie capacité à capter les émotions sans figer la journée.",
      image: null,
      capacity: "Jusqu'à 220 invités",
      vibe: "Reportage lumineux",
      rating: 4.9,
      reviewsCount: 35,
      highlights: ["Très naturel", "Direction douce", "Galeries rapides"],
      tags: ["Photo", "Reportage", "Paris"],
      match: "Très adapté si vous cherchez de l'émotion et peu de poses figées.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["reportage", "naturel", "lumineux"],
      limitations: []
    }),
    createEntry({
      id: "catalog-photographer-atelier-aube",
      slug: "atelier-aube",
      name: "Atelier Aube",
      category: "photographer",
      city: "Chartres",
      region: "Centre-Val de Loire",
      website: "https://example.com/atelier-aube",
      email: "hello@atelieraube.fr",
      phone: "+33 2 00 00 00 21",
      priceRange: "À partir de 2 100 EUR",
      priceValue: 2100,
      guestCapacity: 180,
      summary: "Style éditorial doux, très à l'aise dans les lieux de réception champêtres et les journées en extérieur.",
      image: null,
      capacity: "Jusqu'à 180 invités",
      vibe: "Éditorial doux",
      rating: 4.8,
      reviewsCount: 22,
      highlights: ["Très bon en extérieur", "Style éditorial", "Accompagnement rassurant"],
      tags: ["Éditorial", "Campagne", "Extérieur"],
      match: "Excellent si vous voulez une esthétique douce, élégante et un peu mode.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["éditorial", "campagne", "extérieur"],
      limitations: []
    })
  ],
  videographer: [
    createEntry({
      id: "catalog-video-studio-nacre",
      slug: "studio-nacre-films",
      name: "Studio Nacre Films",
      category: "videographer",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/studio-nacre",
      email: "contact@studionacre.fr",
      phone: "+33 1 00 00 00 30",
      priceRange: "À partir de 2 900 EUR",
      priceValue: 2900,
      guestCapacity: 220,
      summary: "Films élégants, modernes et vivants, avec un montage très fluide et peu intrusif.",
      image: null,
      capacity: "Jusqu'à 220 invités",
      vibe: "Cinématographique et moderne",
      rating: 4.8,
      reviewsCount: 17,
      highlights: ["Très discret", "Montage fluide", "Beaux teasers"],
      tags: ["Vidéo", "Cinématographique", "Paris"],
      match: "Très bon fit pour une vidéo chic sans effet trop démonstratif.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["vidéo", "cinématographique", "moderne"],
      limitations: []
    })
  ],
  musician: [],
  dj: [
    createEntry({
      id: "catalog-dj-nova-sound",
      slug: "nova-sound",
      name: "Nova Sound",
      category: "dj",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/nova-sound",
      email: "booking@novasound.fr",
      phone: "+33 1 00 00 00 40",
      priceRange: "À partir de 1 800 EUR",
      priceValue: 1800,
      guestCapacity: 250,
      summary: "DJ premium très apprécié pour ses transitions propres, sa lecture de salle et ses sets élégants.",
      image: null,
      capacity: "Jusqu'à 250 invités",
      vibe: "Énergique et élégant",
      rating: 4.9,
      reviewsCount: 29,
      highlights: ["Très bonne lecture de salle", "Transitions propres", "Matériel soigné"],
      tags: ["DJ", "Paris", "Soirée"],
      match: "Très cohérent si vous voulez une soirée fluide sans ambiance trop kitsch.",
      contactLead: "Réponse moyenne en 12h",
      keywords: ["dj", "soirée", "dancefloor", "élégant"],
      limitations: []
    })
  ],
  decor: [
    createEntry({
      id: "catalog-decor-maison-velours",
      slug: "maison-velours",
      name: "Maison Velours",
      category: "decor",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/maison-velours",
      email: "hello@maisonvelours.fr",
      phone: "+33 1 00 00 00 50",
      priceRange: "À partir de 2 400 EUR",
      priceValue: 2400,
      guestCapacity: 200,
      summary: "Scénographie élégante, palette subtile et vraie cohérence globale entre cérémonie, dîner et signalétique.",
      image: null,
      capacity: "Jusqu'à 200 invités",
      vibe: "Editorial et raffiné",
      rating: 4.8,
      reviewsCount: 21,
      highlights: ["Très cohérent visuellement", "Palette subtile", "Bon accompagnement"],
      tags: ["Décoration", "Éditorial", "Scénographie"],
      match: "Très bon choix pour une direction artistique maîtrisée.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["décoration", "scénographie", "éditorial"],
      limitations: []
    })
  ],
  dress: [
    createEntry({
      id: "catalog-dress-atelier-soline",
      slug: "atelier-soline",
      name: "Atelier Soline",
      category: "dress",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/atelier-soline",
      email: "bonjour@ateliersoline.fr",
      phone: "+33 1 00 00 00 60",
      priceRange: "À partir de 2 900 EUR",
      priceValue: 2900,
      guestCapacity: 1,
      summary: "Maison de robes au style épuré, très appréciée pour ses coupes fluides et ses essayages sereins.",
      image: null,
      capacity: "Sur rendez-vous",
      vibe: "Épuré et couture",
      rating: 4.7,
      reviewsCount: 26,
      highlights: ["Coupes fluides", "Essayages sereins", "Retouches soignées"],
      tags: ["Robe", "Couture", "Paris"],
      match: "Très cohérent pour une mariée qui veut une silhouette élégante et sans surcharge.",
      contactLead: "Réponse moyenne en 48h",
      keywords: ["robe", "couture", "épuré"],
      limitations: []
    })
  ],
  suit: [
    createEntry({
      id: "catalog-suit-cercle-gabin",
      slug: "cercle-gabin",
      name: "Cercle Gabin",
      category: "suit",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/cercle-gabin",
      email: "contact@cerclegabin.fr",
      phone: "+33 1 00 00 00 70",
      priceRange: "À partir de 950 EUR",
      priceValue: 950,
      guestCapacity: 1,
      summary: "Costumes demi-mesure au tombé très propre, bon accompagnement et délais maîtrisés.",
      image: null,
      capacity: "Sur rendez-vous",
      vibe: "Chic et sobre",
      rating: 4.8,
      reviewsCount: 14,
      highlights: ["Demi-mesure", "Délais clairs", "Très bon tombé"],
      tags: ["Costume", "Paris", "Demi-mesure"],
      match: "Bonne adresse si vous voulez du chic sans complication inutile.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["costume", "demi-mesure", "chic"],
      limitations: []
    })
  ],
  flowers: [
    createEntry({
      id: "catalog-flowers-atelier-sauge",
      slug: "atelier-sauge",
      name: "Atelier Sauge",
      category: "flowers",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/atelier-sauge",
      email: "hello@ateliersauge.fr",
      phone: "+33 1 00 00 00 80",
      priceRange: "À partir de 1 500 EUR",
      priceValue: 1500,
      guestCapacity: 220,
      summary: "Fleuriste au style poétique et texturé, très à l'aise pour créer un décor floral naturel sans effet figé.",
      image: null,
      capacity: "Jusqu'à 220 invités",
      vibe: "Poétique et naturel",
      rating: 4.9,
      reviewsCount: 20,
      highlights: ["Très belles textures", "Naturel sans négligé", "Bon accompagnement"],
      tags: ["Fleurs", "Poétique", "Naturel"],
      match: "Très adapté si vous cherchez un rendu floral vivant et élégant.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["fleurs", "floral", "naturel", "poétique"],
      limitations: []
    })
  ],
  transport: [
    createEntry({
      id: "catalog-transport-etoile-route",
      slug: "etoile-route",
      name: "Étoile Route",
      category: "transport",
      city: "Paris",
      region: "Île-de-France",
      website: "https://example.com/etoile-route",
      email: "booking@etoileroute.fr",
      phone: "+33 1 00 00 00 90",
      priceRange: "À partir de 650 EUR",
      priceValue: 650,
      guestCapacity: 120,
      summary: "Navettes et voitures avec chauffeurs, très utile pour les mariages en plusieurs lieux ou tardifs.",
      image: null,
      capacity: "Jusqu'à 120 invités",
      vibe: "Fiable et discret",
      rating: 4.6,
      reviewsCount: 12,
      highlights: ["Bonne ponctualité", "Solutions navettes", "Souple sur les horaires"],
      tags: ["Transport", "Navettes", "Île-de-France"],
      match: "Pratique si vous devez fluidifier les trajets invités.",
      contactLead: "Réponse moyenne en 24h",
      keywords: ["transport", "navette", "voiture"],
      limitations: []
    })
  ]
};

export function getVendorCategories(): { key: VendorCategory; label: string }[] {
  return [
    { key: "venue", label: "Lieux" },
    { key: "caterer", label: "Restauration" },
    { key: "photographer", label: "Photographes" },
    { key: "videographer", label: "Vidéastes" },
    { key: "musician", label: "Musiciens" },
    { key: "dj", label: "DJ" },
    { key: "decor", label: "Décoration" },
    { key: "dress", label: "Robes" },
    { key: "suit", label: "Costumes" },
    { key: "flowers", label: "Fleuristes" },
    { key: "transport", label: "Transport" }
  ];
}

export function detectVendorCategory(text: string): VendorCategory | null {
  const normalized = normalize(text);
  const keywordMap: Array<{ category: VendorCategory; keywords: string[] }> = [
    { category: "venue", keywords: ["lieu", "domaine", "bastide", "chateau", "salle", "manoir", "reception", "ceremonie"] },
    { category: "caterer", keywords: ["traiteur", "restauration", "repas", "cocktail", "diner", "brunch"] },
    { category: "photographer", keywords: ["photographe", "photo"] },
    { category: "videographer", keywords: ["videaste", "video"] },
    { category: "musician", keywords: ["groupe", "musicien", "jazz", "acoustique", "chanteur", "live", "orchestre"] },
    { category: "dj", keywords: ["dj", "soiree", "dancefloor", "platines", "mix"] },
    { category: "decor", keywords: ["deco", "decoration", "scenographie"] },
    { category: "dress", keywords: ["robe"] },
    { category: "suit", keywords: ["costume"] },
    { category: "flowers", keywords: ["fleur", "fleurs", "floral", "fleuriste"] },
    { category: "transport", keywords: ["transport", "navette", "voiture", "bus", "chauffeur"] }
  ];

  let bestMatch: { category: VendorCategory; index: number } | null = null;

  for (const entry of keywordMap) {
    for (const keyword of entry.keywords) {
      const index = normalized.lastIndexOf(keyword);
      if (index === -1) continue;

      if (!bestMatch || index > bestMatch.index) {
        bestMatch = {
          category: entry.category,
          index
        };
      }
    }
  }

  return bestMatch?.category ?? null;
}

export function canLaunchSearch(category: VendorCategory | null, profile: Partial<WeddingProfile> | null) {
  if (!category) return false;

  const hasLocation = Boolean(profile?.city || profile?.region || profile?.country);
  const hasGuests = Boolean(profile?.guest_count);
  const hasBudget = Boolean(profile?.budget_max || profile?.budget_min);

  if (category === "venue") {
    return [hasLocation, hasGuests, hasBudget].filter(Boolean).length >= 2;
  }

  return hasLocation && hasGuests;
}

export function missingSearchFields(category: VendorCategory | null, profile: Partial<WeddingProfile> | null) {
  if (!category) return ["le type de prestataire recherché"];

  const missing: string[] = [];
  if (!profile?.city && !profile?.region) missing.push("la zone géographique visée");
  if (!profile?.guest_count) missing.push("le nombre d'invités");
  if (category === "venue" && !profile?.budget_max && !profile?.budget_min) missing.push("une enveloppe budget");
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
  const normalizedQuery = normalize(query);
  const normalizedLocation = normalize(`${profile?.city ?? ""} ${profile?.region ?? ""} ${profile?.country ?? ""}`);
  const budget = profile?.budget_max ?? profile?.budget_min ?? null;
  const guests = profile?.guest_count ?? null;
  const entries = vendorCatalog[category] ?? [];

  return entries
    .map((entry) => {
      let score = 50;
      const searchableText = normalize(
        `${entry.name} ${entry.city} ${entry.region} ${entry.vibe} ${entry.summary} ${entry.tags.join(" ")} ${entry.keywords.join(" ")}`
      );

      if (normalizedLocation && containsAnyToken(searchableText, normalizedLocation)) score += 16;
      if (normalizedQuery && containsAnyToken(searchableText, normalizedQuery)) score += 18;

      if (budget) {
        if (entry.priceValue <= budget) score += 18;
        else if (entry.priceValue <= budget * 1.2) score += 8;
        else score -= 12;
      }

      if (guests) {
        if (entry.guestCapacity >= guests) score += 18;
        else score -= 25;
      }

      if (entry.rating && entry.rating >= 4.8) score += 8;
      if (entry.rating && entry.rating < 4.5) score -= 30;
      if (entry.limitations.length > 0) score -= 5;

      return {
        ...entry,
        score
      };
    })
    .filter((entry) => (entry.rating ?? 0) >= 4.5)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
}

function createEntry(input: Omit<VendorCatalogEntry, "score" | "sourceUrl" | "sourceLabel"> & { sourceUrl?: string }) {
  return {
    ...input,
    score: null,
    sourceUrl: input.sourceUrl ?? input.website ?? "https://example.com",
    sourceLabel: "Catalogue Hada"
  } satisfies VendorCatalogEntry;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function containsAnyToken(haystack: string, needleText: string) {
  return needleText
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .some((token) => haystack.includes(token));
}

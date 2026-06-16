import type { WeddingChecklistItem, WeddingChecklistPatch } from "@/lib/types";

type ChecklistTemplate = Omit<WeddingChecklistItem, "done">;

const CHECKLIST_TEMPLATE: ChecklistTemplate[] = [
  {
    id: "vision-budget",
    phase: "Fondations",
    title: "Définir la vision et l'enveloppe",
    description: "Ambiance, priorités, budget global et premières limites à ne pas dépasser.",
    dueOffsetMonths: 15
  },
  {
    id: "guest-list",
    phase: "Fondations",
    title: "Stabiliser la liste d'invités",
    description: "Une estimation fiable pour guider le lieu, le traiteur et la logistique.",
    dueOffsetMonths: 14
  },
  {
    id: "venue",
    phase: "Prestataires clés",
    title: "Trouver le lieu",
    description: "Bloquer la date, la capacité, les contraintes horaires et les espaces.",
    dueOffsetMonths: 12
  },
  {
    id: "caterer",
    phase: "Prestataires clés",
    title: "Choisir le traiteur",
    description: "Cocktail, dîner, brunch, dégustation et options alimentaires importantes.",
    dueOffsetMonths: 10
  },
  {
    id: "photo-video",
    phase: "Prestataires clés",
    title: "Réserver photo et vidéo",
    description: "Sécuriser les souvenirs avant que les meilleurs créneaux ne disparaissent.",
    dueOffsetMonths: 9
  },
  {
    id: "music",
    phase: "Ambiance",
    title: "Préparer la musique",
    description: "DJ, groupe, cérémonie, playlists sensibles et moments à rythmer.",
    dueOffsetMonths: 7
  },
  {
    id: "decor-flowers",
    phase: "Ambiance",
    title: "Caler décoration et fleurs",
    description: "Palette, scénographie, bouquet, centres de table et installation.",
    dueOffsetMonths: 6
  },
  {
    id: "outfits",
    phase: "Style",
    title: "Finaliser les tenues",
    description: "Robe, costume, accessoires, essayages et retouches.",
    dueOffsetMonths: 5
  },
  {
    id: "invitations",
    phase: "Invités",
    title: "Envoyer faire-part et RSVP",
    description: "Invitations, site ou formulaire, relances et réponses centralisées.",
    dueOffsetMonths: 4
  },
  {
    id: "guest-logistics",
    phase: "Invités",
    title: "Organiser transport et hébergements",
    description: "Navettes, hôtels, accès, horaires et informations pratiques.",
    dueOffsetMonths: 3
  },
  {
    id: "day-timeline",
    phase: "Derniers réglages",
    title: "Construire le déroulé du jour J",
    description: "Planning, contacts clés, météo, paiements restants et plan B.",
    dueOffsetMonths: 1
  },
  {
    id: "after-wedding",
    phase: "Après mariage",
    title: "Prévoir l'après mariage",
    description: "Remerciements, avis prestataires, photos, administratif et souvenirs.",
    dueOffsetMonths: -1
  }
];

export const WEDDING_CHECKLIST_DEFAULTS: WeddingChecklistItem[] = CHECKLIST_TEMPLATE.map((item) => ({
  ...item,
  done: false
}));

export function normalizeWeddingChecklist(value: unknown): WeddingChecklistItem[] {
  const existingItems = Array.isArray(value) ? value : [];
  const doneById = new Map<string, boolean>();

  for (const item of existingItems) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    doneById.set(record.id, record.done === true);
  }

  return WEDDING_CHECKLIST_DEFAULTS.map((item) => ({
    ...item,
    done: doneById.get(item.id) ?? item.done
  }));
}

export function applyWeddingChecklistPatch(value: unknown, patch: WeddingChecklistPatch | null | undefined) {
  const checklist = normalizeWeddingChecklist(value);
  if (!patch) return checklist;

  const completed = new Set(patch.completed_item_ids ?? []);
  const reopened = new Set(patch.reopened_item_ids ?? []);

  return checklist.map((item) => {
    if (completed.has(item.id)) return { ...item, done: true };
    if (reopened.has(item.id)) return { ...item, done: false };
    return item;
  });
}

export function getWeddingChecklistLabels() {
  return WEDDING_CHECKLIST_DEFAULTS.map((item) => `${item.id}: ${item.title}`).join("\n");
}

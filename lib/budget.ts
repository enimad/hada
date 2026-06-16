import type { VendorCategory, WeddingProfile } from "@/lib/types";

export type WeddingBudgetItem = {
  id: string;
  label: string;
  shortLabel: string;
  percentage: number;
  group: "Essentiels" | "Image & ambiance" | "Invités" | "Pilotage";
  vendorCategories?: VendorCategory[];
};

export type WeddingBudgetOverrides = Record<string, number>;

export type ComputedWeddingBudgetItem = WeddingBudgetItem & {
  defaultAmount: number | null;
  defaultAmountLabel: string;
  amount: number | null;
  amountLabel: string;
  actualPercentage: number | null;
  actualPercentageLabel: string;
  isCustomized: boolean;
};

export type WeddingBudgetPlan = {
  referenceTotal: number | null;
  referenceTotalLabel: string;
  total: number | null;
  totalLabel: string;
  percentageTotal: number;
  percentageTotalLabel: string;
  allocatedTotal: number | null;
  allocatedTotalLabel: string;
  variance: number | null;
  varianceLabel: string;
  items: ComputedWeddingBudgetItem[];
};

export const WEDDING_BUDGET_ITEMS: WeddingBudgetItem[] = [
  {
    id: "venue",
    label: "Lieu de réception",
    shortLabel: "Lieu",
    percentage: 15,
    group: "Essentiels",
    vendorCategories: ["venue"]
  },
  {
    id: "caterer",
    label: "Traiteur (cocktail, repas, boissons, service)",
    shortLabel: "Traiteur",
    percentage: 35,
    group: "Essentiels",
    vendorCategories: ["caterer"]
  },
  {
    id: "photographer",
    label: "Photographe",
    shortLabel: "Photo",
    percentage: 8,
    group: "Image & ambiance",
    vendorCategories: ["photographer"]
  },
  {
    id: "videographer",
    label: "Vidéaste",
    shortLabel: "Vidéo",
    percentage: 5,
    group: "Image & ambiance",
    vendorCategories: ["videographer"]
  },
  {
    id: "music",
    label: "DJ / animation musicale",
    shortLabel: "Musique",
    percentage: 5,
    group: "Image & ambiance",
    vendorCategories: ["dj", "musician"]
  },
  {
    id: "decor",
    label: "Décoration & scénographie",
    shortLabel: "Déco",
    percentage: 7,
    group: "Image & ambiance",
    vendorCategories: ["decor"]
  },
  {
    id: "flowers",
    label: "Fleuriste",
    shortLabel: "Fleurs",
    percentage: 5,
    group: "Image & ambiance",
    vendorCategories: ["flowers"]
  },
  {
    id: "attire",
    label: "Robe de mariée, costume et accessoires",
    shortLabel: "Tenues",
    percentage: 5,
    group: "Invités",
    vendorCategories: ["dress", "suit"]
  },
  {
    id: "beauty",
    label: "Mise en beauté (coiffure, maquillage)",
    shortLabel: "Beauté",
    percentage: 1,
    group: "Invités"
  },
  {
    id: "paper",
    label: "Papeterie (faire-part, menus, plan de table)",
    shortLabel: "Papeterie",
    percentage: 2,
    group: "Invités"
  },
  {
    id: "ceremony",
    label: "Cérémonie (laïque ou religieuse)",
    shortLabel: "Cérémonie",
    percentage: 1,
    group: "Essentiels"
  },
  {
    id: "lodging",
    label: "Hébergement invités / mariés",
    shortLabel: "Hébergement",
    percentage: 2,
    group: "Invités"
  },
  {
    id: "planner",
    label: "Wedding planner / coordination Jour J",
    shortLabel: "Coordination",
    percentage: 4,
    group: "Pilotage"
  },
  {
    id: "cake",
    label: "Pièce montée, wedding cake, desserts spécifiques",
    shortLabel: "Desserts",
    percentage: 1,
    group: "Essentiels"
  },
  {
    id: "gifts",
    label: "Cadeaux invités & petites attentions",
    shortLabel: "Cadeaux",
    percentage: 1,
    group: "Invités"
  },
  {
    id: "contingency",
    label: "Imprévus et réserve de sécurité",
    shortLabel: "Imprévus",
    percentage: 3,
    group: "Pilotage"
  }
];

const budgetItemIds = new Set(WEDDING_BUDGET_ITEMS.map((item) => item.id));

export function getWeddingBudgetTotal(profile: Partial<WeddingProfile> | null | undefined) {
  const total = profile?.budget_max ?? profile?.budget_min ?? null;
  return typeof total === "number" && Number.isFinite(total) && total > 0 ? total : null;
}

export function buildWeddingBudgetPlan(profile: Partial<WeddingProfile> | null | undefined): WeddingBudgetPlan {
  const referenceTotal = getWeddingBudgetTotal(profile);
  const overrides = normalizeWeddingBudgetOverrides((profile as { wedding_budget_overrides?: unknown } | null | undefined)?.wedding_budget_overrides);
  const items = WEDDING_BUDGET_ITEMS.map((item) => {
    const defaultAmount = referenceTotal === null ? null : Math.round((referenceTotal * item.percentage) / 100);
    const customAmount = overrides[item.id];
    const amount = customAmount ?? defaultAmount;
    const actualPercentage = referenceTotal === null || amount === null ? null : (amount / referenceTotal) * 100;

    return {
      ...item,
      defaultAmount,
      defaultAmountLabel: formatBudgetAmount(defaultAmount),
      amount,
      amountLabel: formatBudgetAmount(amount),
      actualPercentage,
      actualPercentageLabel: formatBudgetPercentage(actualPercentage),
      isCustomized: customAmount !== undefined
    };
  });
  const hasAnyAmount = items.some((item) => item.amount !== null);
  const allocatedTotal = hasAnyAmount ? items.reduce((sum, item) => sum + (item.amount ?? 0), 0) : null;
  const percentageTotal = referenceTotal === null || allocatedTotal === null ? 0 : (allocatedTotal / referenceTotal) * 100;
  const variance = referenceTotal === null || allocatedTotal === null ? null : referenceTotal - allocatedTotal;

  return {
    referenceTotal,
    referenceTotalLabel: formatBudgetAmount(referenceTotal),
    total: allocatedTotal,
    totalLabel: formatBudgetAmount(allocatedTotal),
    percentageTotal,
    percentageTotalLabel: formatBudgetPercentage(percentageTotal),
    allocatedTotal,
    allocatedTotalLabel: formatBudgetAmount(allocatedTotal),
    variance,
    varianceLabel: variance === null ? "À confirmer" : formatBudgetAmount(Math.abs(variance)),
    items
  };
}

export function getBudgetItemForVendorCategory(category: VendorCategory | null | undefined) {
  if (!category) return null;
  return WEDDING_BUDGET_ITEMS.find((item) => item.vendorCategories?.includes(category)) ?? null;
}

export function getBudgetAllocationForVendorCategory(profile: Partial<WeddingProfile> | null | undefined, category: VendorCategory | null | undefined) {
  const budgetItem = getBudgetItemForVendorCategory(category);
  if (!budgetItem) return null;

  const plan = buildWeddingBudgetPlan(profile);
  const computedItem = plan.items.find((item) => item.id === budgetItem.id);
  if (!computedItem || computedItem.amount === null) return null;

  return {
    item: computedItem,
    amount: computedItem.amount,
    amountLabel: computedItem.amountLabel,
    hint: `${budgetItem.label} : ${computedItem.amountLabel} (${computedItem.actualPercentageLabel} du budget de référence)`
  };
}

export function normalizeWeddingBudgetOverrides(value: unknown): WeddingBudgetOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<WeddingBudgetOverrides>((overrides, [id, rawAmount]) => {
    if (!budgetItemIds.has(id)) return overrides;

    const amount = normalizeBudgetAmount(rawAmount);
    if (amount !== null) overrides[id] = amount;
    return overrides;
  }, {});
}

export function formatBudgetAmount(amount: number | null | undefined) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return "À confirmer";

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatBudgetPercentage(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "À confirmer";

  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1
  }).format(value)}%`;
}

function normalizeBudgetAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { buildWeddingBudgetPlan, formatBudgetAmount, formatBudgetPercentage, normalizeWeddingBudgetOverrides, type WeddingBudgetOverrides } from "@/lib/budget";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WeddingProfile } from "@/lib/types";

const groupOrder = ["Essentiels", "Image & ambiance", "Invités", "Pilotage"] as const;

export default function BudgetPageClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<WeddingProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const [customizedItemIds, setCustomizedItemIds] = useState<string[]>([]);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadProfile() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/404");
        return;
      }

      setAccessToken(session.access_token);

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as { profile: WeddingProfile | null };
        setProfile(result.profile);
      }

      setIsLoading(false);
    }

    void loadProfile();
  }, [router]);

  useEffect(() => {
    const initialPlan = buildWeddingBudgetPlan(profile);
    const savedOverrides = normalizeWeddingBudgetOverrides(profile?.wedding_budget_overrides);
    setBudgetDraft(
      Object.fromEntries(initialPlan.items.map((item) => [item.id, item.amount === null ? "" : String(item.amount)]))
    );
    setCustomizedItemIds(Object.keys(savedOverrides));
  }, [profile]);

  const draftOverrides = useMemo(() => buildBudgetOverridesFromDraft(budgetDraft, customizedItemIds), [budgetDraft, customizedItemIds]);
  const draftProfile = useMemo(
    () => (profile ? { ...profile, wedding_budget_overrides: draftOverrides } : profile),
    [draftOverrides, profile]
  );
  const plan = useMemo(() => buildWeddingBudgetPlan(draftProfile), [draftProfile]);
  const isAlignedWithReferenceBudget = Math.abs(plan.percentageTotal - 100) < 0.05;
  const groupedItems = useMemo(
    () =>
      groupOrder.map((group) => ({
        group,
        items: plan.items.filter((item) => item.group === group),
        total: plan.items.filter((item) => item.group === group).reduce((sum, item) => sum + (item.actualPercentage ?? 0), 0)
      })),
    [plan.items]
  );
  const connectedItems = plan.items.filter((item) => item.vendorCategories?.length);
  const topItems = [...plan.items].sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0)).slice(0, 4);

  function updateBudgetItem(itemId: string, value: string) {
    setFeedback("");
    setBudgetDraft((current) => ({ ...current, [itemId]: value.replace(/[^\d]/g, "") }));
    setCustomizedItemIds((current) => (current.includes(itemId) ? current : [...current, itemId]));
  }

  function resetBudgetItem(itemId: string, defaultAmount: number | null) {
    setFeedback("");
    setBudgetDraft((current) => ({ ...current, [itemId]: defaultAmount === null ? "" : String(defaultAmount) }));
    setCustomizedItemIds((current) => current.filter((id) => id !== itemId));
  }

  async function saveBudgetOverrides() {
    if (!accessToken) return;

    setIsSavingBudget(true);
    setFeedback("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          wedding_budget_overrides: draftOverrides
        })
      });

      const result = (await response.json()) as { profile?: WeddingProfile | null; error?: string };
      if (!response.ok) {
        setFeedback(result.error ?? "Impossible d'enregistrer les montants pour le moment.");
        return;
      }

      setProfile(result.profile ?? null);
      setFeedback("Budget mis à jour. Hada utilisera ces montants pour les recherches et les emails.");
    } finally {
      setIsSavingBudget(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell active="budget" mobileTitle="Budget">
        <div className="rounded-[32px] bg-white p-6 shadow-[0_10px_30px_rgba(46,28,54,0.06)]">
          <div className="h-5 w-28 rounded-full bg-[#f1e3de] hada-shimmer" />
          <div className="mt-5 h-16 rounded-[24px] bg-[#fff3ef] hada-shimmer" />
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 rounded-[24px] bg-[#fff7f4] hada-shimmer" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="budget" mobileTitle="Budget">
      <section className="overflow-hidden rounded-[34px] border border-[#f1e3de] bg-white shadow-[0_16px_42px_rgba(46,28,54,0.07)]">
        <div className="relative bg-[linear-gradient(135deg,#fffaf7_0%,#fff1ed_54%,#ffe1e5_100%)] px-5 py-6 sm:px-8 sm:py-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[rgba(255,173,51,0.18)] blur-2xl" />
          <div className="absolute bottom-0 right-20 h-36 w-36 rounded-full bg-[rgba(251,105,116,0.16)] blur-2xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--hada-coral)]">Budget</p>
              <h1 className="mt-3 text-[36px] font-bold leading-[0.95] tracking-[-0.065em] text-[var(--hada-navy)] sm:text-[52px]">
                Piloter chaque dépense sans perdre la magie
              </h1>
              <p className="mt-4 max-w-[720px] text-[17px] leading-8 text-[#6d6475] sm:text-[19px]">
                Hada part du budget renseigné dans Mon mariage, puis vous pouvez ajuster chaque poste indépendamment. Les recherches et emails utilisent les montants affichés ici.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_14px_34px_rgba(46,28,54,0.09)] backdrop-blur">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#b68d89]">Budget total actuel</p>
              <p className="mt-2 text-[38px] font-bold tracking-[-0.06em] text-[var(--hada-navy)]">{plan.totalLabel}</p>
              <p className="mt-1 text-[13px] font-semibold text-[#8a6f73]">Base Mon mariage : {plan.referenceTotalLabel}</p>
              <Link href="/monmariage" className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[14px] font-semibold text-white">
                Modifier dans Mon mariage →
              </Link>
            </div>
          </div>
        </div>

        {plan.total ? (
          <>
            <div className="grid gap-4 px-5 py-5 sm:px-8 md:grid-cols-3">
              <MetricCard label="Budget vs base" value={plan.percentageTotalLabel} detail={`${plan.allocatedTotalLabel} ventilés`} />
              <MetricCard label="Poste principal" value={topItems[0]?.shortLabel ?? "À définir"} detail={`${topItems[0]?.actualPercentageLabel ?? ""} · ${topItems[0]?.amountLabel ?? ""}`} />
              <MetricCard
                label={plan.variance && plan.variance < 0 ? "À arbitrer" : "Marge restante"}
                value={plan.variance === null ? "À confirmer" : plan.variance < 0 ? `-${plan.varianceLabel}` : plan.varianceLabel}
                detail={isAlignedWithReferenceBudget ? "Répartition alignée sur la base" : "Les montants personnalisés changent le budget total"}
              />
            </div>

            <div className="grid gap-5 px-5 pb-7 sm:px-8 lg:grid-cols-[1.45fr_0.9fr]">
              <div className="rounded-[30px] border border-[#f0e1dc] bg-[#fffaf7] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Répartition</p>
                    <h2 className="mt-2 text-[28px] font-bold tracking-[-0.05em] text-[var(--hada-navy)]">Postes de dépense</h2>
                  </div>
                  <p className="rounded-full border border-[#f0d9d2] bg-white px-4 py-2 text-[13px] font-semibold text-[#8a6f73]">
                    Base : {formatBudgetAmount(plan.referenceTotal)}
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-[#f1e2dc] bg-white/75 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--hada-navy)]">Montants personnalisables</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#7c7180]">Modifier un poste ne recalcule aucun autre poste.</p>
                  </div>
                  <button
                    type="button"
                    onClick={saveBudgetOverrides}
                    disabled={isSavingBudget}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[14px] font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingBudget ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
                {feedback ? <p className="mt-3 text-[13px] font-semibold text-[var(--hada-coral)]">{feedback}</p> : null}

                <div className="mt-5 space-y-6">
                  {groupedItems.map((group) => (
                    <section key={group.group}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-[18px] font-bold tracking-[-0.035em] text-[var(--hada-navy)]">{group.group}</h3>
                        <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#b18484]">{formatBudgetPercentage(group.total)}</span>
                      </div>
                      <div className="space-y-2.5">
                        {group.items.map((item) => (
                          <BudgetItemRow
                            key={item.id}
                            item={item}
                            value={budgetDraft[item.id] ?? ""}
                            disabled={isSavingBudget}
                            onChange={updateBudgetItem}
                            onReset={resetBudgetItem}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="rounded-[30px] border border-[#f0e1dc] bg-white p-5 shadow-[0_10px_28px_rgba(46,28,54,0.05)]">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Connecté à Hada</p>
                  <h2 className="mt-2 text-[25px] font-bold tracking-[-0.05em] text-[var(--hada-navy)]">Budgets utilisés en recherche</h2>
                  <p className="mt-3 text-[15px] leading-6 text-[#6d6475]">
                    Quand vous demandez une recherche, Hada applique l&apos;enveloppe du poste correspondant comme budget de référence.
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {connectedItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-[18px] bg-[#fff7f4] px-4 py-3">
                        <div>
                          <p className="text-[14px] font-semibold text-[var(--hada-navy)]">{item.shortLabel}</p>
                          <p className="text-[12px] font-medium text-[#9a7779]">{item.actualPercentageLabel} de la base</p>
                        </div>
                        <p className="text-[15px] font-bold text-[var(--hada-coral)]">{item.amountLabel}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[30px] border border-[#f4d8d1] bg-[linear-gradient(160deg,#2b214f_0%,#49365f_100%)] p-5 text-white shadow-[0_18px_36px_rgba(43,33,79,0.18)]">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#ffd9dc]">Priorités</p>
                  <div className="mt-4 space-y-4">
                    {topItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold">{item.shortLabel}</p>
                          <p className="text-[12px] text-white/70">{item.label}</p>
                        </div>
                        <p className="rounded-full bg-white/12 px-3 py-1 text-[13px] font-semibold">{item.amountLabel}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <div className="px-5 py-8 sm:px-8">
            <div className="rounded-[30px] border border-[#f0e1dc] bg-[#fffaf7] p-6 text-center">
              <p className="text-[48px] leading-none">€</p>
              <h2 className="mt-3 text-[28px] font-bold tracking-[-0.05em] text-[var(--hada-navy)]">Budget à confirmer</h2>
              <p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-7 text-[#6d6475]">
                Ajoutez votre budget total dans Mon mariage et Hada remplira automatiquement toutes les enveloppes de dépense.
              </p>
              <Link href="/monmariage" className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-6 text-[15px] font-semibold text-white">
                Renseigner mon budget →
              </Link>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-[#f0e1dc] bg-white p-5 shadow-[0_8px_24px_rgba(46,28,54,0.05)]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#b68d89]">{label}</p>
      <p className="mt-2 text-[30px] font-bold tracking-[-0.055em] text-[var(--hada-navy)]">{value}</p>
      <p className="mt-1 text-[14px] leading-5 text-[#7c7180]">{detail}</p>
    </div>
  );
}

function BudgetItemRow({
  item,
  value,
  disabled,
  onChange,
  onReset
}: {
  item: ReturnType<typeof buildWeddingBudgetPlan>["items"][number];
  value: string;
  disabled: boolean;
  onChange: (itemId: string, value: string) => void;
  onReset: (itemId: string, defaultAmount: number | null) => void;
}) {
  const width = Math.min(100, item.actualPercentage ?? item.percentage);

  return (
    <div className="rounded-[20px] border border-[#f0e1dc] bg-white px-4 py-3 shadow-[0_4px_14px_rgba(46,28,54,0.04)]">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px] sm:items-start">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-5 text-[var(--hada-navy)]">{item.label}</p>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#c08d8b]">
            {item.isCustomized ? "Montant personnalisé" : `${item.percentage}% conseillé`}
          </p>
        </div>
        <div>
          <label className="sr-only" htmlFor={`budget-${item.id}`}>
            Montant {item.label}
          </label>
          <div className="flex items-center rounded-[16px] border border-[#eadfda] bg-[#fffaf7] px-3 py-2 focus-within:border-[var(--hada-coral)]">
            <input
              id={`budget-${item.id}`}
              inputMode="numeric"
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(item.id, event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-right text-[17px] font-bold tracking-[-0.03em] text-[var(--hada-navy)] outline-none disabled:cursor-wait"
            />
            <span className="ml-2 text-[14px] font-semibold text-[#b18484]">€</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-[#9a7779]">{item.actualPercentageLabel} de la base</p>
            {item.isCustomized ? (
              <button
                type="button"
                onClick={() => onReset(item.id, item.defaultAmount)}
                disabled={disabled}
                className="text-[12px] font-semibold text-[var(--hada-coral)] disabled:cursor-wait disabled:opacity-60"
              >
                Réinitialiser
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#f3e6e0]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--hada-coral),var(--hada-gold))]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function buildBudgetOverridesFromDraft(draft: Record<string, string>, customizedItemIds: string[]): WeddingBudgetOverrides {
  return customizedItemIds.reduce<WeddingBudgetOverrides>((overrides, itemId) => {
    const amount = readDraftAmount(draft[itemId]);
    if (amount !== null) overrides[itemId] = amount;
    return overrides;
  }, {});
}

function readDraftAmount(value: string | undefined) {
  if (!value) return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

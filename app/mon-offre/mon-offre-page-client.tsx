"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BillingMode = "monthly" | "one_time";
type PlanId = "essential" | "serenity";

type OfferPlan = {
  id: PlanId;
  name: string;
  monthlyPrice: string;
  oneTimePrice: string;
  monthlySubline: string;
  oneTimeSubline: string;
  features: Array<{ prefix?: string; highlight?: string; suffix: string }>;
};

const plans: OfferPlan[] = [
  {
    id: "essential",
    name: "Essentiel",
    monthlyPrice: "19 €",
    oneTimePrice: "190 €",
    monthlySubline: "Résiliable à tout moment",
    oneTimeSubline: "Jusqu'au jour J — Soit 2 mois offerts sur un an d'abonnement mensuel",
    features: [
      { suffix: "Tout le plan gratuit" },
      { highlight: "15 recherches", suffix: " / semaine" },
      { highlight: "5 prises de contact", suffix: " / semaine" }
    ]
  },
  {
    id: "serenity",
    name: "Sérénité",
    monthlyPrice: "39 €",
    oneTimePrice: "390 €",
    monthlySubline: "Résiliable à tout moment",
    oneTimeSubline: "Jusqu'au jour J — Soit 2 mois offerts sur un an d'abonnement mensuel",
    features: [
      { suffix: "Tout le plan gratuit" },
      { highlight: "35 recherches", suffix: " / semaine" },
      { prefix: "Prises de contact ", highlight: "illimitées", suffix: "" }
    ]
  }
];

const includedFeatures = ["Dashboard & checklist", "Gestion du budget", "Chat IA illimité avec Hada", "Suivi des prestataires"];

export default function MonOffrePageClient() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<BillingMode>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [confirmedPlan, setConfirmedPlan] = useState<PlanId | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/404");
        return;
      }

      setAccessToken(session.access_token);
    }

    void loadSession();
  }, [router]);

  const selectedPlanData = selectedPlan ? plans.find((plan) => plan.id === selectedPlan) ?? null : null;
  const confirmedPlanData = confirmedPlan ? plans.find((plan) => plan.id === confirmedPlan) ?? null : null;
  const isOneTime = billingMode === "one_time";

  function chooseBillingMode(nextMode: BillingMode) {
    setBillingMode(nextMode);
    setConfirmedPlan(null);
    setErrorMessage("");
  }

  function choosePlan(planId: PlanId) {
    setSelectedPlan(planId);
    setConfirmedPlan(null);
    setErrorMessage("");
  }

  async function confirmChoice() {
    if (!selectedPlan || !accessToken || isSaving) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/offer-preference", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          selected_plan: selectedPlan,
          billing_mode: billingMode
        })
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "Impossible d'enregistrer votre choix pour le moment.");
        return;
      }

      setConfirmedPlan(selectedPlan);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell active="offer" mobileTitle="Mon offre">
      <section className="mx-auto w-full max-w-5xl">
        <BetaAlert />

        <div className="mt-8 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--hada-coral)]">Offres bêta</p>
          <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-[-0.055em] text-[var(--hada-navy)] sm:text-[46px]">
            Hada s&apos;adapte à vos besoins
          </h1>
        </div>

        <CurrentPlanCard />

        <div className="mt-6 flex items-center justify-center gap-3 text-[15px] font-semibold">
          <button
            type="button"
            onClick={() => chooseBillingMode("monthly")}
            className={isOneTime ? "text-[var(--hada-text-soft)]" : "text-[var(--hada-coral)]"}
          >
            Mensuel
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={isOneTime}
            onClick={() => chooseBillingMode(isOneTime ? "monthly" : "one_time")}
            className={`relative h-8 w-14 rounded-full border transition ${
              isOneTime ? "border-[var(--hada-coral)] bg-[var(--hada-coral)]" : "border-[#f0d9d2] bg-[#fff0f1]"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_4px_12px_rgba(46,28,54,0.12)] transition ${
                isOneTime ? "left-7" : "left-1"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => chooseBillingMode("one_time")}
            className={isOneTime ? "text-[var(--hada-coral)]" : "text-[var(--hada-text-soft)]"}
          >
            En une fois
          </button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billingMode={billingMode}
              selected={selectedPlan === plan.id}
              onSelect={() => choosePlan(plan.id)}
            />
          ))}
        </div>

        <div className="mt-6">
          {confirmedPlanData ? (
            <div className="rounded-[24px] border border-[var(--hada-coral-soft)] bg-[#fff0f1] px-5 py-5 text-center text-[17px] font-semibold leading-7 text-[var(--hada-coral)] shadow-[0_10px_28px_rgba(251,105,116,0.08)]">
              Merci ! Vous avez choisi le plan {confirmedPlanData.name}. Hada en prend note pour vous préparer la meilleure expérience possible.
            </div>
          ) : (
            <button
              type="button"
              onClick={confirmChoice}
              disabled={!selectedPlanData || !accessToken || isSaving}
              className={`flex h-14 w-full items-center justify-center rounded-full px-6 text-[16px] font-bold transition ${
                selectedPlanData
                  ? "bg-[var(--hada-coral)] text-white shadow-[0_14px_32px_rgba(251,105,116,0.22)] hover:bg-[var(--hada-navy)] hover:text-white"
                  : "cursor-not-allowed bg-[var(--hada-coral-soft)] text-[#8d8387]"
              }`}
            >
              {isSaving
                ? "Enregistrement..."
                : selectedPlanData
                  ? `Confirmer mon choix — ${selectedPlanData.name}`
                  : "Choisir un plan pour continuer"}
            </button>
          )}
          {errorMessage ? <p className="mt-3 text-center text-[14px] font-semibold text-[var(--hada-coral)]">{errorMessage}</p> : null}
        </div>
      </section>
    </AppShell>
  );
}

function BetaAlert() {
  return (
    <div className="rounded-[24px] bg-[linear-gradient(135deg,var(--hada-navy)_0%,#49365f_70%,#fb6974_145%)] px-5 py-5 text-white shadow-[0_16px_34px_rgba(43,33,79,0.18)] sm:px-8">
      <div className="flex gap-4">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white/80 text-[16px] font-bold">
          !
        </span>
        <div>
          <p className="text-[17px] font-bold tracking-[-0.02em]">Mode bêta — aucun paiement ne sera effectué</p>
          <p className="mt-1 max-w-[760px] text-[15px] font-medium leading-7 text-white/92">
            Ces offres ne sont pas encore actives. Votre choix aide Hada à préparer la meilleure expérience pour votre grand jour.
          </p>
        </div>
      </div>
    </div>
  );
}

function CurrentPlanCard() {
  return (
    <div className="mt-7 rounded-[26px] border border-[#f0e1dc] bg-[#fffaf7] px-5 py-5 shadow-[0_10px_30px_rgba(46,28,54,0.04)] sm:px-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[#fff0f1] px-4 py-1 text-[13px] font-bold text-[var(--hada-coral)]">Votre plan actuel</span>
        <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">Gratuit — déjà inclus</p>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-3 border-b border-[#f1e3de] pb-4 sm:grid-cols-2">
        {includedFeatures.map((feature, index) => (
          <div key={feature} className="flex items-center gap-3 text-[15px] font-semibold text-[#5f576d]">
            <FeatureIcon index={index} />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#8a6f73]">
        <span>Limites incluses :</span>
        <LimitPill label="3 recherches / semaine" />
        <LimitPill label="1 prise de contact / semaine" />
      </div>
    </div>
  );
}

function FeatureIcon({ index }: { index: number }) {
  const icons = ["M5 5h4v4H5zM15 5h4v4h-4zM5 15h4v4H5zM15 15h4v4h-4z", "M5 8h14v10H5zM8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M5 6h14v10H8l-3 3z", "M6 7h12M6 12h12M6 17h12"];

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[var(--hada-coral)]">
      <path d={icons[index] ?? icons[0]} />
    </svg>
  );
}

function LimitPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hada-coral-soft)] bg-[#fff0f1] px-3 py-1 text-[var(--hada-coral)]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M7 10V8a5 5 0 0 1 10 0v2" />
        <rect x="5" y="10" width="14" height="10" rx="2" />
      </svg>
      {label}
    </span>
  );
}

function PlanCard({
  plan,
  billingMode,
  selected,
  onSelect
}: {
  plan: OfferPlan;
  billingMode: BillingMode;
  selected: boolean;
  onSelect: () => void;
}) {
  const isOneTime = billingMode === "one_time";
  const price = isOneTime ? plan.oneTimePrice : plan.monthlyPrice;
  const subline = isOneTime ? plan.oneTimeSubline : plan.monthlySubline;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex min-h-[300px] flex-col rounded-[28px] border bg-white px-6 py-6 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(46,28,54,0.08)] ${
        selected ? "border-2 border-[var(--hada-coral)] shadow-[0_18px_40px_rgba(251,105,116,0.14)]" : "border-[#f0e1dc]"
      }`}
      aria-pressed={selected}
    >
      <span
        className={`absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 text-[16px] font-bold shadow-[0_8px_20px_rgba(46,28,54,0.06)] transition ${
          selected
            ? "border-[var(--hada-coral)] bg-[var(--hada-coral)] text-white"
            : "border-[var(--hada-coral-soft)] bg-[#fff7f4] text-transparent group-hover:border-[var(--hada-coral)]"
        }`}
      >
        ✓
        <span className="sr-only">{selected ? "Offre sélectionnée" : "Sélectionner cette offre"}</span>
      </span>

      <div className="pr-12">
        <h2 className="text-[26px] font-bold tracking-[-0.05em] text-[var(--hada-navy)]">{plan.name}</h2>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-[40px] font-bold leading-none tracking-[-0.055em] text-[var(--hada-navy)]">{price}</span>
        <span className="pb-1 text-[15px] font-semibold text-[var(--hada-text-soft)]">{isOneTime ? "en une fois" : "/ mois"}</span>
      </div>
      <p className="mt-2 text-[14px] font-semibold text-[#9a7779]">
        {isOneTime ? (
          <>
            Jusqu&apos;au jour J — <span className="font-bold text-[var(--hada-coral)]">Soit 2 mois offerts sur un an d&apos;abonnement mensuel</span>
          </>
        ) : (
          subline
        )}
      </p>

      <div className="mt-7 h-px bg-[#f1e3de]" />

      <div className="mt-5 space-y-3">
        {plan.features.map((feature) => (
          <div key={`${feature.prefix ?? ""}${feature.highlight ?? ""}${feature.suffix}`} className="flex items-start gap-3 text-[16px] font-semibold text-[var(--hada-navy)]">
            <span className="mt-0.5 text-[var(--hada-coral)]">✓</span>
            <span>
              {feature.prefix}
              {feature.highlight ? <span className="rounded-md bg-[#fff0f1] px-1.5 py-0.5 font-bold text-[var(--hada-coral)]">{feature.highlight}</span> : null}
              {feature.suffix}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

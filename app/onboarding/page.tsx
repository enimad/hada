"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WeddingProfile } from "@/lib/types";
import {
  BackButton,
  CalendarIcon,
  HadaPortrait,
  HeartIcon,
  MainButton,
  MapPinIcon,
  MobileScreen,
  PlusIcon,
  ProgressDots,
  UsersIcon,
  WalletIcon
} from "@/components/mobile-screen";

const initialState = {
  partnerOneName: "",
  partnerTwoName: "",
  weddingDate: "",
  weddingPeriodText: "",
  guestCount: "",
  budgetMax: "",
  placeDraft: "",
  placeIdeas: [] as string[]
};

export default function OnboardingPage() {
  const router = useRouter();
  const datePickerRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState(initialState);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState(-1);
  const [noDateYet, setNoDateYet] = useState(false);
  const [noPlaceYet, setNoPlaceYet] = useState(false);
  const [noGuestListYet, setNoGuestListYet] = useState(false);
  const [noBudgetYet, setNoBudgetYet] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

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
        if (result.profile) {
          setForm({
            partnerOneName: result.profile.partner_one_name ?? "",
            partnerTwoName: result.profile.partner_two_name ?? "",
            weddingDate: result.profile.wedding_date ?? "",
            weddingPeriodText: result.profile.wedding_period_text ?? "",
            guestCount: result.profile.guest_count?.toString() ?? "",
            budgetMax: result.profile.budget_max?.toString() ?? "",
            placeDraft: "",
            placeIdeas: result.profile.city ? result.profile.city.split(",").map((item) => item.trim()).filter(Boolean) : []
          });
          setNoDateYet(Boolean(result.profile.wedding_period_text));
          setNoPlaceYet(!result.profile.city && !result.profile.region);
          setNoGuestListYet(!result.profile.guest_count);
          setNoBudgetYet(!result.profile.budget_max);
        }
      }

      setIsLoading(false);
    }

    void loadProfile();
  }, [router]);

  useEffect(() => {
    const query = form.placeDraft.trim();
    if (query.length < 2 || noPlaceYet) {
      setCitySuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,departement&boost=population&limit=8`,
          { signal: controller.signal }
        );

        if (!response.ok) return;
        const result = (await response.json()) as Array<{ nom: string; departement?: { nom?: string } }>;
        const suggestions = result
          .map((item) => (item.departement?.nom ? `${item.nom} (${item.departement.nom})` : item.nom))
          .filter(Boolean);
        setCitySuggestions(Array.from(new Set(suggestions)));
      } catch {}
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [form.placeDraft, noPlaceYet]);

  const formattedDate = form.weddingDate ? formatDateFr(form.weddingDate) : "";
  const canSubmitPlaces = form.placeIdeas.length > 0 || form.placeDraft.trim().length > 0 || noPlaceYet;

  function addPlaceIdea() {
    const nextPlace = form.placeDraft.trim();
    if (!nextPlace) return;

    setNoPlaceYet(false);
    setForm((current) => ({
      ...current,
      placeIdeas: current.placeIdeas.includes(nextPlace) ? current.placeIdeas : [...current.placeIdeas, nextPlace],
      placeDraft: ""
    }));
    setCitySuggestions([]);
  }

  function removePlaceIdea(placeIdea: string) {
    setForm((current) => ({
      ...current,
      placeIdeas: current.placeIdeas.filter((idea) => idea !== placeIdea)
    }));
  }

  const content = useMemo(() => {
    if (step === -1) {
      return (
        <div className="flex flex-1 flex-col justify-between pt-8">
          <div className="pt-16 text-center sm:pt-20">
            <HadaPortrait variant="rays" className="max-w-[220px] sm:max-w-[250px]" />
            <p className="mx-auto mt-12 max-w-[340px] text-[24px] font-medium leading-[1.35] tracking-[-0.045em] text-[var(--hada-navy)] sm:text-[30px]">
              Je vais avoir besoin que tu répondes à quelques questions avant de commencer l&apos;organisation.
            </p>
          </div>
          <div className="pb-8">
            <MainButton onClick={() => setStep(0)}>Suivant</MainButton>
          </div>
        </div>
      );
    }

    if (step === 0) {
      return (
        <>
          <HeaderProgress current={1} total={5} onBack={() => setStep(-1)} />
          <h1 className="mt-10 text-center text-[40px] font-bold leading-[1.02] tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">
            Votre histoire
            <br />
            commence ici...
          </h1>
          <div className="mt-12 space-y-10">
            <FieldShell label="Nom marié(e) 1" icon={<HeartIcon className="h-7 w-7" />}>
              <input
                value={form.partnerOneName}
                onChange={(event) => setForm((current) => ({ ...current, partnerOneName: event.target.value }))}
                placeholder="Lila"
                className="w-full bg-transparent text-[20px] text-[var(--hada-navy)] outline-none placeholder:text-[#8f8884] sm:text-[22px]"
              />
            </FieldShell>
            <FieldShell label="Nom marié(e) 2" icon={<HeartIcon className="h-7 w-7" />}>
              <input
                value={form.partnerTwoName}
                onChange={(event) => setForm((current) => ({ ...current, partnerTwoName: event.target.value }))}
                placeholder="Marc"
                className="w-full bg-transparent text-[20px] text-[var(--hada-navy)] outline-none placeholder:text-[#8f8884] sm:text-[22px]"
              />
            </FieldShell>
          </div>
          <div className="mt-auto pt-16">
            <MainButton disabled={!form.partnerOneName.trim() || !form.partnerTwoName.trim()} onClick={() => setStep(1)}>
              Suivant
            </MainButton>
          </div>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <HeaderProgress current={2} total={5} onBack={() => setStep(0)} />
          <h1 className="mt-12 text-center text-[40px] font-bold leading-[1.02] tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">
            Vous avez une date ?
          </h1>
          <div className="mt-16">
            <FieldShell
              label="Votre date"
              icon={
                <button
                  type="button"
                  onClick={() => {
                    datePickerRef.current?.showPicker?.();
                    datePickerRef.current?.focus();
                  }}
                  className="text-[#99908c]"
                >
                  <CalendarIcon className="h-7 w-7" />
                </button>
              }
            >
              <button
                type="button"
                onClick={() => {
                  datePickerRef.current?.showPicker?.();
                  datePickerRef.current?.focus();
                }}
                className="w-full text-left text-[20px] text-[var(--hada-navy)] outline-none sm:text-[22px]"
              >
                {formattedDate || "JJ/MM/AAAA"}
              </button>
              <input
                ref={datePickerRef}
                type="date"
                value={form.weddingDate}
                onChange={(event) => {
                  setNoDateYet(false);
                  setForm((current) => ({
                    ...current,
                    weddingDate: event.target.value,
                    weddingPeriodText: ""
                  }));
                }}
                className="sr-only"
              />
            </FieldShell>
          </div>
          <ToggleRow
            className="mt-10"
            checked={noDateYet}
            label="Pas encore de date fixe"
            onToggle={() => {
              const nextChecked = !noDateYet;
              setNoDateYet(nextChecked);
              setForm((current) => ({
                ...current,
                weddingDate: nextChecked ? "" : current.weddingDate,
                weddingPeriodText: nextChecked ? "Pas encore de date fixe" : ""
              }));
            }}
          />
          <div className="mt-auto pt-16">
            <MainButton disabled={!form.weddingDate && !noDateYet} onClick={() => setStep(2)}>
              Suivant
            </MainButton>
          </div>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <HeaderProgress current={3} total={5} onBack={() => setStep(1)} />
          <h1 className="mt-12 text-center text-[40px] font-bold leading-[1.02] tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[54px]">
            Une idée du lieu ?
          </h1>
          <p className="mx-auto mt-2 max-w-[320px] text-center text-[18px] font-medium leading-[1.3] tracking-[-0.04em] text-[var(--hada-navy)] sm:text-[22px]">
            Ajoute autant de lieux que tu as en tête.
          </p>
          <div className="mt-14">
            <FieldShell
              label="Vos idées de lieu"
              icon={<MapPinIcon className="h-7 w-7" />}
              rightSlot={
                <button
                  type="button"
                  onClick={addPlaceIdea}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hada-coral)] text-[var(--hada-coral)]"
                >
                  <PlusIcon className="h-6 w-6" />
                </button>
              }
            >
              <input
                value={form.placeDraft}
                onChange={(event) => {
                  setNoPlaceYet(false);
                  setForm((current) => ({ ...current, placeDraft: event.target.value }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPlaceIdea();
                  }
                }}
                list="hada-city-suggestions"
                placeholder="Paris, Toulouse, Bordeaux..."
                className="w-full bg-transparent text-[20px] text-[var(--hada-navy)] outline-none placeholder:text-[#8f8884] sm:text-[22px]"
              />
              <datalist id="hada-city-suggestions">
                {citySuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </FieldShell>
          </div>
          {form.placeIdeas.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-3">
              {form.placeIdeas.map((idea) => (
                <span
                  key={idea}
                  className="inline-flex items-center gap-2 rounded-full bg-[#fff0f1] py-2 pl-4 pr-2 text-[14px] font-medium text-[var(--hada-coral)]"
                >
                  <span>{idea}</span>
                  <button
                    type="button"
                    onClick={() => removePlaceIdea(idea)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-[16px] leading-none text-[var(--hada-coral)] shadow-[0_6px_14px_rgba(255,96,116,0.12)] transition hover:bg-white"
                    aria-label={`Supprimer ${idea}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <ToggleRow
            className="mt-10"
            checked={noPlaceYet}
            label="Pas encore de lieu en tête"
            onToggle={() => {
              const nextChecked = !noPlaceYet;
              setNoPlaceYet(nextChecked);
              if (nextChecked) {
                setForm((current) => ({ ...current, placeDraft: "", placeIdeas: [] }));
                setCitySuggestions([]);
              }
            }}
          />
          <div className="mt-auto pt-16">
            <MainButton
              disabled={!canSubmitPlaces}
              onClick={() => {
                if (form.placeDraft.trim()) {
                  addPlaceIdea();
                }
                setStep(3);
              }}
            >
              Suivant
            </MainButton>
          </div>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <HeaderProgress current={4} total={5} onBack={() => setStep(2)} />
          <h1 className="mt-12 text-center text-[40px] font-bold leading-[1.02] tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">
            Combien
            <br />
            vous serez ?
          </h1>
          <div className="mt-16">
            <FieldShell label="Environ..." icon={<UsersIcon className="h-7 w-7" />}>
              <input
                value={form.guestCount}
                onChange={(event) => {
                  setNoGuestListYet(false);
                  setForm((current) => ({ ...current, guestCount: event.target.value.replace(/[^\d]/g, "") }));
                }}
                placeholder="100"
                inputMode="numeric"
                className="w-full bg-transparent text-[20px] text-[var(--hada-navy)] outline-none placeholder:text-[#8f8884] sm:text-[22px]"
              />
            </FieldShell>
          </div>
          <ToggleRow
            className="mt-10"
            checked={noGuestListYet}
            label="Pas encore de liste précise"
            onToggle={() => {
              const nextChecked = !noGuestListYet;
              setNoGuestListYet(nextChecked);
              if (nextChecked) {
                setForm((current) => ({ ...current, guestCount: "" }));
              }
            }}
          />
          <div className="mt-auto pt-16">
            <MainButton disabled={!form.guestCount && !noGuestListYet} onClick={() => setStep(4)}>
              Suivant
            </MainButton>
          </div>
        </>
      );
    }

    return (
      <>
        <HeaderProgress current={5} total={5} onBack={() => setStep(3)} />
        <h1 className="mt-12 text-center text-[40px] font-bold leading-[1.02] tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">
          Un budget ?
        </h1>
        <div className="mt-16">
          <FieldShell label="Environ..." icon={<WalletIcon className="h-7 w-7" />}>
            <input
              value={form.budgetMax}
              onChange={(event) => {
                setNoBudgetYet(false);
                setForm((current) => ({ ...current, budgetMax: formatBudgetInput(event.target.value) }));
              }}
              placeholder="10 000 EUR"
              inputMode="numeric"
              className="w-full bg-transparent text-[20px] text-[var(--hada-navy)] outline-none placeholder:text-[#8f8884] sm:text-[22px]"
            />
          </FieldShell>
        </div>
        <ToggleRow
          className="mt-10"
          checked={noBudgetYet}
          label="Pas encore de budget défini"
          onToggle={() => {
            const nextChecked = !noBudgetYet;
            setNoBudgetYet(nextChecked);
            if (nextChecked) {
              setForm((current) => ({ ...current, budgetMax: "" }));
            }
          }}
        />
        <div className="mt-auto pt-16">
          <MainButton
            disabled={(!form.budgetMax && !noBudgetYet) || isPending}
            onClick={() => {
              const persistedPlaceIdeas = form.placeDraft.trim()
                ? Array.from(new Set([...form.placeIdeas, form.placeDraft.trim()]))
                : form.placeIdeas;

              if (!accessToken) {
                router.replace("/chat");
                return;
              }

              startTransition(async () => {
                setMessage("");

                const response = await fetch("/api/profile", {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`
                  },
                  body: JSON.stringify({
                    partner_one_name: form.partnerOneName,
                    partner_two_name: form.partnerTwoName,
                    wedding_date: noDateYet ? null : form.weddingDate || null,
                    wedding_period_text: noDateYet ? "Pas encore de date fixe" : null,
                    city: noPlaceYet ? null : persistedPlaceIdeas.join(", ") || null,
                    region: null,
                    country: "France",
                    guest_count: noGuestListYet ? null : form.guestCount ? Number(form.guestCount) : null,
                    budget_min: null,
                    budget_max: noBudgetYet ? null : parseBudget(form.budgetMax),
                    style: null,
                    ceremony_type: null,
                    notes: null
                  })
                });

                const result = await response.json();
                if (!response.ok) {
                  setMessage(result.error ?? "Erreur inattendue.");
                  return;
                }

                router.replace("/chat");
              });
            }}
          >
            Je veux mon analyse !
          </MainButton>
        </div>
      </>
    );
  }, [
    accessToken,
    canSubmitPlaces,
    citySuggestions,
    form,
    formattedDate,
    isPending,
    noBudgetYet,
    noDateYet,
    noGuestListYet,
    noPlaceYet,
    router,
    step
  ]);

  if (isLoading) {
    return (
      <MobileScreen>
        <div />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen className="flex-1 pb-10 pt-6">
      {content}
      {isPreviewMode ? <p className="mt-4 text-center text-[14px] text-[#8d8387]">Mode preview sans session Supabase.</p> : null}
      {message ? <p className="mt-3 text-center text-[14px] text-[#8d8387]">{message}</p> : null}
    </MobileScreen>
  );
}

function HeaderProgress({
  current,
  total,
  onBack
}: {
  current: number;
  total: number;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <BackButton onClick={onBack} />
      <ProgressDots current={current} total={total} />
      <span className="w-12" />
    </div>
  );
}

function FieldShell({
  label,
  icon,
  children,
  rightSlot
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-4 block text-[18px] font-medium tracking-[-0.03em] text-[var(--hada-navy)] sm:text-[20px]">{label}</span>
      <div className="flex items-center gap-3 border-b-2 border-[var(--hada-line-strong)] pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[#99908c]">{icon}</span>
        <div className="min-w-0 flex-1">{children}</div>
        {rightSlot}
      </div>
    </label>
  );
}

function ToggleRow({
  checked,
  label,
  onToggle,
  className = ""
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <label className={`flex items-center gap-4 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d0c7c2] bg-transparent"
      >
        {checked ? <span className="h-3 w-3 rounded-full bg-[var(--hada-coral)]" /> : null}
      </button>
      <span className="text-[16px] font-semibold tracking-[-0.03em] text-[#8a817d] sm:text-[18px]">{label}</span>
    </label>
  );
}

function formatBudgetInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";

  return `${Number(digits).toLocaleString("fr-FR")} EUR`;
}

function parseBudget(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function formatDateFr(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

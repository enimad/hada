"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SURVEY_DONE_KEY = "hada:survey:completed";
const SURVEY_PENDING_KEY = "hada:survey:pending";
const SURVEY_PENDING_EVENT = "hada:survey:pending-created";

type PendingSurvey = {
  sourcePath: string;
  sourceVendorSlug: string;
};

type SurveyExitGuardProps = {
  sourceVendorSlug: string;
};

type SurveyAnswers = {
  rating: number | null;
  appreciated: string;
  frustrated: string;
  reuseIntent: string;
  tooExpensivePrice: string;
  expensiveButAcceptablePrice: string;
  goodDealPrice: string;
  tooCheapPrice: string;
  dreamFeature: string;
};

type ProfileResponse = {
  profile?: {
    partner_one_name?: string | null;
    partner_two_name?: string | null;
  } | null;
};

export function SurveyExitGuard({ sourceVendorSlug }: SurveyExitGuardProps) {
  const pathname = usePathname();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (sessionStorage.getItem(SURVEY_DONE_KEY)) return;

      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const nextUrl = new URL(link.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (nextUrl.pathname === pathname) return;

      rememberPendingSurvey({ sourcePath: pathname, sourceVendorSlug });
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      rememberPendingSurvey({ sourcePath: pathname, sourceVendorSlug });
    };
  }, [pathname, sourceVendorSlug]);

  return null;
}

export function SurveyModalHost() {
  const pathname = usePathname();
  const [pendingSurvey, setPendingSurvey] = useState<PendingSurvey | null>(null);
  const [coupleNames, setCoupleNames] = useState("vous");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({
    rating: null,
    appreciated: "",
    frustrated: "",
    reuseIntent: "",
    tooExpensivePrice: "",
    expensiveButAcceptablePrice: "",
    goodDealPrice: "",
    tooCheapPrice: "",
    dreamFeature: ""
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestionIsValid = useMemo(() => {
    if (step === 1) return answers.rating !== null;
    if (step === 2) return answers.appreciated.trim().length > 0;
    if (step === 3) return answers.frustrated.trim().length > 0;
    if (step === 4) return answers.reuseIntent.trim().length > 0;
    if (step === 5) return answers.dreamFeature.trim().length > 0;
    if (step === 6) return answers.tooExpensivePrice.trim().length > 0;
    if (step === 7) return answers.expensiveButAcceptablePrice.trim().length > 0;
    if (step === 8) return answers.goodDealPrice.trim().length > 0;
    if (step === 9) return answers.tooCheapPrice.trim().length > 0;
    return true;
  }, [answers, step]);

  useEffect(() => {
    function openPendingSurvey() {
      const currentPathname = typeof window === "undefined" ? pathname : window.location.pathname;
      const nextPendingSurvey = readPendingSurvey(currentPathname);
      if (nextPendingSurvey) setPendingSurvey(nextPendingSurvey);
    }

    openPendingSurvey();
    window.addEventListener(SURVEY_PENDING_EVENT, openPendingSurvey);
    return () => window.removeEventListener(SURVEY_PENDING_EVENT, openPendingSurvey);
  }, [pathname]);

  useEffect(() => {
    if (!pendingSurvey) return;

    async function loadCoupleNames() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) return;

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) return;

      const result = (await response.json()) as ProfileResponse;
      const names = [result.profile?.partner_one_name, result.profile?.partner_two_name].filter(Boolean).join(" & ");
      if (names) setCoupleNames(names);
    }

    void loadCoupleNames();
  }, [pendingSurvey]);

  useEffect(() => {
    if (!pendingSurvey) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingSurvey]);

  if (!pendingSurvey) return null;

  function closeThanks() {
    setPendingSurvey(null);
    setStep(0);
  }

  function handleNext() {
    setError("");
    if (!currentQuestionIsValid) {
      setError("Une petite réponse ici, et on continue.");
      return;
    }
    setStep((current) => Math.min(current + 1, 10));
  }

  async function submitSurvey() {
    setError("");
    if (!currentQuestionIsValid) {
      setError("Une petite rÃ©ponse ici, et on continue.");
      return;
    }

    setIsSubmitting(true);
    const currentSurvey = pendingSurvey;
    if (!currentSurvey) {
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Session expirée. Reconnectez-vous pour envoyer votre retour.");
        return;
      }

      const response = await fetch("/api/survey", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          sourcePath: currentSurvey.sourcePath,
          sourceVendorSlug: currentSurvey.sourceVendorSlug,
          rating: answers.rating,
          appreciated: answers.appreciated,
          frustrated: answers.frustrated,
          reuseIntent: answers.reuseIntent,
          tooExpensivePrice: answers.tooExpensivePrice,
          expensiveButAcceptablePrice: answers.expensiveButAcceptablePrice,
          goodDealPrice: answers.goodDealPrice,
          tooCheapPrice: answers.tooCheapPrice,
          dreamFeature: answers.dreamFeature
        })
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? "Impossible d'envoyer le survey pour le moment.");
        return;
      }

      sessionStorage.setItem(SURVEY_DONE_KEY, "1");
      sessionStorage.removeItem(SURVEY_PENDING_KEY);
      setStep(11);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(43,33,79,0.28)] px-4 py-5 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[560px] overflow-hidden rounded-[34px] border border-white/70 bg-[#fffaf7] shadow-[0_30px_80px_rgba(43,33,79,0.25)]"
      >
        <div className="relative p-6 sm:p-8">
          {step === 11 ? (
            <button
              type="button"
              onClick={closeThanks}
              className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[20px] text-[#8f8792]"
              aria-label="Fermer le message de remerciement"
            >
              ×
            </button>
          ) : null}

          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[#f4e7e2]">
            <div className="h-full rounded-full bg-[var(--hada-coral)] transition-all" style={{ width: `${((step + 1) / 12) * 100}%` }} />
          </div>

          {step === 0 ? <IntroStep /> : null}
          {step === 1 ? <RatingStep value={answers.rating} onChange={(rating) => setAnswers((current) => ({ ...current, rating }))} /> : null}
          {step === 2 ? (
            <TextStep
              label="Qu’avez-vous particulièrement apprécié dans votre expérience avec Hada ?"
              value={answers.appreciated}
              onChange={(appreciated) => setAnswers((current) => ({ ...current, appreciated }))}
            />
          ) : null}
          {step === 3 ? (
            <TextStep
              label="Qu’est-ce qui vous a frustré ou semblé compliqué ?"
              value={answers.frustrated}
              onChange={(frustrated) => setAnswers((current) => ({ ...current, frustrated }))}
            />
          ) : null}
          {step === 4 ? (
            <TextStep
              label="Pensez-vous réutiliser Hada pour organiser votre mariage ? Pourquoi ?"
              value={answers.reuseIntent}
              onChange={(reuseIntent) => setAnswers((current) => ({ ...current, reuseIntent }))}
            />
          ) : null}
          {step === 5 ? <DreamFeatureStep value={answers.dreamFeature} onChange={(dreamFeature) => setAnswers((current) => ({ ...current, dreamFeature }))} /> : null}
          {step === 6 ? (
            <TextStep
              label="À partir de quel prix est-ce trop cher ?"
              value={answers.tooExpensivePrice}
              onChange={(tooExpensivePrice) => setAnswers((current) => ({ ...current, tooExpensivePrice }))}
            />
          ) : null}
          {step === 7 ? (
            <TextStep
              label="À partir de quel prix est-ce cher, mais encore acceptable ?"
              value={answers.expensiveButAcceptablePrice}
              onChange={(expensiveButAcceptablePrice) => setAnswers((current) => ({ ...current, expensiveButAcceptablePrice }))}
            />
          ) : null}
          {step === 8 ? (
            <TextStep
              label="En dessous de quel prix est-ce une bonne affaire ?"
              value={answers.goodDealPrice}
              onChange={(goodDealPrice) => setAnswers((current) => ({ ...current, goodDealPrice }))}
            />
          ) : null}
          {step === 9 ? (
            <TextStep
              label="En dessous de quel prix est-ce trop bon marché ?"
              value={answers.tooCheapPrice}
              onChange={(tooCheapPrice) => setAnswers((current) => ({ ...current, tooCheapPrice }))}
            />
          ) : null}
          {step === 11 ? <ThanksStep coupleNames={coupleNames} /> : null}

          {error ? <p className="mt-4 rounded-2xl bg-[#fff0f1] px-4 py-3 text-[14px] font-medium text-[var(--hada-coral)]">{error}</p> : null}

          {step < 11 ? (
            <div className="mt-7 flex justify-end">
              {step < 9 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-12 w-full rounded-full bg-[var(--hada-coral)] px-7 py-3 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(255,96,116,0.25)] sm:w-auto"
                >
                  Continuer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={step === 9 ? submitSurvey : handleNext}
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-full bg-[var(--hada-coral)] px-7 py-3 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(255,96,116,0.25)] disabled:opacity-60 sm:w-auto"
                >
                  {step === 9 ? (isSubmitting ? "Envoi..." : "Envoyer mon retour") : "Continuer"}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function rememberPendingSurvey(pendingSurvey: PendingSurvey) {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(SURVEY_DONE_KEY)) return;

  sessionStorage.setItem(SURVEY_PENDING_KEY, JSON.stringify(pendingSurvey));
  window.dispatchEvent(new Event(SURVEY_PENDING_EVENT));
}

function readPendingSurvey(currentPathname: string) {
  if (typeof window === "undefined") return null;
  if (sessionStorage.getItem(SURVEY_DONE_KEY)) return null;

  const rawPendingSurvey = sessionStorage.getItem(SURVEY_PENDING_KEY);
  if (!rawPendingSurvey) return null;

  try {
    const parsed = JSON.parse(rawPendingSurvey) as PendingSurvey;
    if (parsed.sourcePath && parsed.sourcePath !== currentPathname) return parsed;
  } catch {
    sessionStorage.removeItem(SURVEY_PENDING_KEY);
  }

  return null;
}

function IntroStep() {
  return (
    <div>
      <p className="text-[15px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Votre avis</p>
      <h2 className="mt-4 text-[30px] font-bold leading-tight tracking-[-0.04em] text-[var(--hada-navy)]">Hada, c'est vous autant que nous 🫶</h2>
      <p className="mt-5 text-[18px] leading-8 text-[#61596f]">
        On a quelques questions rapides (1 minute max, promis) pour s'assurer qu'on est sur la bonne voie. Votre retour compte vraiment.
      </p>
    </div>
  );
}

function RatingStep({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <div>
      <QuestionLabel required>Sur une échelle de 0 à 10, quelle est la probabilité que vous recommandiez Hada à un(e) proche qui prépare son mariage ?</QuestionLabel>
      <div className="mt-6 grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onChange(index)}
            className={`flex h-10 items-center justify-center rounded-full text-[14px] font-semibold transition ${
              value === index ? "bg-[var(--hada-navy)] text-white" : "bg-white text-[var(--hada-navy)] ring-1 ring-[#e5d9d3]"
            }`}
          >
            {index}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[13px] font-medium text-[#7b7284]">
        <span>Pas du tout probable</span>
        <span>Extrêmement probable</span>
      </div>
    </div>
  );
}

function TextStep({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <QuestionLabel required>{label}</QuestionLabel>
      <SurveyTextarea value={value} onChange={onChange} rows={5} placeholder="Votre réponse" />
    </div>
  );
}

function DreamFeatureStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-[17px] leading-8 text-[#61596f]">
        On travaille en ce moment sur des choses qu'on a hâte de vous montrer : automatiser la prise de contact avec vos prestataires, un guide étape par étape encore plus poussé... et quelques surprises qu'on garde sous le coude pour l'instant. 👀
      </p>
      <QuestionLabel required>Et vous, c'est quoi la feature dont vous rêvez ?</QuestionLabel>
      <SurveyTextarea value={value} onChange={onChange} rows={4} placeholder="Votre réponse" />
    </div>
  );
}

function ThanksStep({ coupleNames }: { coupleNames: string }) {
  return (
    <div className="pr-8">
      <h2 className="text-[28px] font-bold tracking-[-0.04em] text-[var(--hada-navy)]">Merci {coupleNames}, vraiment.</h2>
      <p className="mt-4 text-[17px] leading-8 text-[#61596f]">Chaque retour compte, et le vôtre vient de nous aider à rendre Hada un peu meilleure.</p>
      <p className="mt-5 text-[17px] leading-8 text-[#61596f]">
        Partagez Hada autour de vous, à celles et ceux qui préparent leur mariage. C'est la meilleure façon de nous soutenir. 💌
      </p>
    </div>
  );
}

function SurveyTextarea({
  value,
  onChange,
  rows,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="mt-6 w-full resize-none rounded-[28px] border border-[#eadfda] bg-white px-5 py-4 text-[17px] leading-7 text-[var(--hada-navy)] shadow-[0_12px_28px_rgba(46,28,54,0.05)] outline-none placeholder:text-[#9a9290] focus:border-[var(--hada-coral)] focus:ring-4 focus:ring-[#fff0f1]"
    />
  );
}

function QuestionLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <p className="text-[19px] font-medium leading-7 text-[var(--hada-navy)]">
      {children}
      {required ? <span className="ml-1 text-[var(--hada-coral)]">*</span> : null}
    </p>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HadaPortrait } from "@/components/hada-portrait";
import { Shell } from "@/components/shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WeddingProfile } from "@/lib/types";

const initialState = {
  partnerOneName: "",
  partnerTwoName: "",
  weddingDate: "",
  weddingPeriodText: "",
  city: "",
  region: "",
  country: "France",
  guestCount: "",
  budgetMin: "",
  budgetMax: "",
  style: "",
  ceremonyType: "",
  notes: ""
};

const styleOptions = ["Elegant", "Editorial", "Champetre chic", "Intimiste", "Fete"];
const ceremonyOptions = ["Civil", "Religieux", "Laic", "Destination"];

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadProfile() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
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
            city: result.profile.city ?? "",
            region: result.profile.region ?? "",
            country: result.profile.country ?? "France",
            guestCount: result.profile.guest_count?.toString() ?? "",
            budgetMin: result.profile.budget_min?.toString() ?? "",
            budgetMax: result.profile.budget_max?.toString() ?? "",
            style: result.profile.style ?? "",
            ceremonyType: result.profile.ceremony_type ?? "",
            notes: result.profile.notes ?? ""
          });
        }
      }

      setIsLoading(false);
    }

    loadProfile();
  }, [router]);

  const steps = useMemo(
    () => [
      {
        title: "Profilage ?",
        subtitle: "Hada va vous poser quelques questions rapides pour personnaliser sa recherche.",
        content: (
          <div className="space-y-6 text-center">
            <HadaPortrait size="lg" />
            <p className="mx-auto max-w-[280px] text-sm leading-6 text-[var(--hada-muted)]">
              L&apos;objectif est simple: comprendre votre mariage pour lancer ensuite une vraie recherche de lieu.
            </p>
          </div>
        )
      },
      {
        title: "Qui se marie ?",
        subtitle: "Hada memorise votre duo et le type de ceremonie pour mieux formuler la suite.",
        content: (
          <div className="space-y-4">
            <Field placeholder="Prenom marie 1" value={form.partnerOneName} onChange={(value) => setForm((prev) => ({ ...prev, partnerOneName: value }))} />
            <Field placeholder="Prenom marie 2" value={form.partnerTwoName} onChange={(value) => setForm((prev) => ({ ...prev, partnerTwoName: value }))} />
            <div className="grid grid-cols-2 gap-3">
              {ceremonyOptions.map((option) => (
                <Choice
                  key={option}
                  label={option}
                  active={form.ceremonyType === option}
                  onClick={() => setForm((prev) => ({ ...prev, ceremonyType: option }))}
                />
              ))}
            </div>
          </div>
        )
      },
      {
        title: "Quand avez-vous prevu de vous marier ?",
        subtitle: "Une date precise est parfaite, mais une periode fonctionne aussi.",
        content: (
          <div className="space-y-4">
            <Field type="date" placeholder="Date du mariage" value={form.weddingDate} onChange={(value) => setForm((prev) => ({ ...prev, weddingDate: value }))} />
            <Field placeholder="Periode cible" value={form.weddingPeriodText} onChange={(value) => setForm((prev) => ({ ...prev, weddingPeriodText: value }))} />
          </div>
        )
      },
      {
        title: "Combien serez-vous ?",
        subtitle: "Le nombre d&apos;invites est un critere cle pour filtrer les lieux.",
        content: (
          <div className="space-y-4">
            <Field type="number" placeholder="Nombre d'invites" value={form.guestCount} onChange={(value) => setForm((prev) => ({ ...prev, guestCount: value }))} />
            <div className="grid grid-cols-3 gap-3">
              {["80", "120", "150+"].map((option) => (
                <Choice
                  key={option}
                  label={option}
                  active={form.guestCount === option}
                  onClick={() => setForm((prev) => ({ ...prev, guestCount: option }))}
                />
              ))}
            </div>
          </div>
        )
      },
      {
        title: "Ou souhaitez-vous vous marier ?",
        subtitle: "Ville, region et pays aideront Hada a cibler les bonnes zones.",
        content: (
          <div className="space-y-4">
            <Field placeholder="Ville" value={form.city} onChange={(value) => setForm((prev) => ({ ...prev, city: value }))} />
            <Field placeholder="Region" value={form.region} onChange={(value) => setForm((prev) => ({ ...prev, region: value }))} />
            <Field placeholder="Pays" value={form.country} onChange={(value) => setForm((prev) => ({ ...prev, country: value }))} />
          </div>
        )
      },
      {
        title: "Quel est votre budget ?",
        subtitle: "Hada s&apos;appuie dessus pour trier intelligemment les options.",
        content: (
          <div className="space-y-4">
            <Field type="number" placeholder="Budget minimum" value={form.budgetMin} onChange={(value) => setForm((prev) => ({ ...prev, budgetMin: value }))} />
            <Field type="number" placeholder="Budget maximum" value={form.budgetMax} onChange={(value) => setForm((prev) => ({ ...prev, budgetMax: value }))} />
          </div>
        )
      },
      {
        title: "Quel style imaginez-vous ?",
        subtitle: "C&apos;est ce qui va aider Hada a mieux filtrer et mieux ecrire ses messages.",
        content: (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {styleOptions.map((option) => (
                <Choice
                  key={option}
                  label={option}
                  active={form.style === option}
                  onClick={() => setForm((prev) => ({ ...prev, style: option }))}
                />
              ))}
            </div>
            <textarea
              className="hada-input min-h-32 resize-none"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Notes importantes, contraintes, ambiance souhaitee..."
            />
          </div>
        )
      },
      {
        title: "Tout est bon ?",
        subtitle: "Hada a assez d&apos;informations pour preparer le chat et demarrer la recherche.",
        content: (
          <div className="hada-soft-card space-y-3 p-5 text-sm text-[#46373f]">
            <Summary label="Couple" value={`${form.partnerOneName || "?"} & ${form.partnerTwoName || "?"}`} />
            <Summary label="Date" value={form.weddingDate || form.weddingPeriodText || "Non renseignee"} />
            <Summary label="Zone" value={[form.city, form.region, form.country].filter(Boolean).join(", ") || "Non renseignee"} />
            <Summary label="Invites" value={form.guestCount || "Non renseigne"} />
            <Summary label="Budget" value={`${form.budgetMin || "?"} - ${form.budgetMax || "?"} EUR`} />
            <Summary label="Style" value={form.style || "Non renseigne"} />
          </div>
        )
      }
    ],
    [form]
  );

  if (isLoading) {
    return (
      <Shell hideNav title="Profilage" subtitle="Hada recharge votre session et votre progression.">
        <div className="hada-soft-card px-5 py-10 text-center text-sm text-[var(--hada-muted)]">Chargement du profil...</div>
      </Shell>
    );
  }

  const isLastStep = step === steps.length - 1;

  return (
    <Shell
      hideNav
      title={steps[step].title}
      subtitle={steps[step].subtitle}
      topSlot={<span className="hada-pill bg-[#fff4e3] text-[var(--hada-gold)]">{`Etape ${step + 1}/${steps.length}`}</span>}
      backHref={step > 0 ? "/" : "/"}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          {steps.map((_, index) => (
            <span
              key={index}
              data-active={index === step}
              className={`hada-progress-dot ${index === step ? "w-[30px]" : "w-[7px]"}`}
            />
          ))}
        </div>

        <div className="hada-card p-5">{steps[step].content}</div>

        <div className="grid gap-3">
          {isLastStep ? (
            <button
              disabled={isPending || !accessToken}
              className="hada-primary-button disabled:opacity-60"
              onClick={() => {
                if (!accessToken) {
                  setMessage("Session introuvable. Reconnectez-vous.");
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
                      wedding_date: form.weddingDate || null,
                      wedding_period_text: form.weddingPeriodText || null,
                      city: form.city || null,
                      region: form.region || null,
                      country: form.country || null,
                      guest_count: form.guestCount ? Number(form.guestCount) : null,
                      budget_min: form.budgetMin ? Number(form.budgetMin) : null,
                      budget_max: form.budgetMax ? Number(form.budgetMax) : null,
                      style: form.style || null,
                      ceremony_type: form.ceremonyType || null,
                      notes: form.notes || null
                    })
                  });

                  const result = await response.json();
                  if (!response.ok) {
                    setMessage(result.error ?? "Erreur inattendue.");
                    return;
                  }

                  router.push("/chat");
                });
              }}
            >
              {isPending ? "Enregistrement..." : "Commencer avec Hada"}
            </button>
          ) : (
            <button className="hada-primary-button" onClick={() => setStep((current) => Math.min(current + 1, steps.length - 1))}>
              Continuer
            </button>
          )}

          {step > 0 ? (
            <button className="hada-secondary-button" onClick={() => setStep((current) => Math.max(current - 1, 0))}>
              Revenir
            </button>
          ) : null}
        </div>

        {message ? <p className="text-center text-sm text-[var(--hada-muted)]">{message}</p> : null}
      </div>
    </Shell>
  );
}

function Field({
  placeholder,
  value,
  onChange,
  type = "text"
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return <input className="hada-input" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function Choice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-[18px] border px-4 py-4 text-sm font-medium transition ${
        active
          ? "border-[#ffb8bc] bg-[#fff0ef] text-[var(--hada-ink)]"
          : "border-[var(--hada-line)] bg-white text-[var(--hada-muted)]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="hada-card flex items-center justify-between gap-3 px-4 py-3">
      <span className="hada-label">{label}</span>
      <span className="text-right text-sm font-medium text-[var(--hada-ink)]">{value}</span>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/app-shell";
import { PencilIcon } from "@/components/mobile-screen";
import type { WeddingProfile } from "@/lib/types";

type EditableProfile = {
  partnerOneName: string;
  partnerTwoName: string;
  weddingDate: string;
  city: string;
  guestCount: string;
  budgetMax: string;
};

export default function MonMariagePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<WeddingProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableProfile>({
    partnerOneName: "",
    partnerTwoName: "",
    weddingDate: "",
    city: "",
    guestCount: "",
    budgetMax: ""
  });
  const [feedback, setFeedback] = useState("");
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

      if (!session) {
        setIsPreviewMode(true);
        setDraft({
          partnerOneName: "Lila",
          partnerTwoName: "Marc",
          weddingDate: "2027-06-13",
          city: "Campagne près de Paris",
          guestCount: "100",
          budgetMax: "10000"
        });
        setIsLoading(false);
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
        setDraft({
          partnerOneName: result.profile?.partner_one_name ?? "",
          partnerTwoName: result.profile?.partner_two_name ?? "",
          weddingDate: result.profile?.wedding_date ?? "",
          city: result.profile?.city ?? "",
          guestCount: result.profile?.guest_count?.toString() ?? "",
          budgetMax: result.profile?.budget_max?.toString() ?? ""
        });
      }

      setIsLoading(false);
    }

    void loadProfile();
  }, [router]);

  const data = useMemo(() => {
    const names = `${draft.partnerOneName || "?"} & ${draft.partnerTwoName || "?"}`;
    const completionFields = [
      draft.partnerOneName,
      draft.partnerTwoName,
      draft.weddingDate || profile?.wedding_period_text,
      draft.city || profile?.region,
      draft.guestCount,
      draft.budgetMax || profile?.budget_min?.toString()
    ];
    const progress = Math.round((completionFields.filter((field) => String(field ?? "").trim().length > 0).length / completionFields.length) * 100);

    return {
      names,
      progress,
      weddingDate: draft.weddingDate ? formatDateFr(draft.weddingDate) : profile?.wedding_period_text ?? "Pas encore de date fixe",
      city: draft.city || "À définir",
      guestCount: draft.guestCount ? `${draft.guestCount} invités` : "À confirmer",
      budgetMax: draft.budgetMax ? `${Number(draft.budgetMax).toLocaleString("fr-FR")} EUR` : "À confirmer"
    };
  }, [draft, profile]);

  if (isLoading) {
    return (
      <AppShell active="wedding">
        <div />
      </AppShell>
    );
  }

  function saveProfile() {
    if (!accessToken) {
      setFeedback("Mode preview: la sauvegarde Supabase sera disponible avec une session active.");
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      setFeedback("");

      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          partner_one_name: draft.partnerOneName || null,
          partner_two_name: draft.partnerTwoName || null,
          wedding_date: draft.weddingDate || null,
          wedding_period_text: draft.weddingDate ? null : "Pas encore de date fixe",
          city: draft.city || null,
          region: profile?.region ?? null,
          country: profile?.country ?? "France",
          guest_count: draft.guestCount ? Number(draft.guestCount) : null,
          budget_min: profile?.budget_min ?? null,
          budget_max: draft.budgetMax ? Number(draft.budgetMax) : null,
          style: profile?.style ?? null,
          ceremony_type: profile?.ceremony_type ?? null,
          notes: profile?.notes ?? null
        })
      });

      const result = await response.json();
      if (!response.ok) {
        setFeedback(result.error ?? "Impossible d'enregistrer les modifications.");
        return;
      }

      setProfile(result.profile);
      setIsEditing(false);
      setFeedback("Informations mises à jour.");
    });
  }

  return (
    <AppShell active="wedding" mobileTitle="Mon mariage">
      <section className="rounded-[32px] bg-white p-6 shadow-[0_10px_30px_rgba(46,28,54,0.06)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Mon mariage</p>
            {isEditing ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={draft.partnerOneName}
                  onChange={(event) => setDraft((current) => ({ ...current, partnerOneName: event.target.value }))}
                  placeholder="Marie(e) 1"
                  className="rounded-[16px] border border-[#eadfda] px-4 py-3 text-[22px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)] outline-none"
                />
                <input
                  value={draft.partnerTwoName}
                  onChange={(event) => setDraft((current) => ({ ...current, partnerTwoName: event.target.value }))}
                  placeholder="Marie(e) 2"
                  className="rounded-[16px] border border-[#eadfda] px-4 py-3 text-[22px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)] outline-none"
                />
              </div>
            ) : (
              <h1 className="mt-3 text-[32px] font-bold tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[42px]">{data.names}</h1>
            )}
            <p className="mt-3 max-w-[760px] text-[18px] leading-8 text-[#6d6475] sm:text-[20px]">
              Retrouve ici toutes les informations partagées pendant l&apos;onboarding. Hada s&apos;appuie dessus pour te guider, rechercher des prestataires et préparer tes prises de contact.
            </p>
          </div>
        </div>

        {isPreviewMode ? <p className="mt-4 text-[14px] text-[#9a8c90]">Preview sans session Supabase</p> : null}
        {feedback ? <p className="mt-4 text-[14px] font-semibold text-[var(--hada-coral)]">{feedback}</p> : null}

        <div className="mt-8 rounded-[24px] bg-[#fff7f4] p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[16px] font-semibold text-[var(--hada-navy)]">Complétion du profil</p>
            <p className="text-[16px] font-semibold text-[var(--hada-navy)]">{data.progress}%</p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f1e3de]">
            <div className="h-full rounded-full bg-[var(--hada-coral)]" style={{ width: `${data.progress}%` }} />
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">Informations du mariage</h2>
            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-[#eadfda] px-4 text-[14px] font-semibold text-[var(--hada-navy)]"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={isPending}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--hada-coral)] px-4 text-[14px] font-semibold text-white"
                  >
                    Enregistrer
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] text-[18px] text-[var(--hada-navy)]"
                  aria-label="Modifier les informations"
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <EditableCard
              label="Date du mariage"
              editing={isEditing}
              input={
                <input
                  type="date"
                  value={draft.weddingDate}
                  onChange={(event) => setDraft((current) => ({ ...current, weddingDate: event.target.value }))}
                  className="mt-3 w-full rounded-[14px] border border-[#eadfda] px-3 py-2 text-[16px] text-[var(--hada-navy)] outline-none"
                />
              }
              value={data.weddingDate}
            />
            <EditableCard
              label="Lieu visé"
              editing={isEditing}
              input={
                <input
                  value={draft.city}
                  onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
                  className="mt-3 w-full rounded-[14px] border border-[#eadfda] px-3 py-2 text-[16px] text-[var(--hada-navy)] outline-none"
                />
              }
              value={data.city}
            />
            <EditableCard
              label="Nombre d'invités"
              editing={isEditing}
              input={
                <input
                  value={draft.guestCount}
                  onChange={(event) => setDraft((current) => ({ ...current, guestCount: event.target.value.replace(/[^\d]/g, "") }))}
                  className="mt-3 w-full rounded-[14px] border border-[#eadfda] px-3 py-2 text-[16px] text-[var(--hada-navy)] outline-none"
                />
              }
              value={data.guestCount}
            />
            <EditableCard
              label="Budget"
              editing={isEditing}
              input={
                <input
                  value={draft.budgetMax}
                  onChange={(event) => setDraft((current) => ({ ...current, budgetMax: event.target.value.replace(/[^\d]/g, "") }))}
                  className="mt-3 w-full rounded-[14px] border border-[#eadfda] px-3 py-2 text-[16px] text-[var(--hada-navy)] outline-none"
                />
              }
              value={data.budgetMax}
            />
          </div>
        </div>

        <div className="mt-8">
          <div className="rounded-[24px] border border-[#efe5df] bg-white p-5">
            <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">Prochaine étape suggérée</h2>
            <p className="mt-4 text-[17px] leading-7 text-[#665f72]">
              Hada recommande de commencer par la recherche de lieu, puis d&apos;enchaîner avec les prestataires qui dépendent le plus de la date et de la capacité.
            </p>
            <Link
              href="/chat"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
            >
              Retourner au chat
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function EditableCard({
  label,
  value,
  editing,
  input
}: {
  label: string;
  value: string;
  editing: boolean;
  input: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-[#efe5df] bg-white p-5 shadow-[0_6px_18px_rgba(46,28,54,0.04)]">
      <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#a29396]">{label}</p>
      {editing ? input : <p className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">{value}</p>}
    </div>
  );
}

function formatDateFr(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

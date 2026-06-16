"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/app-shell";
import { PencilIcon } from "@/components/mobile-screen";
import type { WeddingChecklistItem, WeddingProfile } from "@/lib/types";
import { normalizeWeddingChecklist } from "@/lib/wedding-checklist";

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
  const [updatingChecklistItemId, setUpdatingChecklistItemId] = useState<string | null>(null);
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

  const checklist = useMemo(() => normalizeWeddingChecklist(profile?.wedding_checklist), [profile?.wedding_checklist]);
  const checklistDoneCount = checklist.filter((item) => item.done).length;
  const checklistProgress = Math.round((checklistDoneCount / checklist.length) * 100);

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
        body: JSON.stringify(buildProfilePayload(profile, draft, checklist))
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

  function updateChecklistItem(itemId: string, done: boolean) {
    const nextChecklist = checklist.map((item) => (item.id === itemId ? { ...item, done } : item));
    const previousProfile = profile;

    setProfile((current) => (current ? { ...current, wedding_checklist: nextChecklist } : current));

    if (!accessToken) {
      return;
    }

    setUpdatingChecklistItemId(itemId);
    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(buildProfilePayload(profile, draft, nextChecklist))
      });

      const result = await response.json();
      if (!response.ok) {
        setProfile(previousProfile);
        setFeedback(result.error ?? "Impossible de mettre à jour la checklist.");
        setUpdatingChecklistItemId(null);
        return;
      }

      setProfile(result.profile);
      setFeedback(done ? "Étape cochée." : "Étape remise à faire.");
      setUpdatingChecklistItemId(null);
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

        <WeddingChecklistCard
          checklist={checklist}
          doneCount={checklistDoneCount}
          progress={checklistProgress}
          weddingDate={draft.weddingDate || profile?.wedding_date}
          createdAt={profile?.created_at}
          updatingItemId={updatingChecklistItemId}
          onToggle={updateChecklistItem}
        />
      </section>
    </AppShell>
  );
}

function WeddingChecklistCard({
  checklist,
  doneCount,
  progress,
  weddingDate,
  createdAt,
  updatingItemId,
  onToggle
}: {
  checklist: WeddingChecklistItem[];
  doneCount: number;
  progress: number;
  weddingDate?: string | null;
  createdAt?: string | null;
  updatingItemId: string | null;
  onToggle: (itemId: string, done: boolean) => void;
}) {
  const timeline = useMemo(() => buildChecklistTimeline(checklist, weddingDate, createdAt), [checklist, weddingDate, createdAt]);
  const weddingLabel = weddingDate ? formatDateFr(weddingDate) : "Date à confirmer";

  return (
    <div className="mt-8 overflow-hidden rounded-[30px] border border-[#efe5df] bg-[#fff8f5] shadow-[0_14px_34px_rgba(46,28,54,0.07)]">
      <div className="border-b border-[#f1e2dc] bg-[linear-gradient(135deg,#fffaf7_0%,#fff1ed_58%,#ffe3e6_100%)] px-5 py-5 sm:px-7">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Planning</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.05em] text-[var(--hada-navy)]">Check-list mariage</h2>
            <p className="mt-2 text-[15px] leading-6 text-[#6f6878]">
              Une todo list étalée dans le temps, entre aujourd&apos;hui et le jour J. Hada peut cocher ou rouvrir les tâches depuis le chat.
            </p>
          </div>
          <div className="rounded-[18px] border border-[#f4d8d1] bg-white/75 px-4 py-3 text-left shadow-[0_8px_22px_rgba(251,105,116,0.08)] sm:text-right">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#b79a96]">Jour J</p>
            <p className="mt-1 text-[16px] font-semibold text-[var(--hada-navy)]">{weddingLabel}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/80">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--hada-coral),#d86b91)] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-[13px] font-semibold text-[#9a7779]">{doneCount} tâches complétées sur {checklist.length}</p>
          </div>
          <div className="inline-flex w-fit items-center rounded-full border border-[#f0d9d2] bg-white/80 px-4 py-2 text-[13px] font-semibold text-[var(--hada-navy)] shadow-[0_6px_16px_rgba(46,28,54,0.05)]">
            Complétées ({doneCount})
          </div>
        </div>
      </div>

      <div className="space-y-7 px-4 py-5 sm:px-7">
        {timeline.map((group) => (
          <section key={group.key}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--hada-navy)]">{group.label}</h3>
                <p className="mt-0.5 text-[13px] font-medium text-[#a18486]">{group.relativeLabel}</p>
              </div>
              <p className="rounded-full border border-[#f1e2dc] bg-white px-3 py-1 text-[12px] font-semibold text-[#8a6f73] shadow-[0_4px_14px_rgba(46,28,54,0.05)]">
                {group.doneCount} / {group.items.length}
              </p>
            </div>

            <div className="space-y-2.5">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(item.id, !item.done)}
                  disabled={updatingItemId === item.id}
                  className="grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[13px] border border-[#f0e1dc] bg-white px-3 py-3 text-left shadow-[0_4px_12px_rgba(46,28,54,0.04)] transition hover:-translate-y-0.5 hover:border-[#f8b8b7] hover:shadow-[0_8px_20px_rgba(251,105,116,0.08)] disabled:cursor-wait disabled:opacity-70"
                >
                  <span
                    className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded-[6px] border text-[15px] font-bold transition",
                      item.done ? "border-[var(--hada-coral)] bg-[var(--hada-coral)] text-white" : "border-[#d7c5bf] bg-[#fffaf7] text-transparent"
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className={["block text-[15px] font-semibold leading-5", item.done ? "text-[#8a91a0]" : "text-[var(--hada-navy)]"].join(" ")}>
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-[#796b74]">{item.description}</span>
                  </span>
                  <span className="text-[14px] font-semibold text-[#c68f90]">›</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-[#f0e3de] bg-white px-5 py-4">
        <Link href="/chat" className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[14px] font-semibold text-white">
          Mettre à jour avec Hada →
        </Link>
      </div>
    </div>
  );
}

function buildChecklistTimeline(checklist: WeddingChecklistItem[], weddingDate?: string | null, createdAt?: string | null) {
  const wedding = parseDate(weddingDate);
  const accountCreated = parseDate(createdAt) ?? new Date();

  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      relativeLabel: string;
      timestamp: number;
      items: WeddingChecklistItem[];
      doneCount: number;
    }
  >();

  for (const item of checklist) {
    const dueDate = wedding ? addMonths(wedding, -item.dueOffsetMonths) : addMonths(accountCreated, Math.max(0, 15 - item.dueOffsetMonths));
    const key = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
    const existing =
      groups.get(key) ??
      {
        key,
        label: formatMonthYear(dueDate),
        relativeLabel: wedding ? formatRelativeToWedding(item.dueOffsetMonths) : "À planifier",
        timestamp: dueDate.getTime(),
        items: [],
        doneCount: 0
      };

    existing.items.push(item);
    existing.doneCount = existing.items.filter((entry) => entry.done).length;
    groups.set(key, existing);
  }

  return Array.from(groups.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatRelativeToWedding(offsetMonths: number) {
  if (offsetMonths > 1) return `${offsetMonths} mois avant`;
  if (offsetMonths === 1) return "1 mois avant";
  if (offsetMonths === 0) return "Mois du mariage";
  return "Après le mariage";
}

function buildProfilePayload(profile: WeddingProfile | null, draft: EditableProfile, checklist: WeddingChecklistItem[]) {
  return {
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
    notes: profile?.notes ?? null,
    wedding_checklist: checklist
  };
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

"use client";

import { useState, useTransition } from "react";
import { Shell } from "@/components/shell";

const initialState = {
  userId: "demo-user",
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

export default function OnboardingPage() {
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  return (
    <Shell
      title="Profilage du mariage"
      subtitle="Cette page alimente la database avec les informations essentielles qui seront ensuite reutilisees dans le chat IA."
    >
      <form
        className="rounded-[28px] bg-white/85 p-8 shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setMessage("");

            const response = await fetch("/api/profile", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: form.userId,
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
            setMessage(response.ok ? "Profil enregistre." : result.error ?? "Erreur inattendue.");
          });
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Prenom marie 1" value={form.partnerOneName} onChange={(value) => setForm((prev) => ({ ...prev, partnerOneName: value }))} />
          <Field label="Prenom marie 2" value={form.partnerTwoName} onChange={(value) => setForm((prev) => ({ ...prev, partnerTwoName: value }))} />
          <Field label="Date du mariage" type="date" value={form.weddingDate} onChange={(value) => setForm((prev) => ({ ...prev, weddingDate: value }))} />
          <Field label="Periode cible" value={form.weddingPeriodText} onChange={(value) => setForm((prev) => ({ ...prev, weddingPeriodText: value }))} />
          <Field label="Ville" value={form.city} onChange={(value) => setForm((prev) => ({ ...prev, city: value }))} />
          <Field label="Region" value={form.region} onChange={(value) => setForm((prev) => ({ ...prev, region: value }))} />
          <Field label="Pays" value={form.country} onChange={(value) => setForm((prev) => ({ ...prev, country: value }))} />
          <Field label="Invites estimes" type="number" value={form.guestCount} onChange={(value) => setForm((prev) => ({ ...prev, guestCount: value }))} />
          <Field label="Budget min" type="number" value={form.budgetMin} onChange={(value) => setForm((prev) => ({ ...prev, budgetMin: value }))} />
          <Field label="Budget max" type="number" value={form.budgetMax} onChange={(value) => setForm((prev) => ({ ...prev, budgetMax: value }))} />
          <Field label="Style" value={form.style} onChange={(value) => setForm((prev) => ({ ...prev, style: value }))} />
          <Field label="Type de ceremonie" value={form.ceremonyType} onChange={(value) => setForm((prev) => ({ ...prev, ceremonyType: value }))} />
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm">Notes importantes</span>
            <textarea
              className="min-h-32 rounded-2xl border border-black/10 px-4 py-3"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Contraintes, ambiance souhaitée, besoins logistiques..."
            />
          </label>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <button disabled={isPending} className="rounded-full bg-ink px-6 py-3 text-sm text-white">
            {isPending ? "Enregistrement..." : "Enregistrer le profil"}
          </button>
          {message ? <span className="text-sm text-black/70">{message}</span> : null}
        </div>
      </form>
    </Shell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm">{label}</span>
      <input
        className="rounded-2xl border border-black/10 px-4 py-3"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

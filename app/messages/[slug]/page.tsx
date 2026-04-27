"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { venueCards } from "@/lib/mock-data";

const requestChoices = ["Demander un devis", "Verifier la disponibilite", "Demander un rendez-vous"];

export default function VenueMessagePage() {
  const params = useParams<{ slug: string }>();
  const venue = useMemo(() => venueCards.find((item) => item.slug === params.slug), [params.slug]);
  const [selectedChoice, setSelectedChoice] = useState(requestChoices[0]);

  if (!venue) {
    return null;
  }

  return (
    <Shell
      hideNav
      backHref={`/venues/${venue.slug}`}
      title="Messagerie"
      subtitle={`Choisissez une demande, puis laissez Hada preparer le message pour ${venue.name}.`}
      topSlot={<span className="hada-pill bg-[#fff4e3] text-[var(--hada-gold)]">Pret a envoyer</span>}
    >
      <div className="space-y-5">
        <section className="hada-soft-card p-5">
          <p className="text-sm font-semibold text-[var(--hada-ink)]">Quelle demande souhaitez-vous envoyer ?</p>
          <div className="mt-4 grid gap-3">
            {requestChoices.map((option) => {
              const isActive = option === selectedChoice;
              return (
                <button
                  key={option}
                  className={`rounded-[18px] border px-4 py-4 text-left text-sm font-medium transition ${
                    isActive
                      ? "border-[#ffb8bc] bg-[#fff0ef] text-[var(--hada-ink)]"
                      : "border-[var(--hada-line)] bg-white text-[var(--hada-muted)]"
                  }`}
                  onClick={() => setSelectedChoice(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </section>

        <section className="hada-card p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--hada-ink)]">Brouillon Hada</p>
            <span className="rounded-full bg-[#fff4e3] px-3 py-2 text-xs font-semibold text-[var(--hada-gold)]">IA</span>
          </div>
          <textarea
            className="hada-input mt-4 min-h-72 resize-none leading-7 text-[#46373f]"
            defaultValue={`Bonjour,\n\nNous organisons un mariage elegant en Provence pour environ 120 invites et ${venue.name} a retenu notre attention.\n\nNous aimerions ${selectedChoice.toLowerCase()} et en savoir plus sur vos modalites, vos disponibilites et les options sur place.\n\nMerci beaucoup,\nLe couple accompagne par Hada`}
          />
        </section>

        <div className="grid gap-3">
          <Link href="/chat?sent=1" className="hada-primary-button">
            Envoyer le message
          </Link>
          <button className="hada-secondary-button">Modifier avant envoi</button>
        </div>
      </div>
    </Shell>
  );
}

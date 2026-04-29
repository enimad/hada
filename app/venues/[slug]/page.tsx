"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ArrowLeftIcon } from "@/components/mobile-screen";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VendorCandidateView } from "@/lib/types";

export default function VenueDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [venue, setVenue] = useState<VendorCandidateView | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [contactMessage, setContactMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadVenue() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setIsLoading(false);
        return;
      }

      setAccessToken(session.access_token);

      const response = await fetch(`/api/vendors?category=venue&slug=${slug}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as { candidates: VendorCandidateView[] };
        setVenue(result.candidates?.[0] ?? null);
      }

      setIsLoading(false);
    }

    loadVenue();
  }, [slug]);

  async function handleContact() {
    if (!accessToken || !venue) return;

    const response = await fetch("/api/vendors/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ candidateId: venue.id })
    });

    const result = await response.json();
    if (!response.ok) {
      setContactMessage(result.error ?? "Impossible de preparer l'email.");
      return;
    }

    setContactMessage("Email prepare. Votre boite mail va s'ouvrir.");
    window.location.href = result.mailtoUrl;
  }

  if (isLoading) {
    return (
      <AppShell active="vendors" mobileTitle="Lieu">
        <div />
      </AppShell>
    );
  }

  if (!venue) {
    return (
      <AppShell active="vendors" mobileTitle="Lieu">
        <section className="rounded-[32px] bg-white p-6 shadow-[0_10px_30px_rgba(46,28,54,0.06)]">
          <p className="text-[20px] font-semibold text-[var(--hada-navy)]">Fiche prestataire introuvable</p>
          <Link
            href="/venues"
            className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
          >
            Retour aux lieux
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="vendors" mobileTitle={venue.name}>
      <article className="overflow-hidden rounded-[32px] bg-white shadow-[0_10px_30px_rgba(46,28,54,0.06)]">
        <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-8">
          <Link
            href="/venues"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]"
            aria-label="Partager"
          >
            <ShareModernIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <Image src={venue.image ?? "/venue-olive.svg"} alt={venue.name} width={1400} height={640} className="h-[320px] w-full object-cover sm:h-[420px] xl:h-[500px]" />
          <div className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-2 text-[14px] font-semibold text-[var(--hada-navy)] shadow-[0_10px_25px_rgba(46,28,54,0.12)] backdrop-blur">
            <span className="text-[var(--hada-gold)]">★</span>
            <span>{venue.rating?.toFixed(1) ?? "4.8"}</span>
            <span className="text-[#958a89]">•</span>
            <span className="text-[#958a89]">{venue.reviewsCount ?? 18} avis</span>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#ff7f86] px-4 py-2 text-[13px] font-semibold text-white">
            <span>AI</span>
            <span>Synthese geree par IA</span>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <div>
              <h1 className="text-[28px] font-bold tracking-[-0.04em] text-[var(--hada-navy)] sm:text-[34px]">{venue.name}</h1>
              <p className="mt-1 text-[18px] text-[#7b7590]">{venue.city ?? venue.region ?? "France"}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard title="A partir de" value={venue.priceRange ?? "Sur demande"} icon="EUR" />
            <InfoCard title="Capacite" value={venue.capacity ?? "A confirmer"} icon="GRP" />
            <InfoCard title="Type" value="Domaine" icon="TYP" />
            <InfoCard title="Style" value={venue.vibe ?? "A definir"} icon="STY" />
          </div>

          <button
            type="button"
            onClick={handleContact}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[var(--hada-coral)] text-[18px] font-semibold text-white sm:h-16 sm:max-w-[280px]"
          >
            Contacter
          </button>
          {contactMessage ? <p className="mt-3 text-[14px] font-medium text-[var(--hada-coral)]">{contactMessage}</p> : null}

          <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <div>
              <SectionTitle title="A propos" />
              <p className="mt-3 text-[17px] leading-8 text-[#61596f] sm:text-[18px]">
                {venue.summary} Cette fiche est generee dynamiquement par Hada pour vous aider a qualifier le lieu avant la prise de contact.
              </p>
              <p className="mt-5 text-[17px] leading-8 text-[#61596f] sm:text-[18px]">{venue.match ?? "Correspondance en cours d'analyse."}</p>

              <SectionTitle title="Points forts" />
              <div className="mt-4 flex flex-wrap gap-3">
                {venue.highlights.map((highlight) => (
                  <span key={highlight} className="rounded-full bg-[#fff0f1] px-4 py-2 text-[14px] font-medium text-[var(--hada-coral)]">
                    {highlight}
                  </span>
                ))}
              </div>

              <SectionTitle title="Plus d'informations" />
              <div className="space-y-7">
                <InfoList title="Tags identifies par Hada" items={venue.tags.length > 0 ? venue.tags : ["Informations en cours d'enrichissement"]} />
                <InfoList title="Coordonnees" items={[venue.email ?? "Email non detecte", venue.phone ?? "Telephone non detecte", venue.website ?? "Site web non detecte"]} />
              </div>
            </div>

            <div>
              <SectionTitle title="Avis" />
              <div className="mt-4 grid gap-4">
                <ReviewCard name="Maeva" date="Envoye le 07/11/2025" initial="M" color="#b67df0" />
                <ReviewCard name="Jordan" date="Envoye le 25/01/2025" initial="J" color="#efc37a" />
              </div>

              <SectionTitle title="Plan" />
              <div className="mt-4 overflow-hidden rounded-[18px] bg-[#d9efe5]">
                <div className="flex h-[220px] items-center justify-center bg-[linear-gradient(135deg,#d8ece0,#a8d9be)] text-[32px] font-semibold text-[#2f66ff]">Plan</div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </AppShell>
  );
}

function ShareModernIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.7 10.7 15.2 6.8" />
      <path d="m8.7 13.3 6.5 3.9" />
    </svg>
  );
}

function InfoCard({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="rounded-[18px] border border-[#f0ebea] bg-white p-4">
      <p className="text-[20px] font-semibold text-[var(--hada-navy)]">{icon}</p>
      <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#a3a0b3]">{title}</p>
      <p className="mt-3 text-[18px] font-bold tracking-[-0.03em] text-[var(--hada-navy)] sm:text-[20px]">{value}</p>
    </div>
  );
}

function ReviewCard({ name, date, initial, color }: { name: string; date: string; initial: string; color: string }) {
  return (
    <div className="rounded-[24px] border border-[#eae4e0] bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[18px] font-semibold text-white" style={{ backgroundColor: color }}>
          {initial}
        </span>
        <div>
          <p className="text-[18px] font-semibold text-[var(--hada-navy)]">{name}</p>
          <p className="text-[13px] text-[#9a9290]">{date}</p>
        </div>
      </div>
      <p className="mt-3 text-[16px] font-semibold text-[var(--hada-navy)]">5/5 - 5.0</p>
      <p className="mt-3 text-[16px] leading-7 text-[#61596f]">
        Retour tres positif. Hada conservera ici les informations utiles pour comparer les prestataires.
      </p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mt-10 text-[20px] font-bold uppercase tracking-[0.08em] text-[var(--hada-navy)] sm:text-[22px]">{title}</h2>;
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mt-3 text-[18px] font-semibold text-[var(--hada-navy)] sm:text-[20px]">{title}</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-3 text-[16px] text-[#61596f] sm:text-[18px]">
            <span className="text-[18px] text-[var(--hada-navy)]">o</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

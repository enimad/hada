"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HadaPortrait } from "@/components/hada-portrait";
import { Shell } from "@/components/shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WeddingProfile } from "@/lib/types";

const fallbackSummary = {
  couple: "Profil a completer",
  date: "Date non renseignee",
  location: "Lieu non renseigne",
  guests: "Invites non renseignes",
  budget: "Budget non renseigne"
};

export default function ChatPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<WeddingProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchStage, setSearchStage] = useState<"intro" | "researching" | "ready">("intro");
  const [sentConfirmation, setSentConfirmation] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadSessionAndProfile() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      setSentConfirmation(params.get("sent") === "1");

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

    loadSessionAndProfile();
  }, [router]);

  useEffect(() => {
    if (searchStage !== "researching") return;
    const timer = window.setTimeout(() => setSearchStage("ready"), 1800);
    return () => window.clearTimeout(timer);
  }, [searchStage]);

  const summary = useMemo(() => buildProfileSummary(profile), [profile]);

  if (isLoading) {
    return (
      <Shell hideNav title="Chat Hada" subtitle="Hada charge votre contexte mariage avant de reprendre la conversation.">
        <div className="hada-soft-card px-5 py-10 text-center text-sm text-[var(--hada-muted)]">Chargement du contexte Hada...</div>
      </Shell>
    );
  }

  return (
    <Shell
      hideNav
      title="Suite du chat avec Hada"
      subtitle="Hada relit votre projet puis vous accompagne pas a pas dans la recherche de lieu."
      topSlot={<span className="hada-pill bg-[#fff4e3] text-[var(--hada-gold)]">Hada cherche</span>}
    >
      <div className="space-y-5">
        {sentConfirmation ? (
          <div className="rounded-[20px] border border-[#f3dbbc] bg-[#fff6e8] px-4 py-4 text-sm leading-6 text-[#725437]">
            Hada a bien pris en compte le message au prestataire et reviendra des qu&apos;elle aura une reponse.
          </div>
        ) : null}

        <div className="flex items-start gap-3">
          <HadaPortrait size="sm" />
          <div className="hada-soft-card flex-1 p-5 text-sm leading-7 text-[var(--hada-ink)]">
            <p>
              Bonjour, je suis Hada. J&apos;ai note {summary.couple}, {summary.date}, {summary.location}, {summary.guests}, budget {summary.budget}.
            </p>
            <p className="mt-3">Dites-moi ce que vous souhaitez booker en premier et je vous aide a avancer.</p>
          </div>
        </div>

        <div className="ml-auto max-w-[83%] rounded-[24px] bg-[#2d2027] px-4 py-4 text-sm leading-7 text-white">Je cherche un lieu.</div>

        {searchStage === "intro" ? (
          <div className="hada-card p-5">
            <p className="text-sm leading-7 text-[var(--hada-ink)]">
              Parfait. Hada peut lancer une recherche de lieux adaptes a votre profil. Voulez-vous que je commence ?
            </p>
            <button className="hada-primary-button mt-4" onClick={() => setSearchStage("researching")}>
              Lancer la recherche
            </button>
          </div>
        ) : null}

        {searchStage === "researching" ? (
          <div className="rounded-[24px] border border-[#ebe4e2] bg-[#f5f2f1] px-5 py-6 text-sm leading-7 text-[#83767b]">
            2-3 coups de baguette et je vais te trouver les lieux les plus adaptes a ta demande.
          </div>
        ) : null}

        {searchStage === "ready" ? (
          <div className="hada-soft-card p-5">
            <p className="text-sm leading-7 text-[var(--hada-ink)]">
              J&apos;ai trouve une premiere selection de lieux qui semblent tres bien correspondre a ton mariage.
            </p>
            <Link href="/venues" className="hada-primary-button mt-4">
              Voir les nouveaux lieux
            </Link>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

function buildProfileSummary(profile: WeddingProfile | null) {
  if (!profile) {
    return fallbackSummary;
  }

  return {
    couple:
      profile.partner_one_name || profile.partner_two_name
        ? `${profile.partner_one_name ?? "?"} & ${profile.partner_two_name ?? "?"}`
        : fallbackSummary.couple,
    date: profile.wedding_date ?? profile.wedding_period_text ?? fallbackSummary.date,
    location:
      [profile.city, profile.region, profile.country].filter(Boolean).join(", ") || fallbackSummary.location,
    guests: profile.guest_count ? `${profile.guest_count} invites` : fallbackSummary.guests,
    budget:
      profile.budget_min || profile.budget_max
        ? `${profile.budget_min ?? "?"} - ${profile.budget_max ?? "?"} EUR`
        : fallbackSummary.budget
  };
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ArrowLeftIcon } from "@/components/mobile-screen";
import { collectDisplayImageUrls } from "@/lib/image-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VendorCandidateView } from "@/lib/types";

type VendorReaction = "liked" | "disliked" | null;

export default function VenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<VendorCandidateView[]>([]);
  const [reactions, setReactions] = useState<Record<string, VendorReaction>>({});
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadVenues() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/404");
        return;
      }

      const response = await fetch("/api/vendors?category=venue", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as { candidates: VendorCandidateView[] };
        const nextVenues = result.candidates ?? [];
        setVenues(nextVenues);
        syncVenueReactions(nextVenues, setReactions);
      }

      setIsLoading(false);
    }

    void loadVenues();
  }, [router]);

  useEffect(() => {
    const handleFocus = () => syncVenueReactions(venues, setReactions);
    handleFocus();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
    };
  }, [venues]);

  const orderedVenues = useMemo(() => {
    return [...venues].sort((left, right) => {
      const leftRank = getReactionRank(reactions[left.slug] ?? null);
      const rightRank = getReactionRank(reactions[right.slug] ?? null);
      if (leftRank !== rightRank) return leftRank - rightRank;
      const leftHasImage = Boolean(getVenueImage(left, failedImages));
      const rightHasImage = Boolean(getVenueImage(right, failedImages));
      if (leftHasImage !== rightHasImage) return leftHasImage ? -1 : 1;
      return (right.rating ?? 0) - (left.rating ?? 0);
    });
  }, [failedImages, reactions, venues]);

  function markImageUnavailable(image: string) {
    setFailedImages((current) => (current.includes(image) ? current : [...current, image]));
  }

  return (
    <AppShell active="vendors" mobileTitle="Lieux">
      <section className="rounded-[32px] bg-white p-5 shadow-[0_10px_30px_rgba(46,28,54,0.06)] sm:p-8">
        <div className="flex items-center gap-4">
          <Link
            href="/vendors"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[var(--hada-navy)]"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </Link>
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Recommandations Hada</p>
            <h1 className="mt-1 text-[30px] font-bold tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[40px]">Lieux</h1>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse overflow-hidden rounded-[28px] border border-[#ddd4cf] bg-white shadow-[0_8px_20px_rgba(83,63,68,0.08)]">
                <div className="h-[240px] bg-[linear-gradient(135deg,#fff4f1,#f6eeea,#fff8f5)] sm:h-[280px]" />
                <div className="p-5">
                  <div className="h-7 w-40 rounded-full bg-[#f4ebe6]" />
                  <div className="mt-3 h-5 w-28 rounded-full bg-[#f1e7e2]" />
                  <div className="mt-4 h-16 rounded-[20px] bg-[#faf2ee]" />
                </div>
              </div>
            ))}
          </div>
        ) : venues.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-[#eadfda] bg-[#fffaf8] p-6">
            <p className="text-[20px] font-semibold text-[var(--hada-navy)]">Aucun lieu pour le moment</p>
            <p className="mt-2 text-[16px] leading-7 text-[#756f88]">
              Demande à Hada dans le chat de chercher un lieu pour ton mariage, puis reviens ici.
            </p>
            <Link
              href="/chat"
              className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
            >
              Retour au chat
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {orderedVenues.map((venue) => {
              const reaction = reactions[venue.slug] ?? null;
              return (
                <Link key={venue.id} href={`/venues/${venue.slug}`} className="block">
                  <article className="overflow-hidden rounded-[28px] border border-[#ddd4cf] bg-white shadow-[0_8px_20px_rgba(83,63,68,0.08)]">
                    <div className="relative">
                      <VendorImage src={getVenueImage(venue, failedImages) ?? "/venue-olive.svg"} alt={getVenueName(venue)} className="h-[240px] w-full object-cover sm:h-[280px]" onUnavailable={markImageUnavailable} />
                      <div
                        className={`absolute left-4 top-4 inline-flex h-10 min-w-[40px] items-center justify-center rounded-full px-3 text-[16px] font-semibold shadow-[0_10px_24px_rgba(46,28,54,0.14)] ${
                          reaction === "liked"
                            ? "bg-[#fff0f1] text-[var(--hada-coral)]"
                            : reaction === "disliked"
                              ? "bg-[#fff1f1] text-[#d94b58]"
                              : "hidden"
                        }`}
                      >
                        <span aria-hidden="true">{reaction === "liked" ? "♡" : "👎"}</span>
                      </div>
                    </div>
                    <div className="p-5">
                      <h2 className="text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--hada-navy)]">{getVenueName(venue)}</h2>
                      <p className="mt-1 text-[18px] leading-[1.35] tracking-[-0.02em] text-[#756f88]">{getVenueLocation(venue)}</p>
                      <p className="mt-3 text-[15px] leading-6 text-[#6f687e]">{getVenueSummary(venue)}</p>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function syncVenueReactions(venues: VendorCandidateView[], setReactions: (value: Record<string, VendorReaction>) => void) {
  if (typeof window === "undefined") return;

  const nextReactions = venues.reduce<Record<string, VendorReaction>>((accumulator, venue) => {
    accumulator[venue.slug] = (window.localStorage.getItem(`hada-reaction:${venue.slug}`) as VendorReaction) ?? null;
    return accumulator;
  }, {});

  setReactions(nextReactions);
}

function getReactionRank(reaction: VendorReaction) {
  if (reaction === "liked") return 0;
  if (reaction === "disliked") return 2;
  return 1;
}

function getVenueImage(venue: VendorCandidateView, failedImages: string[] = []) {
  return (
    collectDisplayImageUrls([...(venue.vendorProfile?.media.photos ?? []), venue.image, ...(venue.images ?? [])], venue.website ?? venue.sourceUrl, 8).find(
      (image) => !failedImages.includes(image)
    ) ?? null
  );
}

function getVenueName(venue: VendorCandidateView) {
  return venue.vendorProfile?.identity.name ?? venue.name;
}

function getVenueLocation(venue: VendorCandidateView) {
  return venue.vendorProfile?.identity.location_label ?? venue.city ?? venue.region ?? "France";
}

function getVenueSummary(venue: VendorCandidateView) {
  return venue.vendorProfile?.summary.about ?? venue.summary ?? "Fiche prestataire enrichie par Hada.";
}

function VendorImage({ src, alt, className, onUnavailable }: { src: string; alt: string; className: string; onUnavailable?: (src: string) => void }) {
  const [isBroken, setIsBroken] = useState(false);

  if (isBroken) {
    return <div aria-label={alt} className={`flex items-center justify-center bg-[linear-gradient(135deg,#fff4f1,#f6eeea,#fff8f5)] ${className}`} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setIsBroken(true);
        onUnavailable?.(src);
      }}
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth < 220 || image.naturalHeight < 160) {
          setIsBroken(true);
          onUnavailable?.(src);
        }
      }}
    />
  );
}

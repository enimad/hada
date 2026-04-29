"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArrowLeftIcon } from "@/components/mobile-screen";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VendorCandidateView } from "@/lib/types";

export default function VenuesPage() {
  const [venues, setVenues] = useState<VendorCandidateView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadVenues() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/vendors?category=venue", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as { candidates: VendorCandidateView[] };
        setVenues(result.candidates ?? []);
      }

      setIsLoading(false);
    }

    loadVenues();
  }, []);

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
            <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Recommendations Hada</p>
            <h1 className="mt-1 text-[30px] font-bold tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[40px]">Lieux</h1>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-8 text-[16px] text-[#8d8380]">Hada prepare vos lieux...</p>
        ) : venues.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-[#eadfda] bg-[#fffaf8] p-6">
            <p className="text-[20px] font-semibold text-[var(--hada-navy)]">Aucun lieu pour le moment</p>
            <p className="mt-2 text-[16px] leading-7 text-[#756f88]">
              Demande a Hada dans le chat de chercher un lieu pour ton mariage, puis reviens ici.
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
            {venues.map((venue) => (
              <Link key={venue.id} href={`/venues/${venue.slug}`} className="block">
                <article className="overflow-hidden rounded-[28px] border border-[#ddd4cf] bg-white shadow-[0_8px_20px_rgba(83,63,68,0.08)] transition hover:-translate-y-0.5">
                  <div className="relative">
                    <Image src={venue.image ?? "/venue-olive.svg"} alt={venue.name} width={420} height={320} className="h-[240px] w-full object-cover sm:h-[280px]" />
                    <div className="absolute right-4 top-4 flex items-center gap-2 rounded-[18px] bg-white px-4 py-2 text-[16px] font-semibold text-[var(--hada-navy)]">
                      <span className="text-[var(--hada-gold)]">★</span>
                      <span>{venue.rating?.toFixed(1) ?? "4.8"}</span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h2 className="text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--hada-navy)]">{venue.name}</h2>
                    <p className="mt-1 text-[18px] leading-[1.35] tracking-[-0.02em] text-[#756f88]">{venue.city ?? venue.region ?? "France"}</p>
                    <p className="mt-3 text-[15px] leading-6 text-[#6f687e]">{venue.summary}</p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

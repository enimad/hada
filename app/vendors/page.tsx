"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VendorCandidateView, VendorCategory } from "@/lib/types";

type CategorySummary = {
  key: VendorCategory;
  label: string;
  count: number;
};

export default function VendorsPage() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [candidates, setCandidates] = useState<VendorCandidateView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadVendors() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/vendors", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as {
          categories: CategorySummary[];
          candidates: VendorCandidateView[];
        };
        setCategories(result.categories ?? []);
        setCandidates(result.candidates ?? []);
      }

      setIsLoading(false);
    }

    loadVendors();
  }, []);

  const venueCandidates = candidates.filter((candidate) => candidate.category === "venue");

  return (
    <AppShell active="vendors" mobileTitle="Prestataires">
      <section className="rounded-[32px] bg-white p-5 shadow-[0_10px_30px_rgba(46,28,54,0.06)] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Mes prestataires</p>
            <h1 className="mt-3 text-[30px] font-bold tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[40px]">
              Ma selection de prestataires
            </h1>
          </div>

          <div className="flex h-14 w-full items-center rounded-full border border-[#cfc2bb] bg-white px-5 text-[16px] font-medium text-[#8d8380] lg:max-w-[360px]">
            Rechercher une annonce...
          </div>
        </div>

        {isLoading ? (
          <p className="mt-8 text-[16px] text-[#8d8380]">Hada charge vos prestataires...</p>
        ) : candidates.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-[#eadfda] bg-[#fffaf8] p-6">
            <p className="text-[20px] font-semibold text-[var(--hada-navy)]">Aucun prestataire genere pour le moment</p>
            <p className="mt-2 text-[16px] leading-7 text-[#756f88]">
              Lance une recherche dans le chat Hada en demandant par exemple un lieu pour commencer.
            </p>
            <Link
              href="/chat"
              className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
            >
              Aller au chat
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <Link href="/venues">
              <article className="rounded-[28px] border border-[#f1e7e2] bg-[#fffdfb] p-3 shadow-[0_8px_24px_rgba(46,28,54,0.05)] transition hover:-translate-y-0.5">
                <div className="overflow-hidden rounded-[24px] bg-white">
                  <Image
                    src={venueCandidates[0]?.image ?? "/venue-olive.svg"}
                    alt="Lieux"
                    width={420}
                    height={320}
                    className="h-[220px] w-full object-cover sm:h-[240px]"
                  />
                </div>
                <p className="mt-4 text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--hada-navy)]">Lieux</p>
                <p className="mt-1 text-[18px] font-medium tracking-[-0.03em] text-[#85807f]">{venueCandidates.length} enregistres</p>
              </article>
            </Link>

            {categories
              .filter((item) => item.key !== "venue")
              .map((item) => (
                <article key={item.key} className="rounded-[28px] border border-[#f1e7e2] bg-[#fffdfb] p-3 shadow-[0_8px_24px_rgba(46,28,54,0.05)]">
                  <div className="flex h-[220px] items-center justify-center rounded-[24px] bg-[#fff7f4] text-[74px] text-[#d9c5c0] sm:h-[240px]">♡</div>
                  <p className="mt-4 text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--hada-navy)]">{item.label}</p>
                  <p className="mt-1 text-[18px] font-medium tracking-[-0.03em] text-[#85807f]">{item.count} enregistre</p>
                </article>
              ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

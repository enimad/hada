"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ArrowLeftIcon } from "@/components/mobile-screen";
import { collectDisplayImageUrls } from "@/lib/image-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getVendorCategories } from "@/lib/vendor-catalog";
import type { VendorCandidateView, VendorCategory } from "@/lib/types";

type CategorySummary = {
  key: VendorCategory;
  label: string;
  count: number;
};

type VendorReaction = "liked" | "disliked" | null;

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <AppShell active="vendors" mobileTitle="Prestataires">
          <section className="rounded-[32px] bg-white p-5 shadow-[0_10px_30px_rgba(46,28,54,0.06)] sm:p-8">
            <LoadingGrid />
          </section>
        </AppShell>
      }
    >
      <VendorsPageContent />
    </Suspense>
  );
}

function VendorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category") as VendorCategory | null;
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [candidates, setCandidates] = useState<VendorCandidateView[]>([]);
  const [reactions, setReactions] = useState<Record<string, VendorReaction>>({});
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadVendors() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/404");
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
        const nextCandidates = result.candidates ?? [];
        setCategories(result.categories ?? []);
        setCandidates(nextCandidates);
        syncReactions(nextCandidates, setReactions);
      } else {
        setCategories(getVendorCategories().map((item) => ({ ...item, count: 0 })));
      }

      setIsLoading(false);
    }

    void loadVendors();
  }, [router]);

  useEffect(() => {
    const handleFocus = () => syncReactions(candidates, setReactions);
    handleFocus();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
    };
  }, [candidates]);

  const selectedCategoryMeta = useMemo(
    () => getVendorCategories().find((item) => item.key === selectedCategory) ?? null,
    [selectedCategory]
  );
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.key, item.count])), [categories]);

  const selectedCandidates = useMemo(() => {
    if (!selectedCategory) return [];
    return [...candidates.filter((candidate) => candidate.category === selectedCategory)].sort((left, right) =>
      compareCandidatePriority(left, right, reactions, failedImages)
    );
  }, [candidates, failedImages, reactions, selectedCategory]);

  const orderedCategories = useMemo(() => {
    return [...getVendorCategories()].sort((left, right) => {
      const leftPriority = getCategoryPriority(left.key, candidates, categoryMap, reactions);
      const rightPriority = getCategoryPriority(right.key, candidates, categoryMap, reactions);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const rightCount = categoryMap.get(right.key) ?? 0;
      const leftCount = categoryMap.get(left.key) ?? 0;
      return rightCount - leftCount;
    });
  }, [candidates, categoryMap, reactions]);

  function markImageUnavailable(image: string) {
    setFailedImages((current) => (current.includes(image) ? current : [...current, image]));
  }

  return (
    <AppShell active="vendors" mobileTitle="Prestataires">
      <section className="rounded-[32px] bg-white p-5 shadow-[0_10px_30px_rgba(46,28,54,0.06)] sm:p-8">
        {selectedCategoryMeta ? (
          <>
            <div className="flex items-center gap-4">
              <Link
                href="/vendors"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]"
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </Link>
              <div>
                <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Mes prestataires</p>
                <h1 className="mt-2 text-[30px] font-bold tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[40px]">
                  {selectedCategoryMeta.label}
                </h1>
              </div>
            </div>

            {isLoading ? <LoadingGrid className="mt-8" cardCount={4} /> : null}

            {!isLoading && selectedCandidates.length === 0 ? (
              <div className="mt-8 rounded-[28px] border border-dashed border-[#eadfda] bg-[#fffaf8] p-6">
                <p className="text-[20px] font-semibold text-[var(--hada-navy)]">Aucun prestataire dans cette catégorie</p>
                <p className="mt-2 text-[16px] leading-7 text-[#756f88]">
                  Demandez cette catégorie dans le chat Hada et je la remplirai ici.
                </p>
              </div>
            ) : null}

            {!isLoading ? (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {selectedCandidates.map((candidate) => {
                  const reaction = reactions[candidate.slug] ?? null;
                  return (
                    <Link key={candidate.id} href={candidate.category === "venue" ? `/venues/${candidate.slug}` : `/vendors/${candidate.slug}`} className="block">
                      <article className="overflow-hidden rounded-[28px] border border-[#ddd4cf] bg-white shadow-[0_8px_20px_rgba(83,63,68,0.08)]">
                        <div className="relative">
                          {getCandidateImage(candidate, failedImages) ? (
                            <VendorImage
                              src={getCandidateImage(candidate, failedImages) as string}
                              alt={getCandidateName(candidate)}
                              className="h-[220px] w-full object-cover sm:h-[240px]"
                              onUnavailable={markImageUnavailable}
                            />
                          ) : (
                            <div className="flex h-[220px] items-center justify-center bg-[#f7efeb] text-[#d2c3bc] sm:h-[240px]">
                              <span className="text-[74px]">♡</span>
                            </div>
                          )}
                          <ReactionBadge reaction={reaction} />
                        </div>
                        <div className="p-5">
                          <p className="text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--hada-navy)]">{getCandidateName(candidate)}</p>
                          <p className="mt-2 text-[18px] text-[#7b7590]">{getCandidateLocation(candidate)}</p>
                          <p className="mt-4 text-[16px] leading-7 text-[#6d6475]">{getCandidateSummary(candidate)}</p>
                        </div>
                      </article>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">Mes prestataires</p>
              <h1 className="mt-3 text-[30px] font-bold tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[40px]">
                Ma sélection de prestataires
              </h1>
            </div>

            {isLoading ? (
              <LoadingGrid className="mt-8" cardCount={6} />
            ) : candidates.length === 0 ? (
              <div className="mt-8 rounded-[28px] border border-dashed border-[#eadfda] bg-[#fffaf8] p-6">
                <p className="text-[20px] font-semibold text-[var(--hada-navy)]">Aucun prestataire généré pour le moment</p>
                <p className="mt-2 text-[16px] leading-7 text-[#756f88]">
                  Lancez une recherche dans le chat Hada en demandant par exemple un lieu, un traiteur ou un photographe.
                </p>
                <Link
                  href="/chat"
                  className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
                >
                  Aller au chat
                </Link>
              </div>
            ) : null}

            {!isLoading ? (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {orderedCategories.map((category) => {
                  const count = categoryMap.get(category.key) ?? 0;
                  const isFilled = count > 0;
                  const href = isFilled ? (category.key === "venue" ? "/venues" : `/vendors?category=${category.key}`) : null;
                  const heroCandidate = getCategoryHeroCandidate(category.key, candidates, reactions, failedImages);

                  const card = (
                    <article
                      className={`rounded-[28px] border p-3 shadow-[0_8px_24px_rgba(46,28,54,0.05)] ${
                        isFilled ? "border-[#f1e7e2] bg-[#fffdfb]" : "border-[#eee7e3] bg-[#faf7f5]"
                      }`}
                    >
                      <div className={`relative overflow-hidden rounded-[24px] ${isFilled ? "bg-white" : "bg-[#f3ece8]"}`}>
                        {heroCandidate && getCandidateImage(heroCandidate, failedImages) ? (
                          <VendorImage
                            src={getCandidateImage(heroCandidate, failedImages) as string}
                            alt={getCandidateName(heroCandidate)}
                            className="h-[220px] w-full object-cover sm:h-[240px]"
                            onUnavailable={markImageUnavailable}
                          />
                        ) : (
                          <div className={`flex h-[220px] items-center justify-center sm:h-[240px] ${isFilled ? "bg-[#fff7f4]" : "bg-[#f3ece8]"} text-[#d2c3bc]`}>
                            <span className="text-[74px]">♡</span>
                          </div>
                        )}
                      </div>
                      <p className={`mt-4 text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] ${isFilled ? "text-[var(--hada-navy)]" : "text-[#8f8582]"}`}>
                        {category.label}
                      </p>
                      <p className="mt-1 text-[18px] font-medium tracking-[-0.03em] text-[#85807f]">
                        {count} {count > 1 ? "enregistrés" : "enregistré"}
                      </p>
                    </article>
                  );

                  if (href) {
                    return (
                      <Link key={category.key} href={href}>
                        {card}
                      </Link>
                    );
                  }

                  return <div key={category.key}>{card}</div>;
                })}
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

function syncReactions(candidates: VendorCandidateView[], setReactions: (value: Record<string, VendorReaction>) => void) {
  if (typeof window === "undefined") return;

  const nextReactions = candidates.reduce<Record<string, VendorReaction>>((accumulator, candidate) => {
    accumulator[candidate.slug] = (window.localStorage.getItem(`hada-reaction:${candidate.slug}`) as VendorReaction) ?? null;
    return accumulator;
  }, {});

  setReactions(nextReactions);
}

function compareCandidatePriority(left: VendorCandidateView, right: VendorCandidateView, reactions: Record<string, VendorReaction>, failedImages: string[] = []) {
  const leftRank = getReactionRank(reactions[left.slug] ?? null);
  const rightRank = getReactionRank(reactions[right.slug] ?? null);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftHasImage = Boolean(getCandidateImage(left, failedImages));
  const rightHasImage = Boolean(getCandidateImage(right, failedImages));
  if (leftHasImage !== rightHasImage) return leftHasImage ? -1 : 1;

  return (right.rating ?? 0) - (left.rating ?? 0);
}

function getReactionRank(reaction: VendorReaction) {
  if (reaction === "liked") return 0;
  if (reaction === "disliked") return 2;
  return 1;
}

function getCategoryReaction(category: VendorCategory, candidates: VendorCandidateView[], reactions: Record<string, VendorReaction>) {
  const categoryCandidates = candidates.filter((candidate) => candidate.category === category);
  if (categoryCandidates.some((candidate) => reactions[candidate.slug] === "liked")) {
    return "liked";
  }

  const activeCandidates = categoryCandidates.filter((candidate) => Boolean(reactions[candidate.slug]));
  if (activeCandidates.length > 0 && activeCandidates.every((candidate) => reactions[candidate.slug] === "disliked")) {
    return "disliked";
  }

  return null;
}

function getCategoryHeroCandidate(category: VendorCategory, candidates: VendorCandidateView[], reactions: Record<string, VendorReaction>, failedImages: string[]) {
  const categoryCandidates = candidates.filter((candidate) => candidate.category === category);
  return (
    categoryCandidates.find((candidate) => reactions[candidate.slug] === "liked" && getCandidateImage(candidate, failedImages)) ??
    [...categoryCandidates].sort((left, right) => compareCandidatePriority(left, right, reactions, failedImages)).find((candidate) => getCandidateImage(candidate, failedImages)) ??
    null
  );
}

function getCandidateImage(candidate: VendorCandidateView, failedImages: string[] = []) {
  return (
    collectDisplayImageUrls([...(candidate.vendorProfile?.media.photos ?? []), candidate.image, ...(candidate.images ?? [])], candidate.website ?? candidate.sourceUrl, 8).find(
      (image) => !failedImages.includes(image)
    ) ?? null
  );
}

function getCandidateName(candidate: VendorCandidateView) {
  return candidate.vendorProfile?.identity.name ?? candidate.name;
}

function getCandidateLocation(candidate: VendorCandidateView) {
  return candidate.vendorProfile?.identity.location_label ?? candidate.city ?? candidate.region ?? "France";
}

function getCandidateSummary(candidate: VendorCandidateView) {
  return candidate.vendorProfile?.summary.about ?? candidate.summary ?? "Fiche prestataire enrichie par Hada.";
}

function getCategoryPriority(
  category: VendorCategory,
  candidates: VendorCandidateView[],
  categoryMap: Map<VendorCategory, number>,
  reactions: Record<string, VendorReaction>
) {
  const count = categoryMap.get(category) ?? 0;
  const reaction = getCategoryReaction(category, candidates, reactions);

  if (reaction === "liked") return 0;
  if (count > 0) return 1;
  if (count === 0) return 2;
  return 3;
}

function ReactionBadge({ reaction, className = "left-4 top-4" }: { reaction: VendorReaction; className?: string }) {
  if (!reaction) return null;

  const isLiked = reaction === "liked";
  return (
    <div
      className={`absolute ${className} inline-flex h-10 min-w-[40px] items-center justify-center rounded-full px-3 text-[16px] font-semibold shadow-[0_10px_24px_rgba(46,28,54,0.14)] ${
        isLiked ? "bg-[#fff0f1] text-[var(--hada-coral)]" : "bg-[#fff1f1] text-[#d94b58]"
      }`}
    >
      <span aria-hidden="true">{isLiked ? "♡" : "👎"}</span>
    </div>
  );
}

function LoadingGrid({ className = "", cardCount = 3 }: { className?: string; cardCount?: number }) {
  return (
    <div className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 ${className}`.trim()}>
      {Array.from({ length: cardCount }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-[28px] border border-[#f1e7e2] bg-[#fffdfb] p-3 shadow-[0_8px_24px_rgba(46,28,54,0.05)]">
          <div className="h-[220px] rounded-[24px] bg-[linear-gradient(135deg,#fff4f1,#f6eeea,#fff8f5)] sm:h-[240px]" />
          <div className="mt-4 h-7 w-32 rounded-full bg-[#f4ebe6]" />
          <div className="mt-3 h-5 w-24 rounded-full bg-[#f1e7e2]" />
        </div>
      ))}
    </div>
  );
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

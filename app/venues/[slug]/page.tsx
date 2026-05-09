"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ArrowLeftIcon, ThumbsDownIcon, ThumbsUpIcon } from "@/components/mobile-screen";
import { SurveyExitGuard } from "@/components/survey-exit-guard";
import { collectDisplayImageUrls } from "@/lib/image-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VendorCandidateView } from "@/lib/types";

const BETA_TOAST = "Cette fonctionnalité n'est pas disponible en version bêta.";

type EmailFallback = {
  to: string;
  subject: string;
  body: string;
};

type PreparedContact = {
  mailtoUrl: string;
  emailDraft: EmailFallback | null;
};

type InfoItem = {
  title: string;
  value: string;
};

type CandidateInfoItem = {
  title: string;
  value: string | null | undefined;
  allowPlaceholder?: boolean;
};

export default function VenueDetailPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [venue, setVenue] = useState<VendorCandidateView | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [contactMessage, setContactMessage] = useState("");
  const [emailFallback, setEmailFallback] = useState<EmailFallback | null>(null);
  const [preparedContact, setPreparedContact] = useState<PreparedContact | null>(null);
  const [reaction, setReaction] = useState<"liked" | "disliked" | null>(null);
  const [betaToast, setBetaToast] = useState("");
  const hiddenMailtoRef = useRef<HTMLAnchorElement | null>(null);

  const infoItems = useMemo(() => dedupeInfoItems(buildVenueProfileInfoItems(venue)), [venue]);
  const websiteUrl = useMemo(() => getDisplayWebsite(venue), [venue]);
  const reviewSearchUrl = venue?.vendorProfile?.reviews.google_reviews_url ?? venue?.reviewSearchUrl ?? buildReviewSearchUrl(venue);
  const displayName = venue?.vendorProfile?.identity.name ?? venue?.name;
  const displayLocation = venue?.vendorProfile?.identity.location_label ?? venue?.city ?? venue?.region ?? "France";
  const about = venue?.vendorProfile?.summary.about ?? venue?.summary ?? "Fiche prestataire enrichie par Hada.";
  const strengths = dedupeDisplayStrings(venue?.vendorProfile?.summary.strengths ?? venue?.highlights ?? []);

  useEffect(() => {
    if (!betaToast) return;
    const timer = window.setTimeout(() => setBetaToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [betaToast]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadVenue() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/404");
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
        const nextVenue = result.candidates?.[0] ?? null;
        setVenue(nextVenue);
        if (nextVenue && typeof window !== "undefined") {
          setReaction(window.localStorage.getItem(`hada-reaction:${nextVenue.slug}`) as "liked" | "disliked" | null);
        }
      }

      setIsLoading(false);
    }

    void loadVenue();
  }, [router, slug]);

  useEffect(() => {
    if (!accessToken || !venue) return;

    let isMounted = true;
    const venueId = venue.id;

    async function prepareContact() {
      const response = await fetch("/api/vendors/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ candidateId: venueId, preview: true })
      });

      if (!response.ok || !isMounted) return;

      const result = (await response.json()) as PreparedContact;
      if (isMounted) setPreparedContact(result);
    }

    void prepareContact();

    return () => {
      isMounted = false;
    };
  }, [accessToken, venue]);

  function openMailClient(mailtoUrl: string) {
    if (hiddenMailtoRef.current) {
      hiddenMailtoRef.current.href = mailtoUrl;
      hiddenMailtoRef.current.click();
    }

    try {
      window.location.href = mailtoUrl;
      return;
    } catch {}

    try {
      window.location.assign(mailtoUrl);
    } catch {}
  }

  async function handleContact() {
    if (!accessToken || !venue) return;

    if (preparedContact?.emailDraft) {
      setEmailFallback(preparedContact.emailDraft);
    }

    if (preparedContact?.mailtoUrl) {
      setContactMessage("Email préparé. Votre boîte mail va s'ouvrir.");
      openMailClient(preparedContact.mailtoUrl);
    } else {
      setContactMessage("Préparation de l'email...");
    }

    const response = await fetch("/api/vendors/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ candidateId: venue.id })
    });

    const result = (await response.json()) as PreparedContact & { error?: string };
    if (!response.ok) {
      setContactMessage(result.error ?? "Impossible de préparer l'email.");
      return;
    }

    setPreparedContact(result);
    setEmailFallback(result.emailDraft ?? null);

    if (!preparedContact?.mailtoUrl) {
      setContactMessage("Email préparé. Votre boîte mail va s'ouvrir.");
      openMailClient(result.mailtoUrl);
    }
  }

  async function handleCopyEmail() {
    if (!emailFallback) return;

    const payload = `À : ${emailFallback.to}\nObjet : ${emailFallback.subject}\n\n${emailFallback.body}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setContactMessage("Email copié.");
        return;
      }
    } catch {}

    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const didCopy = document.execCommand("copy");
    document.body.removeChild(textarea);
    setContactMessage(didCopy ? "Email copié." : "Copie impossible. Sélectionnez le texte manuellement.");
  }

  function updateReaction(nextReaction: "liked" | "disliked") {
    if (!venue) return;

    const value = reaction === nextReaction ? null : nextReaction;
    setReaction(value);
    if (typeof window !== "undefined") {
      if (value) {
        window.localStorage.setItem(`hada-reaction:${venue.slug}`, value);
      } else {
        window.localStorage.removeItem(`hada-reaction:${venue.slug}`);
      }
    }
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
          <Link href="/venues" className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white">
            Retour aux lieux
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="vendors" mobileTitle={displayName}>
      <SurveyExitGuard sourceVendorSlug={venue.slug} />
      <article className="overflow-hidden rounded-[32px] bg-white shadow-[0_10px_30px_rgba(46,28,54,0.06)]">
        <a ref={hiddenMailtoRef} href={preparedContact?.mailtoUrl ?? "#"} className="hidden" aria-hidden="true">
          Mailto
        </a>

        <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-8">
          <Link href="/venues" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]">
            <ArrowLeftIcon className="h-6 w-6" />
          </Link>
          <button type="button" onClick={() => setBetaToast(BETA_TOAST)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]" aria-label="Partager">
            <ShareModernIcon className="h-5 w-5" />
          </button>
        </div>

        <ImageCarousel vendor={venue} />

        <div className="p-5 sm:p-8">
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-[28px] font-bold tracking-[-0.04em] text-[var(--hada-navy)] sm:text-[34px]">{displayName}</h1>
              <p className="mt-1 text-[18px] text-[#7b7590]">{displayLocation}</p>
            </div>
            <div className="flex items-center gap-3">
              <ReactionButton label="J'aime" active={reaction === "liked"} onClick={() => updateReaction("liked")} icon={<ThumbsUpIcon className="h-4 w-4" />} />
              <ReactionButton label="Je passe" active={reaction === "disliked"} onClick={() => updateReaction("disliked")} icon={<ThumbsDownIcon className="h-4 w-4" />} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {infoItems.map((item) => (
              <InfoCard key={item.title} title={item.title} value={item.value} />
            ))}
          </div>

          <button type="button" onClick={handleContact} className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[var(--hada-coral)] text-[18px] font-semibold text-white sm:h-16 sm:max-w-[280px]">
            Contacter
          </button>
          {contactMessage ? <p className="mt-3 text-[14px] font-medium text-[var(--hada-coral)]">{contactMessage}</p> : null}

          {emailFallback ? (
            <div className="mt-4 rounded-[22px] border border-[#eadfda] bg-[#fff8f6] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8f87a2]">Plan B</p>
                  <p className="mt-1 text-[15px] font-medium text-[var(--hada-navy)]">Copier le mail si votre boîte ne s'ouvre pas</p>
                </div>
                <button type="button" onClick={handleCopyEmail} className="inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-[14px] font-semibold text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]">
                  Copier
                </button>
              </div>
              <div className="mt-4 rounded-[18px] bg-white p-4 text-[14px] leading-6 text-[#5f576d]">
                <p>
                  <span className="font-semibold text-[var(--hada-navy)]">À :</span> {emailFallback.to || "Email non détecté"}
                </p>
                <p className="mt-2">
                  <span className="font-semibold text-[var(--hada-navy)]">Objet :</span> {emailFallback.subject}
                </p>
                <p className="mt-3 whitespace-pre-line">{emailFallback.body}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <div>
              <SectionTitle title="À propos" />
              <p className="mt-3 text-[17px] leading-8 text-[#61596f] sm:text-[18px]">{about}</p>

              {strengths.length > 0 ? (
                <>
                  <SectionTitle title="Points forts" />
                  <div className="mt-4 flex flex-wrap gap-3">
                    {strengths.map((highlight) => (
                      <span key={highlight} className="rounded-full bg-[#fff0f1] px-4 py-2 text-[14px] font-medium text-[var(--hada-coral)]">
                        {formatDisplayValue(highlight)}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}

              <ContactList vendor={venue} websiteUrl={websiteUrl} />
            </div>

            <div>
              {reviewSearchUrl ? (
                <>
                  <SectionTitle title="Avis" />
                  <ActionLinkCard
                    href={reviewSearchUrl}
                    label="Voir les avis Google"
                    variant="navy"
                  />
                </>
              ) : null}
              <AddressBlock vendor={venue} />
            </div>
          </div>
        </div>
      </article>
      <BetaToast message={betaToast} />
    </AppShell>
  );
}

function buildInfoItems(venue: VendorCandidateView | null): InfoItem[] {
  if (!venue) return [];

  return [
    { title: "Tarifs", value: venue.priceRange ?? "Sur demande" },
    { title: "Capacité", value: venue.capacity ?? "À confirmer" },
    { title: "Style", value: venue.vibe ?? venue.specialties ?? "À définir" },
    { title: "Zone", value: venue.zoneIntervention ?? venue.city ?? venue.region ?? "À confirmer" }
  ];
}

function buildVenueProfileInfoItems(venue: VendorCandidateView | null): CandidateInfoItem[] {
  if (!venue) return [];

  const profile = venue.vendorProfile;
  const specific = profile?.category_specific ?? {};
  const strengths = nonEmptyArray(profile?.summary.strengths) ?? venue.highlights ?? [];
  const styleHints = pickTaggedValue(strengths, ["champ", "nature", "boh", "romant", "eleg", "élég", "raffin", "intim", "moderne", "vue", "jardin", "eau"]);
  const venueTypeHints = pickTaggedValue(strengths, ["domaine", "chateau", "château", "salle", "orangerie", "ferme", "bastide", "villa", "mas", "grange"]);

  return [
    { title: "Tarifs", value: profile?.logistics.price_range ?? venue.priceRange ?? "Sur demande" },
    {
      title: "Capacité",
      value: specificValueAny(specific, ["capacite", "capacity", "capacite_max", "capacite_invites", "capacite_assise"]) ?? profile?.logistics.capacity ?? venue.capacity
    },
    {
      title: "Type de lieu",
      value: specificValueAny(specific, ["type_lieu", "venue_type", "event_types", "espaces", "service_types"]) ?? venue.vibe ?? venueTypeHints
    },
    {
      title: "Style",
      value: specificValueAny(specific, ["style", "ambiance", "style_lieu", "atmosphere", "specialites"]) ?? venue.specialties ?? styleHints
    }
  ];
}

function getDisplayWebsite(vendor: VendorCandidateView | null) {
  const rawUrl = vendor?.vendorProfile?.contact.website_url ?? vendor?.vendorProfile?.identity.website_url ?? vendor?.website ?? vendor?.sourceUrl;
  if (!rawUrl) return null;

  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    return host === "example.com" ? null : rawUrl;
  } catch {
    return null;
  }
}

function buildReviewSearchUrl(vendor: VendorCandidateView | null) {
  if (!vendor) return null;
  const query = `${vendor.vendorProfile?.identity.name ?? vendor.name} lieu ${vendor.vendorProfile?.identity.location_label ?? vendor.city ?? vendor.region ?? ""} mariage avis Google Maps`;
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
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

function InfoCard({ title, value }: InfoItem) {
  return (
    <div className="rounded-[24px] border border-[#e8ddd7] bg-[#fffdfb] p-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--hada-coral)]">{title}</p>
      <p className="mt-4 text-[19px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">{formatDisplayValue(value)}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mt-10 text-[14px] font-semibold uppercase tracking-[0.18em] text-[var(--hada-navy)]">{title}</h2>;
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#8f87a2]">{title}</p>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 text-[16px] text-[#61596f] sm:text-[18px]">
            <span className="text-[18px] text-[var(--hada-navy)]">•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactList({ vendor, websiteUrl }: { vendor: VendorCandidateView; websiteUrl: string | null }) {
  const items = [
    (vendor.vendorProfile?.contact.email ?? vendor.email) ? <span key="email">{vendor.vendorProfile?.contact.email ?? vendor.email}</span> : null,
    (vendor.vendorProfile?.contact.phone ?? vendor.phone) ? <span key="phone">{vendor.vendorProfile?.contact.phone ?? vendor.phone}</span> : null,
    websiteUrl ? (
      <a key="site" href={websiteUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--hada-coral)] underline underline-offset-2">
        Site web
      </a>
    ) : null
  ].filter(Boolean);

  if (items.length === 0) {
    return (
      <div className="mt-10">
        <InfoList title="Coordonnées" items={["Coordonnées en cours d'enrichissement"]} />
      </div>
    );
  }

  return (
    <div className="mt-10">
      <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#8f87a2]">Coordonnées</p>
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-3 text-[16px] text-[#61596f] sm:text-[18px]">
            <span className="text-[18px] text-[var(--hada-navy)]">•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageCarousel({ vendor }: { vendor: VendorCandidateView }) {
  const sourceImages = useMemo(
    () => collectDisplayImageUrls([...(vendor.vendorProfile?.media.photos ?? []), ...(vendor.images ?? []), vendor.image], vendor.website ?? vendor.sourceUrl, 8),
    [vendor]
  );
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const images = sourceImages.filter((image) => !failedImages.includes(image));

  useEffect(() => {
    setFailedImages([]);
  }, [sourceImages.join("|")]);

  if (images.length === 0) {
    return (
      <div className="px-5 pb-2 sm:px-8">
        <ImageFallback label={vendor.name} className="h-[320px] w-full rounded-[28px] sm:h-[420px] xl:h-[500px]" />
      </div>
    );
  }

  function markImageUnavailable(image: string) {
    setFailedImages((current) => (current.includes(image) ? current : [...current, image]));
  }

  function scrollImage(direction: "previous" | "next") {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const slides = Array.from(scroller.children) as HTMLElement[];
    const currentIndex = slides.reduce((closestIndex, slide, index) => {
      const closestDistance = Math.abs(slides[closestIndex].offsetLeft - scroller.scrollLeft);
      const distance = Math.abs(slide.offsetLeft - scroller.scrollLeft);
      return distance < closestDistance ? index : closestIndex;
    }, 0);
    const nextIndex = direction === "next" ? (currentIndex + 1) % images.length : (currentIndex - 1 + images.length) % images.length;

    scroller.scrollTo({
      left: slides[nextIndex]?.offsetLeft ?? 0,
      behavior: "smooth"
    });
  }

  return (
    <div className="relative px-5 pb-2 sm:px-8">
      <div ref={scrollerRef} className="flex snap-x gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((image, index) => (
          <div key={image} className="min-w-full snap-center overflow-hidden rounded-[28px] bg-[#fff7f4]">
            <VendorImage
              src={image}
              alt={`${vendor.name} - image ${index + 1}`}
              className="h-[320px] w-full object-cover sm:h-[420px] xl:h-[500px]"
              onUnavailable={() => markImageUnavailable(image)}
            />
          </div>
        ))}
      </div>
      {images.length > 1 ? (
        <>
          <CarouselButton direction="previous" onClick={() => scrollImage("previous")} />
          <CarouselButton direction="next" onClick={() => scrollImage("next")} />
        </>
      ) : null}
    </div>
  );
}

function AddressBlock({ vendor }: { vendor: VendorCandidateView }) {
  const queryLocation = vendor.vendorProfile?.logistics.map_query ?? vendor.vendorProfile?.identity.exact_address ?? vendor.address ?? vendor.vendorProfile?.identity.location_label ?? vendor.city ?? vendor.region ?? "";
  if (!queryLocation) return null;

  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${vendor.vendorProfile?.identity.name ?? vendor.name} ${queryLocation}`)}`;

  return (
    <>
      <SectionTitle title="Adresse" />
      <ActionLinkCard href={href} label="Ouvrir sur Google Maps" variant="coral" />
    </>
  );
}

function CarouselButton({ direction, onClick }: { direction: "previous" | "next"; onClick: () => void }) {
  const positionClass = direction === "previous" ? "left-8 sm:left-12" : "right-8 sm:right-12";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/55 bg-white/70 text-[var(--hada-navy)] shadow-[0_14px_30px_rgba(43,33,79,0.18)] backdrop-blur-md transition duration-200 hover:scale-105 hover:bg-white/90 ${positionClass}`}
      aria-label={direction === "previous" ? "Image précédente" : "Image suivante"}
    >
      <CarouselArrowIcon className={`h-5 w-5 ${direction === "previous" ? "rotate-180" : ""}`} />
    </button>
  );
}

function ActionLinkCard({ href, label, variant }: { href: string; label: string; variant: "coral" | "navy" }) {
  const variantClasses =
    variant === "coral"
      ? "bg-[var(--hada-coral)] text-white shadow-[0_14px_30px_rgba(255,96,116,0.24)]"
      : "bg-[var(--hada-navy)] text-white shadow-[0_14px_30px_rgba(43,33,79,0.22)]";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`mt-4 flex min-h-14 w-full items-center justify-between gap-4 rounded-[22px] px-5 py-4 text-[15px] font-semibold transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(46,28,54,0.18)] ${variantClasses}`}
    >
      <span>{label}</span>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/18" aria-hidden="true">
        <ExternalActionIcon className="h-4 w-4" />
      </span>
    </a>
  );
}

function CarouselArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 5l7 7-7 7" />
    </svg>
  );
}

function ExternalActionIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function specificValue(specific: Record<string, string | string[] | null>, key: string) {
  const value = specific[key];
  if (Array.isArray(value)) return joinDisplayValues(value);
  if (typeof value === "string" && value.trim() && isUsefulInfoValue(value)) return formatDisplayValue(value);
  return null;
}

function specificValueAny(specific: Record<string, string | string[] | null>, keys: string[]) {
  for (const key of keys) {
    const value = specificValue(specific, key);
    if (value) return value;
  }

  return null;
}

function joinDisplayValues(values: string[]) {
  const formatted = values.filter((value) => isUsefulInfoValue(value)).map((value) => formatDisplayValue(value)).filter(Boolean);
  if (formatted.length === 0) return null;
  return formatted.slice(0, 4).join(", ");
}

function nonEmptyArray(values: string[] | undefined | null) {
  return Array.isArray(values) && values.length > 0 ? values : null;
}

function pickTaggedValue(values: string[], hints: string[]) {
  const matches = values.filter((value) => {
    const normalized = normalizeDisplayKey(value);
    return isUsefulInfoValue(value) && hints.some((hint) => normalized.includes(normalizeDisplayKey(hint)));
  });

  return joinDisplayValues(matches);
}

function dedupeInfoItems(items: CandidateInfoItem[]) {
  const seen = new Set<string>();
  const result: InfoItem[] = [];

  for (const item of items) {
    if (!item.value || !isUsefulInfoValue(item.value, item.allowPlaceholder)) continue;
    const formatted = formatDisplayValue(item.value);
    const key = normalizeDisplayKey(formatted);
    if (!key || isDuplicateInfoKey(key, seen)) continue;

    seen.add(key);
    result.push({ title: item.title, value: formatted });
  }

  return result.slice(0, 4);
}

function dedupeDisplayStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!isUsefulInfoValue(value)) continue;
    const formatted = formatDisplayValue(value);
    const key = normalizeDisplayKey(formatted);
    if (!key || isDuplicateInfoKey(key, seen)) continue;
    seen.add(key);
    result.push(formatted);
  }

  return result.slice(0, 6);
}

function isDuplicateInfoKey(key: string, seen: Set<string>) {
  for (const previous of seen) {
    if (previous === key) return true;
    if (key.length > 18 && previous.includes(key)) return true;
    if (previous.length > 18 && key.includes(previous)) return true;
  }
  return false;
}

function isUsefulInfoValue(value: string, allowPlaceholder = false) {
  const normalized = normalizeDisplayKey(value);
  if (!normalized) return false;
  if (!allowPlaceholder && ["a confirmer", "a definir", "a preciser", "sur demande", "non detecte", "non disponible"].includes(normalized)) return false;
  if (/(\.\.\.|…)$/.test(value.trim())) return false;
  if (value.length > 140 || value.trim().split(/\s+/).length > 18) return false;
  return true;
}

function normalizeDisplayKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ReviewCard({ review }: { review: { author: string; rating?: number | null; date?: string | null; source?: string | null; text: string } }) {
  const initial = review.author.trim().charAt(0).toUpperCase() || "A";
  const color = pickReviewColor(initial);

  return (
    <div className="rounded-[22px] border border-[#efe5df] bg-[#fffdfb] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full text-[16px] font-semibold text-white" style={{ backgroundColor: color }}>
          {initial}
        </div>
        <div>
          <p className="text-[16px] font-semibold text-[var(--hada-navy)]">{review.author}</p>
          <p className="text-[13px] text-[#8c8290]">{[review.rating ? `${review.rating.toFixed(1)}/5` : null, review.date, review.source].filter(Boolean).join(" • ") || "Avis client"}</p>
        </div>
      </div>
      <p className="mt-4 text-[16px] leading-7 text-[#61596f]">{review.text}</p>
    </div>
  );
}

function pickReviewColor(initial: string) {
  const colors = ["#b67df0", "#efc37a", "#8ab7ff", "#ff9da4", "#86c7b0"];
  return colors[initial.charCodeAt(0) % colors.length];
}

function ReactionButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold ${
        active ? "border-[var(--hada-coral)] bg-[#fff0f1] text-[var(--hada-coral)]" : "border-[#eadfda] bg-white text-[var(--hada-navy)]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BetaToast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-10 z-50 flex justify-center px-4">
      <div className="rounded-full bg-[var(--hada-navy)] px-5 py-3 text-center text-[13px] font-medium text-white shadow-[0_16px_34px_rgba(43,33,79,0.25)]">{message}</div>
    </div>
  );
}

function isPreciseAddress(value: string | null | undefined) {
  return Boolean(value && /\d/.test(value) && value.trim().split(/\s+/).length >= 3);
}

function capitalizeFirst(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase("fr-FR") + trimmed.slice(1);
}

function formatDisplayValue(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  const looksLikeAcronym = /^[A-Z0-9&+\-/ ]+$/.test(trimmed) && trimmed.length <= 5;
  const mostlyUppercase = trimmed === trimmed.toLocaleUpperCase("fr-FR") && /[A-ZÀ-Ÿ]/.test(trimmed) && !looksLikeAcronym;
  const normalized = mostlyUppercase ? trimmed.toLocaleLowerCase("fr-FR") : trimmed;
  return capitalizeFirst(normalized);
}

function VendorImage({ src, alt, className, onUnavailable }: { src: string; alt: string; className: string; onUnavailable?: () => void }) {
  const [isBroken, setIsBroken] = useState(false);

  if (isBroken) {
    return <ImageFallback label={alt} className={className} />;
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
        onUnavailable?.();
      }}
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth < 220 || image.naturalHeight < 160) {
          setIsBroken(true);
          onUnavailable?.();
        }
      }}
    />
  );
}

function ImageFallback({ label, className }: { label: string; className: string }) {
  return (
    <div aria-label={label} className={`flex items-center justify-center bg-[linear-gradient(135deg,#fff4f1,#f5eee9,#fffaf7)] ${className}`}>
      <div className="rounded-full border border-[#eadfda] bg-white/75 px-5 py-3 text-center text-[13px] font-semibold text-[#8f87a2] shadow-[0_10px_24px_rgba(46,28,54,0.08)]">
        Photo en cours d'enrichissement
      </div>
    </div>
  );
}

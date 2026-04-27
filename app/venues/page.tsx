import Image from "next/image";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { venueCards } from "@/lib/mock-data";

export default function VenuesPage() {
  return (
    <Shell
      hideNav
      backHref="/chat"
      title="Nouveaux lieux"
      subtitle="Voici une premiere selection de lieux Hada adaptes a votre demande."
      topSlot={<span className="hada-pill bg-[#fff4e3] text-[var(--hada-gold)]">3 resultats</span>}
    >
      <div className="space-y-5">
        <div className="hada-soft-card p-5">
          <p className="hada-label text-[var(--hada-primary)]">Filtres Hada</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Provence", "120 invites", "Elegant", "Budget moyen"].map((item) => (
              <span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-medium text-[var(--hada-muted)]">
                {item}
              </span>
            ))}
          </div>
        </div>

        {venueCards.map((venue) => (
          <article key={venue.slug} className="hada-card overflow-hidden p-3">
            <div className="overflow-hidden rounded-[22px]">
              <Image src={venue.image} alt={venue.name} width={720} height={460} className="h-[188px] w-full object-cover" />
            </div>

            <div className="space-y-4 px-2 pb-2 pt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hada-label text-[var(--hada-primary)]">{venue.location}</p>
                  <h2 className="mt-2 text-[28px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--hada-ink)]">
                    {venue.name}
                  </h2>
                </div>
                <span className="rounded-full bg-[#fff3f2] px-3 py-2 text-xs font-semibold text-[var(--hada-primary)]">
                  {venue.vibe}
                </span>
              </div>

              <p className="text-sm leading-6 text-[#46373f]">{venue.summary}</p>
              <p className="text-sm font-medium leading-6 text-[var(--hada-ink)]">{venue.match}</p>

              <div className="flex flex-wrap gap-2">
                {[venue.price, venue.capacity, ...venue.tags].map((item) => (
                  <span key={item} className="rounded-full bg-[var(--hada-soft)] px-3 py-2 text-xs font-medium text-[var(--hada-muted)]">
                    {item}
                  </span>
                ))}
              </div>

              <Link href={`/venues/${venue.slug}`} className="hada-primary-button">
                Voir ce lieu
              </Link>
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}

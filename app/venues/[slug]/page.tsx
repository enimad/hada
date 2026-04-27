import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { venueCards } from "@/lib/mock-data";

export default async function VenueDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venue = venueCards.find((item) => item.slug === slug);

  if (!venue) {
    notFound();
  }

  return (
    <Shell
      hideNav
      backHref="/venues"
      title={venue.name}
      subtitle={venue.location}
      topSlot={<span className="hada-pill bg-[#fff0ef] text-[var(--hada-primary)]">Lieu</span>}
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-[26px]">
          <Image src={venue.image} alt={venue.name} width={720} height={460} className="h-[220px] w-full object-cover" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="overflow-hidden rounded-[18px]">
              <Image
                src={venue.image}
                alt={`${venue.name} vue ${item}`}
                width={720}
                height={460}
                className={`h-24 w-full object-cover ${item === 1 ? "" : item === 2 ? "opacity-90" : "opacity-80"}`}
              />
            </div>
          ))}
        </div>

        <section className="hada-soft-card p-5">
          <p className="text-sm leading-6 text-[#46373f]">{venue.summary}</p>
          <div className="mt-4 grid gap-3">
            <InfoBlock label="Capacite" value={venue.capacity} />
            <InfoBlock label="Budget indicatif" value={venue.price} />
            <InfoBlock label="Pourquoi Hada le propose" value={venue.match} />
            <InfoBlock label="Temps de reponse" value={venue.contactLead} />
          </div>
        </section>

        <section className="hada-card p-5">
          <p className="text-sm font-semibold text-[var(--hada-ink)]">Points forts du lieu</p>
          <div className="mt-4 space-y-3">
            {venue.highlights.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-[18px] bg-[var(--hada-soft)] px-4 py-3 text-sm text-[#46373f]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-[var(--hada-primary)]">
                  +
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {venue.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white px-3 py-2 text-xs font-medium text-[var(--hada-muted)]">
                {tag}
              </span>
            ))}
          </div>
        </section>

        <div className="grid gap-3">
          <button className="hada-secondary-button">Ajouter aux favoris</button>
          <Link href={`/messages/${venue.slug}`} className="hada-primary-button">
            Demander plus d&apos;infos
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="hada-card px-4 py-4">
      <p className="hada-label">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--hada-ink)]">{value}</p>
    </div>
  );
}

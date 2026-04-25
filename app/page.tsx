import Link from "next/link";
import { Shell } from "@/components/shell";

const steps = [
  "Creation du compte et collecte des informations du mariage",
  "Recap intelligent dans le chat",
  "Qualification du besoin prestataire",
  "Recherche ciblee et top 5 recommandations",
  "Brouillon de message puis prise de contact"
];

export default function HomePage() {
  return (
    <Shell
      title="Hada transforme un projet de mariage en decisions puis en actions concretes."
      subtitle="Ce MVP est pense pour aider un couple a formaliser son mariage, demander un prestataire et avancer jusqu'au contact avec une experience signee Hada."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-black/10 bg-white/80 p-8 shadow-card backdrop-blur">
          <p className="mb-6 max-w-xl text-lg leading-8 text-black/75">
            Hada commence par comprendre le projet du couple, puis elle se comporte comme une coordinatrice:
            elle reformule, complete les criteres et prepare une recherche prestataire exploitable.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/signup" className="rounded-full bg-ink px-6 py-3 text-sm text-white">
              Commencer le parcours
            </Link>
            <Link href="/chat" className="rounded-full border border-black/10 px-6 py-3 text-sm">
              Voir le chat MVP
            </Link>
          </div>
        </section>

        <aside className="rounded-[28px] bg-[#f7f1e8] p-8 shadow-card">
          <p className="text-xs uppercase tracking-[0.3em] text-clay">Parcours cible</p>
          <ol className="mt-6 space-y-4 text-sm leading-6">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-clay text-xs text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Shell>
  );
}

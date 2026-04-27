import Link from "next/link";
import { HadaPortrait } from "@/components/hada-portrait";
import { Shell } from "@/components/shell";

export default function HomePage() {
  return (
    <Shell hideNav topSlot={<span className="hada-label text-[var(--hada-gold)]">Wedding planner IA</span>}>
      <div className="flex min-h-[700px] flex-col">
        <div className="space-y-5 pt-2 text-center">
          <HadaPortrait size="lg" />
          <div className="space-y-3">
            <p className="hada-label text-[var(--hada-gold)]">Profilage</p>
            <h1 className="text-[34px] font-semibold leading-[1.02] tracking-[-0.055em] text-[var(--hada-ink)]">
              Profilage ?
            </h1>
            <p className="mx-auto max-w-[286px] text-sm leading-6 text-[var(--hada-muted)]">
              Hada apprend a vous connaitre pour trouver les lieux les plus adaptes a votre mariage.
            </p>
          </div>
        </div>

        <div className="hada-soft-card mt-8 p-5">
          <p className="text-sm font-semibold text-[var(--hada-ink)]">Ce que Hada va faire avec vous</p>
          <div className="mt-4 space-y-3">
            {[
              "Comprendre votre mariage en quelques questions",
              "Reformuler votre besoin dans le chat",
              "Comparer les meilleurs lieux pour vous",
              "Vous aider a contacter les prestataires"
            ].map((item, index) => (
              <div key={item} className="hada-card flex items-start gap-3 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fff2ef] text-xs font-semibold text-[var(--hada-primary)]">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm leading-6 text-[#46373f]">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          <Link href="/signup" className="hada-primary-button">
            Commencer
          </Link>
          <Link href="/login" className="hada-secondary-button">
            J&apos;ai deja un compte
          </Link>
        </div>
      </div>
    </Shell>
  );
}

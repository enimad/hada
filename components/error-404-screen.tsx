import Link from "next/link";
import { HadaPortrait, HadaWordmark } from "@/components/mobile-screen";

export function Error404Screen() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#fff5ef_0%,#fdf7f3_44%,#fbf5f1_100%)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1200px] flex-col items-center justify-center px-6 py-16 text-center">
        <div className="hada-home-aura absolute left-1/2 top-[18%] h-[340px] w-[340px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,105,116,0.18),rgba(255,173,51,0.08)_52%,transparent_72%)] blur-2xl" />
        <div className="relative z-10 w-full max-w-[760px] rounded-[36px] border border-[#f1e4dd] bg-white/88 px-8 py-10 shadow-[0_30px_80px_rgba(46,28,54,0.08)] backdrop-blur">
          <HadaWordmark className="mx-auto max-w-[190px] sm:max-w-[220px]" />
          <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.24em] text-[var(--hada-coral)]">Erreur 404</p>
          <h1 className="mt-4 text-[36px] font-bold tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[52px]">
            Cette page s’est éclipsée avant le bouquet final
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[18px] leading-8 text-[#6d6475] sm:text-[20px]">
            L’accès demandé n’est pas disponible ici. Revenez à l’accueil pour reprendre votre parcours Hada en toute sécurité.
          </p>

          <div className="mt-10 flex items-center justify-center">
            <div className="rounded-full bg-[#fff5f2] p-4 shadow-[0_12px_30px_rgba(251,105,116,0.12)]">
              <HadaPortrait variant="circle" className="max-w-[170px] sm:max-w-[190px]" />
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-14 items-center justify-center rounded-full bg-[var(--hada-coral)] px-7 text-[16px] font-semibold text-white shadow-[0_18px_34px_rgba(251,105,116,0.22)]"
            >
              Retour à l’accueil
            </Link>
            <Link
              href="/login"
              className="inline-flex h-14 items-center justify-center rounded-full border border-[#eadfda] bg-white px-7 text-[16px] font-semibold text-[var(--hada-navy)]"
            >
              Me connecter
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

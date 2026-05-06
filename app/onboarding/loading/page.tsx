"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HadaPortrait, MobileScreen } from "@/components/mobile-screen";

export default function OnboardingLoadingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace("/chat");
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <MobileScreen className="pt-2">
      <div className="pt-10 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[var(--hada-gold)] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#774117]">
          <span className="hada-pulse">+</span>
          <span>Hada est à l'œuvre</span>
        </div>

        <p className="mx-auto mt-10 max-w-[300px] text-[30px] font-medium leading-[1.12] tracking-[-0.04em] text-[var(--hada-navy)]">
          Super, ton compte est prêt. Je me lance tout de suite dans la recherche...
        </p>

        <div className="mt-10 hada-float">
          <HadaPortrait variant="full" className="w-[190px]" />
        </div>

        <div className="mt-7 flex items-center justify-center gap-2">
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" />
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" style={{ animationDelay: "0.2s" }} />
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" style={{ animationDelay: "0.4s" }} />
        </div>

        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[#e5dfda] hada-progress">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,#fb6974,#ffad33)] opacity-80" />
        </div>
      </div>
    </MobileScreen>
  );
}

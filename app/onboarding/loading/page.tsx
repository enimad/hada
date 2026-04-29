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
      <div className="pt-24 text-center">
        <div className="mx-auto inline-flex items-center gap-3 rounded-full bg-[var(--hada-gold)] px-8 py-4 text-[18px] font-semibold uppercase tracking-[0.12em] text-[#774117]">
          <span>+</span>
          <span>Hada est a l'oeuvre</span>
        </div>

        <p className="mx-auto mt-20 max-w-[330px] text-[44px] font-medium leading-[1.22] tracking-[-0.05em] text-[var(--hada-navy)]">
          Super, ton compte est pret. Je me lance tout de suite dans la recherche...
        </p>

        <div className="mt-20">
          <HadaPortrait variant="full" className="w-[300px]" />
        </div>

        <div className="mt-14 h-2.5 w-full overflow-hidden rounded-full bg-[#e5dfda]">
          <div className="h-full w-[66%] rounded-full bg-[var(--hada-coral)]" />
        </div>
      </div>
    </MobileScreen>
  );
}

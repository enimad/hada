"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HadaPortrait, MobileScreen } from "@/components/mobile-screen";

export default function LoginLoadingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace("/auth/continue");
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <MobileScreen className="h-[100svh] min-h-0 justify-center overflow-hidden pb-[clamp(16px,3svh,32px)] pt-[clamp(16px,3svh,32px)]">
      <div className="flex w-full flex-col items-center text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[var(--hada-gold)] px-[clamp(16px,4vw,24px)] py-[clamp(10px,1.8svh,13px)] text-[clamp(12px,1.8svh,13px)] font-semibold uppercase tracking-[0.12em] text-[#774117]">
          <span className="hada-pulse">+</span>
          <span>Hada est à l'œuvre</span>
        </div>

        <p className="mx-auto mt-[clamp(22px,4svh,36px)] max-w-[320px] text-[clamp(24px,4svh,30px)] font-medium leading-[1.12] tracking-[-0.04em] text-[var(--hada-navy)]">
          Te revoilà ! Je récupère les informations échangées et j&apos;arrive tout de suite...
        </p>

        <div className="mt-[clamp(22px,4svh,36px)] hada-float">
          <HadaPortrait variant="full" className="!w-[clamp(140px,23svh,190px)] !max-w-[58vw]" />
        </div>

        <div className="mt-[clamp(18px,3svh,26px)] flex items-center justify-center gap-2">
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" />
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" style={{ animationDelay: "0.2s" }} />
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" style={{ animationDelay: "0.4s" }} />
        </div>

        <div className="mt-[clamp(16px,2.6svh,24px)] h-2 w-full max-w-[380px] overflow-hidden rounded-full bg-[#e5dfda] hada-progress">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,#fb6974,#ffad33)] opacity-80" />
        </div>
      </div>
    </MobileScreen>
  );
}

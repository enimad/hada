"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HadaPortrait, MobileScreen } from "@/components/mobile-screen";
import type { WeddingProfile } from "@/lib/types";

export default function AuthContinuePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function continueJourney() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace("/signup");
          return;
        }

        window.history.replaceState(null, "", "/auth/continue");
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/signup");
        return;
      }

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        router.replace("/onboarding");
        return;
      }

      const result = (await response.json()) as { profile: WeddingProfile | null };
      router.replace(result.profile ? "/chat" : "/onboarding");
    }

    void continueJourney();
  }, [router]);

  return (
    <MobileScreen className="h-[100svh] min-h-0 justify-center overflow-hidden pb-[clamp(16px,3svh,32px)] pt-[clamp(16px,3svh,32px)]">
      <div className="flex w-full flex-col items-center text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[var(--hada-gold)] px-[clamp(16px,4vw,28px)] py-[clamp(10px,1.8svh,14px)] text-[clamp(12px,1.8svh,15px)] font-semibold uppercase tracking-[0.12em] text-[#774117]">
          <span className="hada-pulse">+</span>
          <span>Hada est à l'œuvre</span>
        </div>

        <p className="mx-auto mt-[clamp(22px,4svh,42px)] max-w-[340px] text-[clamp(25px,4.4svh,38px)] font-medium leading-[1.16] tracking-[-0.05em] text-[var(--hada-navy)]">
          Je retrouve votre compte et je vous amène au bon endroit...
        </p>

        <div className="mt-[clamp(22px,4svh,42px)] hada-float">
          <HadaPortrait variant="full" className="!w-[clamp(150px,25svh,230px)] !max-w-[60vw]" />
        </div>

        <div className="mt-[clamp(18px,3svh,30px)] flex items-center justify-center gap-2">
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" />
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" style={{ animationDelay: "0.2s" }} />
          <span className="hada-pulse h-2 w-2 rounded-full bg-[var(--hada-coral)]" style={{ animationDelay: "0.4s" }} />
        </div>

        <div className="mt-[clamp(16px,2.6svh,26px)] h-2 w-full max-w-[380px] overflow-hidden rounded-full bg-[#e5dfda] hada-progress">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,#fb6974,#ffad33)] opacity-80" />
        </div>
      </div>
    </MobileScreen>
  );
}

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
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/");
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
    <MobileScreen className="pt-2">
      <div className="pt-24 text-center">
        <div className="mx-auto inline-flex items-center gap-3 rounded-full bg-[var(--hada-gold)] px-8 py-4 text-[18px] font-semibold uppercase tracking-[0.12em] text-[#774117]">
          <span>+</span>
          <span>Hada est a l'oeuvre</span>
        </div>

        <p className="mx-auto mt-20 max-w-[340px] text-[40px] font-medium leading-[1.22] tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[44px]">
          Je retrouve votre compte et je vous amene au bon endroit...
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

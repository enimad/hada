"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HadaPortrait, HadaWordmark, MobileScreen } from "@/components/mobile-screen";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function logout() {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {}

      if (typeof window !== "undefined") {
        const keysToRemove = Object.keys(window.localStorage).filter((key) => key.startsWith("sb-") || key.includes("supabase") || key.startsWith("hada:"));
        keysToRemove.forEach((key) => window.localStorage.removeItem(key));
        window.sessionStorage.clear();
      }

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include"
        });
      } catch {}

      router.replace("/");
      router.refresh();
    }

    void logout();
  }, [router]);

  return (
    <MobileScreen className="pt-2" footer={false}>
      <div className="pt-16 text-center">
        <HadaWordmark className="mx-auto max-w-[170px] sm:max-w-[200px]" />
        <p className="mx-auto mt-10 max-w-[320px] text-[32px] font-semibold leading-[1.15] tracking-[-0.05em] text-[var(--hada-navy)] sm:text-[40px]">
          Je ferme votre session proprement...
        </p>
        <div className="mt-14 hada-float">
          <HadaPortrait variant="circle" className="max-w-[180px] sm:max-w-[210px]" />
        </div>
        <div className="mx-auto mt-10 h-2.5 w-full max-w-[320px] overflow-hidden rounded-full bg-[#e5dfda] hada-progress">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,#fb6974,#ffad33)] opacity-80" />
        </div>
      </div>
    </MobileScreen>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ArrowUpIcon,
  DividerOr,
  HadaPortrait,
  HadaWordmark,
  LineInput,
  MobileScreen
} from "@/components/mobile-screen";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitEmail() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const result = (await response.json()) as { exists?: boolean; error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Impossible de verifier cet email.");
        return;
      }

      router.push(result.exists ? `/login?email=${encodeURIComponent(email)}` : `/signup?email=${encodeURIComponent(email)}`);
    });
  }

  return (
    <MobileScreen className="justify-start pb-10 pt-8 sm:pt-10">
      <div className="pt-4 text-center">
        <HadaWordmark className="mx-auto" />
        <p className="mx-auto mt-5 max-w-[270px] text-[20px] font-semibold tracking-[-0.035em] text-[var(--hada-navy)] sm:max-w-none sm:text-[24px]">
          Ton wedding planner de poche
        </p>
      </div>

      <div className="mt-10 sm:mt-12">
        <HadaPortrait variant="circle" className="max-w-[230px] sm:max-w-[280px]" />
      </div>

      <div className="mt-10 sm:mt-12">
        <button
          type="button"
          className="flex h-16 w-full items-center justify-center gap-4 rounded-full border-2 border-[#9d958f] bg-white px-6 text-[16px] font-medium tracking-[-0.03em] text-[var(--hada-navy)] shadow-[0_16px_34px_rgba(192,173,168,0.12)] sm:h-[72px] sm:text-[18px]"
          onClick={() => {
            startTransition(async () => {
              setMessage("");
              const supabase = createSupabaseBrowserClient();
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/auth/continue`
                }
              });

              if (error) {
                setMessage(
                  "Connexion Google indisponible. Verifie dans Supabase Auth > Providers > Google que le provider est active et que l'URL de redirection localhost de cette preview est autorisee."
                );
              }
            });
          }}
        >
          <span className="text-[32px] font-semibold leading-none text-[#4285f4] sm:text-[38px]">G</span>
          <span>Continuer avec Google</span>
        </button>
      </div>

      <DividerOr />

      <form
        className="mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!email || isPending) return;
          submitEmail();
        }}
      >
        <LineInput
          label="Votre email"
          value={email}
          onChange={setEmail}
          placeholder="hada@gmail.com"
          type="email"
          inputMode="email"
          rightSlot={
            <button
              type="button"
              disabled={!email || isPending}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ffd9dc] text-[#847a78] transition disabled:opacity-60 sm:h-14 sm:w-14"
              onClick={submitEmail}
            >
              <ArrowUpIcon className="h-6 w-6 sm:h-7 sm:w-7" />
            </button>
          }
        />
        {message ? <p className="mt-4 text-center text-[14px] text-[#8d8387] sm:text-[15px]">{message}</p> : null}
      </form>
    </MobileScreen>
  );
}

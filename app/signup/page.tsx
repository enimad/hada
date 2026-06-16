"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ArrowUpIcon, DividerOr, HadaPortrait, HadaWordmark, LineInput, MobileScreen } from "@/components/mobile-screen";

export default function SignupEntryPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function clearPublicEntrySession() {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {}

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include"
        });
      } catch {}

      const keysToRemove = Object.keys(window.localStorage).filter((key) => key.startsWith("sb-") || key.includes("supabase") || key.startsWith("hada:"));
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
      window.sessionStorage.clear();
    }

    void clearPublicEntrySession();
  }, []);

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

      router.push(result.exists ? `/login?email=${encodeURIComponent(email)}` : `/signup/create?email=${encodeURIComponent(email)}`);
    });
  }

  return (
    <MobileScreen className="h-[100svh] min-h-0 justify-start overflow-hidden pb-[clamp(12px,1.8svh,22px)] pt-[clamp(18px,3svh,34px)]">
      <div className="text-center">
        <HadaWordmark className="mx-auto !w-[clamp(132px,17svh,174px)] !max-w-[58vw]" />
        <p className="mx-auto mt-[clamp(8px,1.5svh,16px)] max-w-[270px] text-[clamp(16px,2.2svh,22px)] font-semibold tracking-[-0.035em] text-[var(--hada-navy)] sm:max-w-none">
          Ton wedding planner de poche
        </p>
      </div>

      <div className="mt-[clamp(14px,2.4svh,26px)]">
        <div className="relative mx-auto w-fit">
          <div className="hada-home-aura absolute inset-[-14%] rounded-full" />
          <HadaPortrait variant="circle" className="relative !w-[clamp(132px,24svh,210px)] !max-w-[58vw]" />
        </div>
      </div>

      <div className="mt-[clamp(16px,2.8svh,30px)]">
        <button
          type="button"
          className="flex h-[clamp(48px,6.2svh,62px)] w-full items-center justify-center gap-3 rounded-full border border-[#d6c8c1] bg-white px-5 text-[clamp(14px,1.9svh,17px)] font-medium tracking-[-0.02em] text-[#1f1f1f] shadow-[0_14px_30px_rgba(57,39,74,0.08)] transition hover:shadow-[0_18px_34px_rgba(57,39,74,0.12)] sm:gap-4"
          onClick={() => {
            startTransition(async () => {
              setMessage("");
              const supabase = createSupabaseBrowserClient();
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/auth/callback?next=/auth/continue`
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
          <GoogleIcon className="h-[clamp(22px,3svh,28px)] w-[clamp(22px,3svh,28px)] shrink-0" />
          <span className="font-semibold text-[#303030]">Continuer avec Google</span>
        </button>
      </div>

      <DividerOr className="my-[clamp(12px,2.2svh,24px)] text-[clamp(14px,1.9svh,17px)]" />

      <form
        className="mt-0"
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
          compact
          rightSlot={
            <button
              type="button"
              disabled={!email || isPending}
              className="flex h-[clamp(44px,5.8svh,52px)] w-[clamp(44px,5.8svh,52px)] shrink-0 items-center justify-center rounded-full bg-[var(--hada-coral)] text-white shadow-[0_10px_24px_rgba(251,105,116,0.25)] transition disabled:bg-[#ffd9dc] disabled:text-[#847a78] disabled:shadow-none"
              onClick={submitEmail}
            >
              <ArrowUpIcon className="h-[clamp(22px,3svh,26px)] w-[clamp(22px,3svh,26px)]" />
            </button>
          }
        />
        {message ? <p className="mt-4 text-center text-[14px] text-[#8d8387] sm:text-[15px]">{message}</p> : null}
      </form>

      <div className="mt-[clamp(10px,1.8svh,20px)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-center text-[clamp(11px,1.6svh,13px)] font-medium text-[#8d8387]">
        <Link href="/privacy" className="underline underline-offset-4">
          Politique de confidentialité
        </Link>
        <Link href="/cgu" className="underline underline-offset-4">
          Conditions d&apos;utilisation
        </Link>
      </div>
    </MobileScreen>
  );
}

function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-.8 2.4-1.8 3.2l3 2.3c1.8-1.6 2.9-4 2.9-6.9 0-.7-.1-1.4-.2-2H12Z" />
      <path fill="#4285F4" d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.3c-.8.6-1.9 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2l-3.1 2.4C4.8 19.8 8.1 22 12 22Z" />
      <path fill="#FBBC05" d="M6.3 14.1A5.9 5.9 0 0 1 6 12c0-.7.1-1.4.3-2.1L3.2 7.5A10.1 10.1 0 0 0 2 12c0 1.6.4 3.2 1.2 4.5l3.1-2.4Z" />
      <path fill="#34A853" d="M12 5.7c1.4 0 2.7.5 3.7 1.5l2.8-2.8A10 10 0 0 0 2 12c0 1.6.4 3.2 1.2 4.5l3.1-2.4C7.1 9.4 9.4 5.7 12 5.7Z" />
    </svg>
  );
}

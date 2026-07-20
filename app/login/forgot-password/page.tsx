"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LineInput, MainButton, MobileScreen } from "@/components/mobile-screen";
import { getPasswordResetRedirectUrl, PASSWORD_RECOVERY_COOKIE, PASSWORD_RECOVERY_MAX_AGE } from "@/lib/auth/password-recovery";

function setRecoveryMarker(enabled: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = enabled ? PASSWORD_RECOVERY_MAX_AGE : 0;
  document.cookie = `${PASSWORD_RECOVERY_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
  }, []);

  function updateEmail(value: string) {
    setEmail(value);
    if (sent) {
      setSent(false);
      setMessage("");
    }
  }

  return (
    <MobileScreen className="pb-10 pt-10">
      <div className="pt-6 text-center">
        <h1 className="text-[38px] font-bold tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[52px]">Mot de passe oublié ?</h1>
        <p className="mx-auto mt-8 max-w-[340px] text-[18px] font-medium leading-[1.3] tracking-[-0.04em] text-[var(--hada-navy)] sm:text-[21px]">
          Indique ton email Hada, on t&apos;envoie un lien pour créer un nouveau mot de passe.
        </p>
      </div>

      <form
        className="mt-12"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");

          startTransition(async () => {
            const supabase = createSupabaseBrowserClient();
            const redirectTo = getPasswordResetRedirectUrl(window.location.origin);
            setRecoveryMarker(true);
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

            if (error) {
              setRecoveryMarker(false);
              setMessage("Impossible d'envoyer le lien pour le moment. Réessayez dans quelques instants.");
              return;
            }

            setSent(true);
            setMessage("Si un compte Hada existe avec cet email, un lien de réinitialisation vient d'être envoyé.");
          });
        }}
      >
        <LineInput
          label="Ton adresse mail"
          value={email}
          onChange={updateEmail}
          placeholder="hada@gmail.com"
          type="email"
          inputMode="email"
          name="email"
          autoComplete="email"
        />

        <div className="mt-10">
          <MainButton type="submit" disabled={!email || isPending}>
            {isPending ? "Envoi..." : sent ? "Renvoyer le lien" : "Recevoir le lien"}
          </MainButton>
        </div>

        {message ? (
          <div className={`mt-5 rounded-[22px] border px-5 py-4 text-center ${sent ? "border-[#eadfda] bg-white" : "border-[#ffd4d8] bg-[#fff1f3]"}`}>
            <p className="text-[14px] font-semibold text-[var(--hada-navy)]">{message}</p>
          </div>
        ) : null}

        <div className="mt-8 text-center">
          <Link
            href={email ? `/login?email=${encodeURIComponent(email)}` : "/login"}
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#eadfda] bg-white px-5 text-[15px] font-semibold text-[var(--hada-navy)]"
          >
            Retour connexion
          </Link>
        </div>
      </form>
    </MobileScreen>
  );
}

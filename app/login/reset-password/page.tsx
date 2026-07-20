"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon, LineInput, MainButton, MobileScreen } from "@/components/mobile-screen";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.cookie = `${PASSWORD_RECOVERY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    const supabase = createSupabaseBrowserClient();
    let active = true;
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event !== "PASSWORD_RECOVERY" || !session) return;

      setCanReset(true);
      setCheckingSession(false);
      setMessage("");
      window.history.replaceState(null, "", "/login/reset-password");
    });

    async function prepareRecoverySession() {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const authError =
        url.searchParams.get("auth_error") ??
        url.searchParams.get("error_code") ??
        url.searchParams.get("error") ??
        hashParams.get("error_code") ??
        hashParams.get("error");

      if (authError) {
        if (active) {
          setMessage("Le lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien.");
          setCheckingSession(false);
        }
        return;
      }

      // createBrowserClient exchanges the PKCE code during initialization; getSession waits for it.
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      const hasSession = !error && Boolean(data.session);
      setCanReset(hasSession);
      setCheckingSession(false);
      if (hasSession) {
        window.history.replaceState(null, "", "/login/reset-password");
        setMessage("");
      } else {
        setMessage("Ouvrez cette page depuis le lien reçu par email pour choisir un nouveau mot de passe.");
      }
    }

    void prepareRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <MobileScreen className="pb-10 pt-10">
      <div className="pt-6 text-center">
        <h1 className="text-[38px] font-bold tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[52px]">Nouveau mot de passe</h1>
        <p className="mx-auto mt-8 max-w-[340px] text-[18px] font-medium leading-[1.3] tracking-[-0.04em] text-[var(--hada-navy)] sm:text-[21px]">
          Choisis un mot de passe solide pour retrouver ton espace Hada.
        </p>
      </div>

      <form
        className="mt-12"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");

          if (password.length < 6) {
            setMessage("Le mot de passe doit contenir au moins 6 caractères.");
            return;
          }

          if (password !== confirmPassword) {
            setMessage("Les deux mots de passe ne correspondent pas.");
            return;
          }

          startTransition(async () => {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.updateUser({ password });

            if (error) {
              setMessage("Impossible de mettre à jour le mot de passe. Demandez un nouveau lien si le problème persiste.");
              return;
            }

            await supabase.auth.signOut();
            router.replace("/login?password_reset=success");
          });
        }}
      >
        <div className="space-y-8">
          <LineInput
            label="Nouveau mot de passe"
            value={password}
            onChange={setPassword}
            type={showPassword ? "text" : "password"}
            placeholder="***********"
            rightSlot={
              <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-[#8f8884]">
                {showPassword ? <EyeOffIcon className="h-7 w-7" /> : <EyeIcon className="h-7 w-7" />}
              </button>
            }
          />
          <LineInput label="Confirmer le mot de passe" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="***********" />
        </div>

        <div className="mt-10">
          <MainButton type="submit" disabled={checkingSession || !canReset || !password || !confirmPassword || isPending}>
            {checkingSession ? "Vérification..." : isPending ? "Mise à jour..." : "Mettre à jour"}
          </MainButton>
        </div>

        {message ? (
          <div className="mt-5 rounded-[22px] border border-[#ffd4d8] bg-[#fff1f3] px-5 py-4 text-center">
            <p className="text-[14px] font-semibold text-[var(--hada-navy)]">{message}</p>
          </div>
        ) : null}

        {!canReset && !checkingSession ? (
          <div className="mt-8 text-center">
            <Link
              href="/login/forgot-password"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#eadfda] bg-white px-5 text-[15px] font-semibold text-[var(--hada-navy)]"
            >
              Demander un nouveau lien
            </Link>
          </div>
        ) : null}
      </form>
    </MobileScreen>
  );
}

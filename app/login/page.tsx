"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon, LineInput, MainButton, MobileScreen } from "@/components/mobile-screen";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
    if (params.get("confirmed") === "1") {
      setMessageTone("success");
      setMessage("Email confirmé. Vous pouvez maintenant vous connecter.");
    }
    if (params.get("password_reset") === "success") {
      setMessageTone("success");
      setMessage("Mot de passe mis à jour. Vous pouvez maintenant vous connecter.");
    }
  }, []);

  return (
    <MobileScreen className="pb-10 pt-10">
      <div className="pt-6 text-center">
        <h1 className="text-[40px] font-bold tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">Connecte-toi</h1>
        <p className="mx-auto mt-10 max-w-[320px] text-[18px] font-medium leading-[1.25] tracking-[-0.04em] text-[var(--hada-navy)] sm:max-w-[360px] sm:text-[22px]">
          Ta première analyse t&apos;attend... connecte-toi pour la découvrir
        </p>
      </div>

      <form
        className="mt-12"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
              setMessageTone("error");
              setMessage(error.message);
              return;
            }

            router.replace("/auth/continue");
          });
        }}
      >
        <div className="space-y-8">
          <LineInput
            label="Ton adresse mail"
            value={email}
            onChange={setEmail}
            placeholder="hada@gmail.com"
            type="email"
            inputMode="email"
            name="email"
            autoComplete="username"
          />
          <LineInput
            label="Ton mot de passe"
            value={password}
            onChange={setPassword}
            type={showPassword ? "text" : "password"}
            placeholder="***********"
            name="password"
            autoComplete="current-password"
            rightSlot={
              <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-[#8f8884]">
                {showPassword ? <EyeOffIcon className="h-7 w-7" /> : <EyeIcon className="h-7 w-7" />}
              </button>
            }
          />
        </div>

        <div className="mt-5 text-right">
          <Link
            href={email ? `/login/forgot-password?email=${encodeURIComponent(email)}` : "/login/forgot-password"}
            className="text-[15px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)] underline decoration-[#d8cec8] underline-offset-4"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <div className="mt-10">
          <MainButton type="submit" disabled={!email || !password || isPending}>
            Je continue
          </MainButton>
        </div>

        {message ? (
          <p className={`mt-4 text-center text-[14px] font-medium ${messageTone === "error" ? "text-[var(--hada-coral)]" : "text-[var(--hada-navy)]"}`}>
            {message}
          </p>
        ) : null}
        <div className="mt-8 text-center">
          <p className="text-[15px] text-[#7c7379]">Vous n’avez pas encore de compte Hada ?</p>
          <Link
            href={email ? `/signup?email=${encodeURIComponent(email)}` : "/signup"}
            className="mt-3 inline-flex h-12 items-center justify-center rounded-full border border-[#eadfda] bg-white px-5 text-[15px] font-semibold text-[var(--hada-navy)]"
          >
            Créer un compte
          </Link>
        </div>
      </form>
    </MobileScreen>
  );
}

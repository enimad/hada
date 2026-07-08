"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon, LineInput, MainButton, MobileScreen } from "@/components/mobile-screen";

export default function SignupCreatePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
  }, []);

  return (
    <MobileScreen className="pb-10 pt-10">
      <div className="pt-6 text-center">
        <h1 className="text-[40px] font-bold tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">Inscris-toi</h1>
        <p className="mx-auto mt-10 max-w-[320px] text-[18px] font-medium leading-[1.25] tracking-[-0.04em] text-[var(--hada-navy)] sm:max-w-[360px] sm:text-[22px]">
          Ta première analyse t&apos;attend... connecte-toi pour la découvrir
        </p>
      </div>

      <form
        className="mt-12"
        onSubmit={(event) => {
          event.preventDefault();
          if (!acceptedTerms) return;

          startTransition(async () => {
            setMessage("");
            let signupResponse: Response;

            try {
              signupResponse = await fetch("/api/auth/signup", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
              });
            } catch {
              setMessage("Impossible de contacter le serveur local. Vérifiez que localhost:3000 est bien lancé.");
              return;
            }

            const signupResult = (await signupResponse.json().catch(() => ({ error: "Réponse serveur illisible." }))) as { error?: string };
            if (!signupResponse.ok) {
              setMessage(signupResult.error ?? "Impossible de créer le compte.");
              return;
            }

            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
              setMessage("Compte créé, mais la connexion automatique a échoué. Essayez de vous connecter.");
              return;
            }

            router.replace("/onboarding");
          });
        }}
      >
        <div className="space-y-8">
          <LineInput label="Ton adresse mail" value={email} onChange={setEmail} placeholder="hada@gmail.com" type="email" inputMode="email" />
          <LineInput
            label="Ton mot de passe"
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
        </div>

        <label className="mt-12 flex items-start gap-4">
          <button
            type="button"
            onClick={() => setAcceptedTerms((current) => !current)}
            className={`mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
              acceptedTerms ? "border-[var(--hada-coral)] bg-[#fff0f1]" : "border-[#d0c7c2] bg-transparent"
            }`}
          >
            {acceptedTerms ? <span className="h-3 w-3 rounded-full bg-[var(--hada-coral)]" /> : null}
          </button>
          <span className="text-[16px] font-medium leading-[1.4] tracking-[-0.03em] text-[#8a817d] sm:text-[18px]">
            En créant un compte, vous acceptez{" "}
            <Link href="/cgu" target="_blank" rel="noreferrer" className="underline">
              nos conditions générales d&apos;utilisation.
            </Link>
          </span>
        </label>

        <div className="mt-10">
          <MainButton type="submit" disabled={!acceptedTerms || !email || !password || isPending}>
            Je continue
          </MainButton>
        </div>

        <div className="mt-5 text-center">
          <p className="text-[14px] font-medium text-[#8a817d]">Vous avez déjà un compte Hada ?</p>
          <Link
            href={email ? `/login?email=${encodeURIComponent(email)}` : "/login"}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-full border border-[#eadfda] bg-white px-5 text-[14px] font-semibold text-[var(--hada-navy)] shadow-[0_8px_20px_rgba(46,28,54,0.08)]"
          >
            Se connecter
          </Link>
        </div>

        {message ? (
          <div className="mt-5 rounded-[22px] border border-[#ffd4d8] bg-[#fff1f3] px-5 py-4 text-center">
            <p className="text-[14px] font-semibold text-[var(--hada-navy)]">{message}</p>
          </div>
        ) : null}
      </form>
    </MobileScreen>
  );
}

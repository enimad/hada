"use client";

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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
    if (params.get("confirmed") === "1") {
      setMessage("Email confirme. Vous pouvez maintenant vous connecter.");
    }
  }, []);

  return (
    <MobileScreen className="pb-10 pt-10">
      <div className="pt-6 text-center">
        <h1 className="text-[40px] font-bold tracking-[-0.06em] text-[var(--hada-navy)] sm:text-[56px]">Connecte-toi</h1>
        <p className="mx-auto mt-10 max-w-[320px] text-[18px] font-medium leading-[1.25] tracking-[-0.04em] text-[var(--hada-navy)] sm:max-w-[360px] sm:text-[22px]">
          Ta premiere analyse t&apos;attend... connecte-toi pour la decouvrir
        </p>
      </div>

      <form
        className="mt-12"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
              setMessage(error.message);
              return;
            }

            router.push("/login/loading");
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

        <div className="mt-10">
          <MainButton type="submit" disabled={!email || !password || isPending}>
            Je continue
          </MainButton>
        </div>

        {message ? <p className="mt-4 text-center text-[14px] text-[#8d8387]">{message}</p> : null}
      </form>
    </MobileScreen>
  );
}

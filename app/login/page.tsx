"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { HadaPortrait } from "@/components/hada-portrait";
import { Shell } from "@/components/shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setConfirmed(params.get("confirmed") === "1");
  }, []);

  return (
    <Shell hideNav backHref="/" title="Connexion" subtitle="Retrouvez votre parcours, vos lieux et vos messages avec Hada.">
      <div className="space-y-6">
        <div className="hada-soft-card px-5 py-6 text-center">
          <HadaPortrait size="sm" />
          <p className="mt-4 text-sm leading-6 text-[var(--hada-muted)]">
            Hada recharge votre contexte mariage et reprend votre progression.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setMessage("");
              const supabase = createSupabaseBrowserClient();
              const { error } = await supabase.auth.signInWithPassword({ email, password });

              if (error) {
                setMessage(error.message);
                return;
              }

              router.push("/onboarding");
              router.refresh();
            });
          }}
        >
          {confirmed ? (
            <div className="rounded-[18px] border border-[#f3dbbc] bg-[#fff6e8] px-4 py-4 text-sm leading-6 text-[#725437]">
              Email confirme. Vous pouvez maintenant vous connecter.
            </div>
          ) : null}

          <FormInput placeholder="Email" type="email" value={email} onChange={setEmail} />
          <FormInput placeholder="Mot de passe" type="password" value={password} onChange={setPassword} />

          <button disabled={isPending} className="hada-primary-button">
            {isPending ? "Connexion..." : "Se connecter"}
          </button>

          {message ? <p className="text-center text-sm text-[var(--hada-muted)]">{message}</p> : null}
        </form>

        <p className="text-center text-sm text-[#908188]">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-semibold text-[var(--hada-ink)]">
            Inscription
          </Link>
        </p>
      </div>
    </Shell>
  );
}

function FormInput({
  placeholder,
  value,
  onChange,
  type = "text"
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <input
      className="hada-input"
      placeholder={placeholder}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

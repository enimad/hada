"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { HadaPortrait } from "@/components/hada-portrait";
import { Shell } from "@/components/shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <Shell
      hideNav
      backHref="/"
      title="Creation de compte"
      subtitle="Hada a besoin de votre compte pour memoriser votre projet mariage et votre progression."
    >
      <div className="space-y-6">
        <div className="hada-soft-card px-5 py-6 text-center">
          <HadaPortrait size="sm" />
          <p className="mt-4 text-sm leading-6 text-[var(--hada-muted)]">
            Vous pourrez ensuite commencer le profilage en quelques etapes simples.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setMessage("");
              const supabase = createSupabaseBrowserClient();
              const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                  emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
                  data: {
                    first_name: firstName,
                    last_name: lastName
                  }
                }
              });

              if (error) {
                setMessage(error.message);
                return;
              }

              if (data.session) {
                router.push("/onboarding");
                router.refresh();
                return;
              }

              setMessage("Compte cree. Verifiez votre email puis connectez-vous pour continuer.");
            });
          }}
        >
          <FormInput placeholder="Prenom" value={firstName} onChange={setFirstName} />
          <FormInput placeholder="Nom" value={lastName} onChange={setLastName} />
          <FormInput placeholder="Email" type="email" value={email} onChange={setEmail} />
          <FormInput placeholder="Mot de passe" type="password" value={password} onChange={setPassword} />

          <button disabled={isPending} className="hada-primary-button">
            {isPending ? "Creation..." : "Creer mon compte"}
          </button>

          {message ? <p className="text-center text-sm text-[var(--hada-muted)]">{message}</p> : null}
        </form>

        <p className="text-center text-sm text-[#908188]">
          Deja inscrit ?{" "}
          <Link href="/login" className="font-semibold text-[var(--hada-ink)]">
            Connexion
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

import Link from "next/link";
import { ReactNode } from "react";

type ShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function Shell({ title, subtitle, children }: ShellProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-sm uppercase tracking-[0.35em] text-olive">
          Hada
        </Link>
        <nav className="flex gap-3 text-sm">
          <Link href="/signup">Inscription</Link>
          <Link href="/login">Connexion</Link>
          <Link href="/onboarding">Profil</Link>
          <Link href="/chat">Chat</Link>
        </nav>
      </header>
      <section className="mb-8">
        <h1 className="text-4xl font-semibold">{title}</h1>
        <p className="mt-3 max-w-2xl text-base text-black/70">{subtitle}</p>
      </section>
      {children}
    </main>
  );
}

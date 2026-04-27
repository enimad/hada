import Link from "next/link";
import { ReactNode } from "react";
import type { Route } from "next";
import { HadaNav } from "@/components/hada-nav";

type ShellProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  activeNav?: "home" | "chat" | "venues" | "messages" | "profile";
  backHref?: Route;
  topSlot?: ReactNode;
  hideNav?: boolean;
};

export function Shell({ title, subtitle, children, activeNav, backHref, topSlot, hideNav }: ShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-3 py-6 sm:px-6">
      <div className="hada-phone-shell w-full max-w-[414px] rounded-[42px] p-4">
        <div className="hada-screen rounded-[34px] px-5 py-5 sm:px-6 sm:py-6">
          <header className="mb-7 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--hada-line)] bg-[var(--hada-paper)] text-[17px] text-[var(--hada-ink)]"
                >
                  {"<"}
                </Link>
              ) : null}
              <Link href="/" className="flex items-center gap-2">
                <span className="hada-pill bg-[var(--hada-soft-strong)] text-[var(--hada-primary)]">
                  Hada
                </span>
              </Link>
            </div>
            {topSlot ?? <span className="text-xs font-medium text-[var(--hada-muted)]">Wedding planner IA</span>}
          </header>
          {title ? (
            <section className="mb-6">
              <h1 className="text-[31px] font-semibold leading-[1.02] tracking-[-0.055em] text-[var(--hada-ink)]">
                {title}
              </h1>
              {subtitle ? <p className="mt-3 max-w-[300px] text-sm leading-6 text-[var(--hada-muted)]">{subtitle}</p> : null}
            </section>
          ) : null}
          <section>{children}</section>
          {activeNav && !hideNav ? <HadaNav active={activeNav} /> : null}
        </div>
      </div>
    </main>
  );
}

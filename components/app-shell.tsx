"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { HadaDrawer } from "@/components/hada-drawer";
import { HadaWordmark, MenuIcon } from "@/components/mobile-screen";

type AppShellProps = {
  children: ReactNode;
  active: "chat" | "wedding" | "vendors";
  mobileTitle?: string;
};

const navItems = [
  { key: "chat", label: "Chat avec Hada", href: "/chat" },
  { key: "wedding", label: "Mon mariage", href: "/monmariage" },
  { key: "vendors", label: "Mes prestataires", href: "/vendors" }
] as const;

export function AppShell({ children, active, mobileTitle = "Hada" }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <main className="min-h-screen bg-[var(--hada-cream)]">
        <header className="sticky top-0 z-40 border-b border-[#eee5e0] bg-[rgba(253,249,246,0.94)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e7ddd8] bg-white text-[#5a5451] shadow-[0_8px_20px_rgba(46,28,54,0.08)]"
            >
              <MenuIcon className="h-6 w-6" />
            </button>
            <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">{mobileTitle}</p>
            <span className="w-11" />
          </div>

          <div className="mx-auto hidden w-full max-w-6xl items-center justify-between px-6 py-4 lg:px-8 md:flex">
            <Link href="/chat" className="flex items-center gap-3">
              <HadaWordmark className="max-w-[140px]" />
              <span className="rounded-full bg-[#fff0f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--hada-coral)]">
                Beta
              </span>
            </Link>

            <nav className="flex items-center gap-3 rounded-full border border-[#eadfda] bg-white/80 p-2 shadow-[0_8px_30px_rgba(46,28,54,0.06)]">
              {navItems.map((item) => {
                const isActive = item.key === active;

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`rounded-full px-5 py-3 text-[15px] font-semibold tracking-[-0.02em] transition ${
                      isActive ? "bg-[var(--hada-coral)] text-white" : "text-[var(--hada-navy)] hover:bg-[#fff0f1]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>

      <HadaDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} active={active} />
    </>
  );
}

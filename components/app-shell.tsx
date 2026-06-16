"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { HadaDrawer } from "@/components/hada-drawer";
import { HadaWordmark, MenuIcon } from "@/components/mobile-screen";
import { SurveyModalHost } from "@/components/survey-exit-guard";

type AppShellProps = {
  children: ReactNode;
  active: "chat" | "wedding" | "budget" | "offer" | "vendors";
  mobileTitle?: string;
  mobileTitleNode?: ReactNode;
  mobileRightSlot?: ReactNode;
};

const navItems = [
  { key: "chat", label: "Chat avec Hada", href: "/chat" },
  { key: "wedding", label: "Mon mariage", href: "/monmariage" },
  { key: "budget", label: "Budget", href: "/budget" },
  { key: "vendors", label: "Mes prestataires", href: "/vendors" },
  { key: "offer", label: "Mon offre", href: "/mon-offre", variant: "subscription" }
] as const;

const feedbackFormUrl = "https://docs.google.com/forms/d/e/1FAIpQLSdSLTUfwxa179tPHL00z3bUYZxRc9VNPPFqelqQLLComRF0Bw/viewform";

export function AppShell({ children, active, mobileTitle = "Hada", mobileTitleNode, mobileRightSlot }: AppShellProps) {
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
            <div className="flex min-w-0 flex-1 items-center justify-center px-3">
              {mobileTitleNode ?? <p className="truncate text-[18px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">{mobileTitle}</p>}
            </div>
            <div className="flex w-11 justify-end">{mobileRightSlot ?? <span className="w-11" />}</div>
          </div>

          <div className="mx-auto hidden w-full max-w-[1680px] items-center justify-between gap-4 px-5 py-3 lg:px-7 md:flex">
            <Link href="/chat" className="flex shrink-0 items-center gap-2.5">
              <HadaWordmark className="!w-[104px] !max-w-[104px] lg:!w-[112px] lg:!max-w-[112px]" />
              <span className="rounded-full bg-[#fff0f1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--hada-coral)]">
                Beta
              </span>
            </Link>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
              <nav className="flex min-w-max shrink-0 items-center gap-1.5 rounded-full border border-[#eadfda] bg-white/80 p-1.5 shadow-[0_8px_30px_rgba(46,28,54,0.06)] lg:gap-2">
                {navItems.map((item) => {
                  const isActive = item.key === active;
                  const isSubscription = "variant" in item && item.variant === "subscription";

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-center text-[14px] font-semibold leading-none tracking-[-0.02em] transition lg:px-4 xl:px-5 ${
                        isSubscription
                          ? isActive
                            ? "bg-[var(--hada-navy)] text-white shadow-[0_10px_24px_rgba(43,33,79,0.16)]"
                            : "border border-[#ffd4d8] bg-[#fff7f4] text-[var(--hada-coral)] hover:border-[var(--hada-coral)] hover:bg-[#fff0f1]"
                          : isActive
                            ? "bg-[var(--hada-coral)] text-white"
                            : "text-[var(--hada-navy)] hover:bg-[#fff0f1]"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <a
                href={feedbackFormUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[#fff0f1] px-4 text-[13px] font-semibold leading-none tracking-[-0.02em] text-[var(--hada-coral)] shadow-[0_8px_26px_rgba(251,105,116,0.12)] transition hover:-translate-y-0.5 hover:bg-[var(--hada-coral)] hover:text-white xl:px-5"
              >
                Donner mon avis
              </a>

              <Link
                href="/logout"
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#eadfda] bg-[#fff0f1] text-[var(--hada-coral)] shadow-[0_8px_26px_rgba(251,105,116,0.12)] transition hover:-translate-y-0.5 hover:bg-[var(--hada-coral)] hover:text-white"
              >
                <LogoutIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>

      <HadaDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} active={active} />
      <SurveyModalHost />
    </>
  );
}

function LogoutIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

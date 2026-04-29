"use client";

import Image from "next/image";
import Link from "next/link";
import { HeartIcon, MenuIcon } from "@/components/mobile-screen";

type HadaDrawerProps = {
  open: boolean;
  onClose: () => void;
  active?: "chat" | "wedding" | "vendors";
};

const items = [
  { key: "chat", label: "Chat avec Hada", href: "/chat", icon: "sparkles" },
  { key: "wedding", label: "Mon mariage", href: "/monmariage", icon: "grid" },
  { key: "vendors", label: "Mes prestataires", href: "/vendors", icon: "heart" }
] as const;

export function HadaDrawer({ open, onClose, active = "chat" }: HadaDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 md:hidden">
      <div className="flex h-full w-[320px] max-w-[88vw] flex-col rounded-r-[30px] bg-white px-5 pb-8 pt-6 shadow-[0_10px_40px_rgba(24,20,34,0.18)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Image src="/brand/hada-portrait-circle.png" alt="Hada" width={44} height={44} className="h-11 w-11 rounded-full" />
            <div>
              <div className="flex items-center gap-3">
                <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--hada-navy)]">Hada</p>
                <span className="rounded-full border border-[var(--hada-coral)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--hada-coral)]">
                  Beta
                </span>
              </div>
              <p className="text-[14px] text-[var(--hada-navy)]">Ton wedding planner de poche</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="pt-1 text-[28px] font-light text-[#8b7e84]">
            ×
          </button>
        </div>

        <div className="mt-5 h-px bg-[#e9dfda]" />

        <nav className="mt-9 space-y-3">
          {items.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex items-center gap-3 rounded-full px-4 py-4 text-[16px] font-medium tracking-[-0.02em] ${
                  isActive ? "bg-[var(--hada-coral)] text-white" : "text-[#4d4a4f]"
                }`}
              >
                <DrawerIcon kind={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between border-t border-[#e9dfda] pt-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hada-coral)] text-[20px] font-semibold text-white">
              L
            </span>
            <span className="text-[18px] font-medium tracking-[-0.02em] text-[var(--hada-navy)]">Lila</span>
          </div>
          <span className="text-[22px] text-[#5d595d]">⚙</span>
        </div>
      </div>
    </div>
  );
}

function DrawerIcon({ kind }: { kind: "sparkles" | "grid" | "heart" }) {
  if (kind === "heart") {
    return <HeartIcon className="h-6 w-6" />;
  }

  if (kind === "grid") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </svg>
    );
  }

  return <MenuIcon className="h-6 w-6" />;
}

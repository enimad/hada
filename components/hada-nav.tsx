import Link from "next/link";
import type { Route } from "next";

type HadaNavProps = {
  active: "home" | "chat" | "venues" | "messages" | "profile";
};

const items: Array<{ key: HadaNavProps["active"]; label: string; href: Route; icon: string }> = [
  { key: "home", label: "Accueil", href: "/", icon: "A" },
  { key: "chat", label: "Chat", href: "/chat", icon: "C" },
  { key: "venues", label: "Lieux", href: "/venues", icon: "L" },
  { key: "messages", label: "Messages", href: "/messages/domaine-des-oliviers", icon: "M" },
  { key: "profile", label: "Profil", href: "/onboarding", icon: "P" }
];

export function HadaNav({ active }: HadaNavProps) {
  return (
    <nav className="mt-7 grid grid-cols-5 gap-2 rounded-[24px] border border-[var(--hada-line)] bg-[var(--hada-soft)] p-2">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`flex flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[11px] font-medium transition ${
              isActive
                ? "bg-[var(--hada-primary)] text-white shadow-[0_14px_24px_rgba(255,127,134,0.24)]"
                : "text-[var(--hada-muted)]"
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-[10px] font-semibold leading-none">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

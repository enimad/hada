import Image from "next/image";
import Link from "next/link";

const navItems = [
  { label: "Accueil", href: "/#accueil" },
  { label: "Blog", href: "/blog" }
];

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#f0ddd8]/80 bg-[rgba(253,249,246,0.9)] backdrop-blur-xl">
      <nav
        className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 px-5 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-8 lg:px-10"
        aria-label="Navigation principale"
      >
        <Link href="/#accueil" className="flex items-center justify-self-start" aria-label="Accueil Hada">
          <Image
            src="/brand/hada-wordmark.png"
            alt="Hada"
            width={180}
            height={55}
            priority
            className="h-auto w-[104px] sm:w-[128px] lg:w-[142px]"
          />
        </Link>

        <div className="order-3 col-span-2 flex w-full items-center justify-center rounded-full border border-[#eadbd6] bg-white/78 p-1 shadow-[0_12px_36px_rgba(43,33,79,0.07)] sm:order-none sm:col-span-1 sm:w-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 rounded-full px-5 py-2 text-center text-sm font-bold text-[var(--hada-navy)] transition hover:bg-[#fff0f1] hover:text-[var(--hada-coral)] sm:flex-none sm:py-3"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <Link
          href="/signup"
          className="inline-flex h-11 items-center justify-center justify-self-end rounded-full bg-[var(--hada-coral)] px-4 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(251,105,116,0.22)] transition hover:bg-[#e95361] sm:h-12 sm:px-5"
        >
          Tester Hada
        </Link>
      </nav>
    </header>
  );
}

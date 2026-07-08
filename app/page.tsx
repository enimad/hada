import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

const siteUrl = "https://hadawedding.fr";

export const metadata: Metadata = {
  title: "Hada - Wedding planner IA pour organiser votre mariage",
  description:
    "Hada accompagne les futurs mariés avec un chat wedding planner, un profil mariage structuré, un budget clair et des recherches de prestataires personnalisées.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Hada - Wedding planner IA pour organiser votre mariage",
    description: "Un wedding planner de poche pour clarifier vos priorités, organiser votre mariage et trouver les bons prestataires.",
    url: siteUrl,
    siteName: "Hada",
    images: [
      {
        url: "/brand/hada-portrait-circle.png",
        width: 320,
        height: 320,
        alt: "Hada, wedding planner IA"
      }
    ],
    locale: "fr_FR",
    type: "website"
  }
};

const navItems = [
  { label: "Accueil", href: "#accueil" },
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "La Team Hada", href: "#team" },
  { label: "Blog Hada", href: "/blog" }
];

const features = [
  {
    eyebrow: "Clarifier",
    title: "Un profil mariage qui devient votre source de vérité",
    text: "Date, lieu, budget, invités, style et priorités : Hada centralise l'essentiel pour que chaque décision parte des bonnes informations."
  },
  {
    eyebrow: "Avancer",
    title: "Un chat qui garde le fil, même quand tout change",
    text: "Vous pouvez poser une question, corriger une information ou demander un conseil. Hada vous répond comme une wedding planner qui connaît déjà votre contexte."
  },
  {
    eyebrow: "Trouver",
    title: "Des recherches prestataires basées sur vos vrais besoins",
    text: "Lieu, traiteur, photographe, fleurs ou animation : Hada transforme vos critères en recherches concrètes, sans vous noyer sous des annuaires interminables."
  },
  {
    eyebrow: "Piloter",
    title: "Budget, checklist et prestataires au même endroit",
    text: "Les grandes étapes, les postes de dépense et les prestataires repérés restent organisés pour vous aider à décider avec calme."
  }
];

const teamPrinciples = [
  "Une expérience pensée pour réduire la charge mentale, pas pour ajouter un outil de plus.",
  "Des réponses chaleureuses, mais ancrées dans les informations réelles du mariage.",
  "Une priorité simple : vous aider à prendre la prochaine bonne décision."
];

export default function LandingPage() {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Hada",
    url: siteUrl,
    logo: `${siteUrl}/brand/hada-wordmark.png`,
    sameAs: []
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Hada",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Wedding planner IA qui aide les futurs mariés à organiser leur mariage, structurer leur budget et trouver des prestataires adaptés.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR"
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--hada-cream)] text-[var(--hada-navy)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />

      <header className="sticky top-0 z-30 border-b border-[#f0ddd8]/80 bg-[rgba(253,249,246,0.86)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10" aria-label="Navigation principale">
          <Link href="#accueil" className="flex items-center gap-3">
            <Image src="/brand/hada-wordmark.png" alt="Hada" width={180} height={55} priority className="h-auto w-[118px] sm:w-[142px]" />
          </Link>

          <div className="hidden items-center rounded-full border border-[#eadbd6] bg-white/78 p-1 shadow-[0_18px_60px_rgba(43,33,79,0.08)] lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-5 py-3 text-sm font-bold text-[var(--hada-navy)] transition hover:bg-[#fff0f1] hover:text-[var(--hada-coral)]"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <Link
            href="/signup"
            className="hidden h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-sm font-extrabold text-white shadow-[0_18px_34px_rgba(251,105,116,0.24)] transition hover:bg-[#e95361] lg:inline-flex"
          >
            Tester Hada
          </Link>
          <Link
            href="/blog"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--hada-coral)] bg-white px-5 text-sm font-extrabold text-[var(--hada-coral)] shadow-[0_14px_28px_rgba(251,105,116,0.12)] transition lg:hidden"
          >
            Blog Hada
          </Link>
        </nav>
      </header>

      <section id="accueil" className="relative px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
        <div className="absolute inset-x-0 top-[-20%] h-[520px] bg-[radial-gradient(circle_at_52%_0%,rgba(251,105,116,0.24),transparent_42%),radial-gradient(circle_at_18%_10%,rgba(255,173,51,0.2),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.86fr]">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
            <p className="mb-5 inline-flex rounded-full border border-[#ffd7d9] bg-white/75 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-[var(--hada-coral)]">
              Wedding planner IA
            </p>
            <h1 className="text-[clamp(38px,5.8vw,76px)] font-black leading-[0.96] tracking-[-0.075em]">
              Organisez votre mariage avec une alliée qui garde le fil.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base font-medium leading-[1.65] text-[#655b72] sm:text-lg lg:mx-0">
              Hada vous aide à clarifier vos informations, prioriser les prochaines étapes, structurer votre budget et trouver des prestataires qui correspondent vraiment à votre mariage.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-7 text-sm font-extrabold text-white shadow-[0_20px_42px_rgba(251,105,116,0.28)] transition hover:bg-[#e95361] sm:h-[52px] sm:text-[15px]"
              >
                Créer mon compte
              </Link>
              <Link
                href="#fonctionnalites"
                className="inline-flex h-12 items-center justify-center rounded-full border border-[#eadbd6] bg-white px-7 text-sm font-extrabold text-[var(--hada-navy)] shadow-[0_16px_36px_rgba(43,33,79,0.07)] transition hover:border-[var(--hada-coral)] hover:text-[var(--hada-coral)] sm:h-[52px] sm:text-[15px]"
              >
                Découvrir Hada
              </Link>
            </div>
          </div>

          <div className="relative mx-auto hidden w-full max-w-[460px] md:block">
            <div className="absolute inset-0 translate-y-8 rounded-[48px] bg-[linear-gradient(145deg,rgba(251,105,116,0.2),rgba(255,173,51,0.16))] blur-3xl" />
            <div className="relative rounded-[42px] border border-[#f0ddd8] bg-white/82 p-5 shadow-[0_34px_90px_rgba(43,33,79,0.14)]">
              <div className="rounded-[34px] bg-[linear-gradient(160deg,#fff8f5,#fff0f1)] p-6">
                <Image src="/brand/hada-portrait-rays.png" alt="Hada accompagne votre organisation de mariage" width={420} height={420} priority className="mx-auto h-auto w-[76%] max-w-[310px]" />
                <div className="mt-5 rounded-[28px] bg-white p-5 shadow-[0_18px_42px_rgba(43,33,79,0.08)]">
                  <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--hada-coral)]">Aujourd'hui</p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.06em]">On avance sans se disperser.</p>
                  <div className="mt-5 grid gap-3 text-sm font-bold text-[#655b72]">
                    <span className="rounded-2xl bg-[#fdf3ef] px-4 py-3">Profil mariage clair</span>
                    <span className="rounded-2xl bg-[#fdf3ef] px-4 py-3">Budget structuré</span>
                    <span className="rounded-2xl bg-[#fdf3ef] px-4 py-3">Recherche prestataire ciblée</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="fonctionnalites" className="bg-[#120d24] px-5 py-16 text-white sm:px-8 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[var(--hada-gold)]">Fonctionnalités</p>
            <h2 className="mt-4 text-[clamp(30px,4.2vw,52px)] font-black leading-[1.02] tracking-[-0.065em]">
              Tout ce qu'il faut pour avancer avec méthode.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="group rounded-[30px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_24px_68px_rgba(0,0,0,0.18)] transition hover:-translate-y-1 hover:bg-white/[0.09]"
              >
                <div className="mb-8 flex items-center justify-between">
                  <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffd9dc]">{feature.eyebrow}</span>
                  <span className="text-3xl font-black text-white/12">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="text-2xl font-black leading-tight tracking-[-0.055em] sm:text-[28px]">{feature.title}</h3>
                <p className="mt-4 text-base font-medium leading-8 text-white/70">{feature.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-7 text-sm font-extrabold text-white transition hover:bg-[#e95361] sm:text-[15px]"
            >
              Essayer Hada
            </Link>
          </div>
        </div>
      </section>

      <section id="team" className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.78fr_1fr]">
          <div className="relative mx-auto hidden w-full max-w-[360px] md:block">
            <div className="absolute inset-[-8%] rounded-full bg-[radial-gradient(circle,rgba(251,105,116,0.18),transparent_62%)] blur-2xl" />
            <Image src="/brand/hada-full.png" alt="La Team Hada" width={520} height={520} className="relative mx-auto h-auto w-full" />
          </div>

          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[var(--hada-coral)]">La Team Hada</p>
            <h2 className="mt-4 max-w-3xl text-[clamp(30px,4.2vw,52px)] font-black leading-[1.02] tracking-[-0.065em]">
              Une wedding planner de poche, pensée pour les vrais couples.
            </h2>
            <p className="mt-6 max-w-2xl text-base font-medium leading-8 text-[#655b72] sm:text-lg">
              Hada ne remplace pas vos envies : elle vous aide à les transformer en décisions claires. Le produit est conçu pour vous faire gagner du temps, réduire les hésitations et garder une organisation lisible jusqu'au jour J.
            </p>
            <div className="mt-8 grid gap-4">
              {teamPrinciples.map((principle) => (
                <div key={principle} className="rounded-[26px] border border-[#f0ddd8] bg-white px-5 py-4 text-base font-bold leading-7 text-[var(--hada-navy)] shadow-[0_18px_44px_rgba(43,33,79,0.06)]">
                  {principle}
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center lg:justify-start">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-navy)] px-7 text-sm font-extrabold text-white transition hover:bg-[#3a2c67] sm:text-[15px]"
              >
                Tester Hada
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[38px] bg-[linear-gradient(135deg,var(--hada-coral),#ff8c75)] px-6 py-14 text-center text-white shadow-[0_26px_78px_rgba(251,105,116,0.26)] sm:px-10">
          <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-white/75">Prêt à avancer ?</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(30px,4.4vw,54px)] font-black leading-[1.02] tracking-[-0.065em]">
            Créez votre compte et laissez Hada mettre de l'ordre dans votre mariage.
          </h2>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-sm font-extrabold text-[var(--hada-coral)] transition hover:bg-[var(--hada-navy)] hover:text-white sm:text-[15px]"
          >
            Créer mon compte
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#f0ddd8] px-5 py-7 sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-[11px] font-semibold text-[#7c7379] sm:text-sm">
          <Image src="/brand/hada-wordmark.png" alt="Hada" width={150} height={46} className="h-auto w-[86px] shrink-0 sm:w-[112px]" />
          <div className="ml-auto flex shrink-0 items-center justify-end gap-3 whitespace-nowrap sm:gap-4">
            <Link href="/blog">Blog Hada</Link>
            <Link href="/privacy">Confidentialité</Link>
            <Link href="/cgu">CGU</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

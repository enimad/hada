import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog Hada - Conseils mariage, organisation et prestataires",
  description: "Guides pratiques pour organiser votre mariage : budget, lieu, prestataires, planning, inspirations et conseils concrets de wedding planner.",
  alternates: {
    canonical: "/blog"
  },
  openGraph: {
    title: "Blog Hada - Conseils mariage",
    description: "Des guides pratiques pour organiser votre mariage avec plus de clarté.",
    url: "https://hadawedding.fr/blog",
    siteName: "Hada",
    locale: "fr_FR",
    type: "website"
  }
};

export default function BlogPage() {
  const posts = getPublishedBlogPosts();
  const featuredPost = posts[0];
  const secondaryPosts = posts.slice(1);

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog Hada",
    url: "https://hadawedding.fr/blog",
    description: metadata.description
  };

  return (
    <main className="min-h-screen bg-[var(--hada-cream)] text-[var(--hada-navy)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }} />
      <header className="border-b border-[#f0ddd8] bg-white/70 px-5 py-5 backdrop-blur-xl sm:px-8">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4" aria-label="Navigation blog">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/brand/hada-wordmark.png" alt="Hada" width={160} height={50} priority className="h-auto w-[112px]" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden rounded-full border border-[#eadbd6] bg-white px-5 py-3 text-sm font-extrabold text-[var(--hada-navy)] sm:inline-flex">
              Retour accueil
            </Link>
            <Link href="/signup" className="rounded-full bg-[var(--hada-coral)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(251,105,116,0.24)]">
              Tester Hada
            </Link>
          </div>
        </nav>
      </header>

      <section className="px-5 py-12 text-center sm:px-8 sm:py-16">
        <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[var(--hada-coral)]">Blog Hada</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-[clamp(36px,5.4vw,68px)] font-black leading-[0.98] tracking-[-0.075em]">
          Des guides mariage utiles, doux et vraiment actionnables.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-8 text-[#655b72] sm:text-lg">
          Organisation, budget, prestataires, planning et petites décisions qui changent tout : le blog Hada rassemble des conseils concrets pour avancer sans se disperser.
        </p>
      </section>

      {featuredPost ? (
        <section className="px-5 pb-10 sm:px-8">
          <Link href={`/blog/${featuredPost.slug}`} className="mx-auto grid max-w-5xl overflow-hidden rounded-[36px] border border-[#f0ddd8] bg-white shadow-[0_24px_70px_rgba(43,33,79,0.08)] lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative min-h-[260px] bg-[#fff0f1] sm:min-h-[300px]">
              <Image src={featuredPost.heroImage} alt={featuredPost.heroAlt} fill priority className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-9">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--hada-coral)]">{featuredPost.category}</p>
              <h2 className="mt-4 text-[clamp(28px,4vw,42px)] font-black leading-[1.04] tracking-[-0.06em]">{featuredPost.title}</h2>
              <p className="mt-4 text-base font-medium leading-8 text-[#655b72]">{featuredPost.excerpt}</p>
              <p className="mt-6 text-sm font-extrabold text-[var(--hada-coral)]">Lire le guide</p>
            </div>
          </Link>
        </section>
      ) : (
        <section className="px-5 pb-10 text-center sm:px-8">
          <div className="mx-auto max-w-2xl rounded-[30px] border border-[#f0ddd8] bg-white p-7 shadow-[0_20px_60px_rgba(43,33,79,0.07)]">
            <h2 className="text-2xl font-black tracking-[-0.06em] sm:text-3xl">Les premiers articles arrivent bientôt.</h2>
            <p className="mt-4 text-base font-medium leading-7 text-[#655b72]">La zone Decap est prête pour publier les guides Hada dès qu'ils seront rédigés.</p>
          </div>
        </section>
      )}

      {secondaryPosts.length ? (
        <section className="px-5 pb-16 sm:px-8 sm:pb-24">
          <div className="mx-auto grid max-w-5xl gap-7 md:grid-cols-2">
            {secondaryPosts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group overflow-hidden rounded-[30px] border border-[#f0ddd8] bg-white shadow-[0_20px_54px_rgba(43,33,79,0.07)] transition hover:-translate-y-1">
                <div className="relative h-60 bg-[#fff0f1] sm:h-64">
                  <Image src={post.heroImage} alt={post.heroAlt} fill className="object-cover transition duration-500 group-hover:scale-[1.03]" sizes="(min-width: 768px) 50vw, 100vw" />
                </div>
                <div className="p-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--hada-coral)]">{post.category}</p>
                  <h2 className="mt-3 text-[24px] font-black leading-tight tracking-[-0.055em]">{post.title}</h2>
                  <p className="mt-4 text-sm font-medium leading-7 text-[#655b72]">{post.excerpt}</p>
                  <p className="mt-5 text-sm font-extrabold text-[var(--hada-coral)]">Continuer la lecture</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarkdownContent } from "@/components/markdown-content";
import { getPublishedBlogPost, getPublishedBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

type BlogArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedBlogPost(slug);

  if (!post) {
    return {
      title: "Article introuvable"
    };
  }

  return {
    title: post.seoTitle,
    description: post.seoDescription,
    alternates: {
      canonical: `/blog/${post.slug}`
    },
    openGraph: {
      title: post.seoTitle,
      description: post.seoDescription,
      url: `https://hadawedding.fr/blog/${post.slug}`,
      siteName: "Hada",
      images: [
        {
          url: post.heroImage,
          alt: post.heroAlt
        }
      ],
      locale: "fr_FR",
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt
    }
  };
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const post = getPublishedBlogPost(slug);
  if (!post) notFound();

  const relatedPosts = getPublishedBlogPosts()
    .filter((candidate) => candidate.slug !== post.slug)
    .slice(0, 3);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription,
    image: post.heroImage.startsWith("http") ? post.heroImage : `https://hadawedding.fr${post.heroImage}`,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: {
      "@type": "Organization",
      name: "Hada"
    },
    publisher: {
      "@type": "Organization",
      name: "Hada",
      logo: {
        "@type": "ImageObject",
        url: "https://hadawedding.fr/brand/hada-wordmark.png"
      }
    },
    mainEntityOfPage: `https://hadawedding.fr/blog/${post.slug}`
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Accueil",
        item: "https://hadawedding.fr"
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog Hada",
        item: "https://hadawedding.fr/blog"
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `https://hadawedding.fr/blog/${post.slug}`
      }
    ]
  };

  return (
    <main className="min-h-screen bg-[var(--hada-cream)] text-[var(--hada-navy)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <header className="border-b border-[#f0ddd8] bg-white/70 px-5 py-5 backdrop-blur-xl sm:px-8">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4" aria-label="Navigation article">
          <Link href="/blog" className="rounded-full border border-[#eadbd6] bg-white px-5 py-3 text-sm font-extrabold text-[var(--hada-navy)]">
            Blog Hada
          </Link>
          <Link href="/signup" className="rounded-full bg-[var(--hada-coral)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(251,105,116,0.24)]">
            Essayer Hada
          </Link>
        </nav>
      </header>

      <article>
        <section className="px-5 py-14 text-center sm:px-8 sm:py-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[var(--hada-coral)]">{post.category}</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-[clamp(40px,6vw,78px)] font-black leading-[0.95] tracking-[-0.08em]">{post.title}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-medium leading-8 text-[#655b72]">{post.description}</p>
          <p className="mt-5 text-sm font-extrabold text-[#9b8d8d]">{formatDate(post.publishedAt)} · {post.readingTime}</p>
        </section>

        <div className="px-5 sm:px-8">
          <div className="relative mx-auto h-[360px] max-w-5xl overflow-hidden rounded-[38px] border border-[#f0ddd8] bg-[#fff0f1] shadow-[0_28px_80px_rgba(43,33,79,0.08)] sm:h-[520px]">
            <Image src={post.heroImage} alt={post.heroAlt} fill priority className="object-cover" sizes="(min-width: 1024px) 900px, 100vw" />
          </div>
        </div>

        {post.videoUrl ? (
          <div className="mx-auto mt-8 max-w-3xl px-5 text-center sm:px-8">
            <a href={post.videoUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-full border border-[#ffd7d9] bg-white px-5 py-3 text-sm font-extrabold text-[var(--hada-coral)]">
              Voir la vidéo associée
            </a>
          </div>
        ) : null}

        <section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <MarkdownContent content={post.body} />
        </section>
      </article>

      {relatedPosts.length ? (
        <aside className="border-t border-[#f0ddd8] px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-black tracking-[-0.06em]">À lire aussi</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <Link key={relatedPost.slug} href={`/blog/${relatedPost.slug}`} className="rounded-[28px] border border-[#f0ddd8] bg-white p-5 shadow-[0_16px_40px_rgba(43,33,79,0.05)]">
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--hada-coral)]">{relatedPost.category}</p>
                  <h3 className="mt-3 text-xl font-black leading-tight tracking-[-0.05em]">{relatedPost.title}</h3>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </main>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(date));
}

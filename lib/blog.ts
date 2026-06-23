import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type BlogPost = {
  title: string;
  slug: string;
  description: string;
  category: string;
  publishedAt: string;
  updatedAt?: string;
  heroImage: string;
  heroAlt: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  draft: boolean;
  videoUrl?: string;
  body: string;
  readingTime: string;
};

const blogDirectory = path.join(process.cwd(), "content", "blog");

type Frontmatter = Record<string, unknown>;

export function getAllBlogPosts() {
  if (!fs.existsSync(blogDirectory)) {
    return [];
  }

  return fs
    .readdirSync(blogDirectory)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"))
    .map((fileName) => readBlogPost(fileName))
    .filter((post): post is BlogPost => Boolean(post))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function getPublishedBlogPosts(referenceDate = new Date()) {
  const referenceTime = referenceDate.getTime();

  return getAllBlogPosts().filter((post) => {
    const publishedTime = new Date(post.publishedAt).getTime();
    return !post.draft && Number.isFinite(publishedTime) && publishedTime <= referenceTime;
  });
}

export function getPublishedBlogPost(slug: string, referenceDate = new Date()) {
  return getPublishedBlogPosts(referenceDate).find((post) => post.slug === slug) ?? null;
}

export function getBlogCategories(posts: BlogPost[]) {
  return Array.from(new Set(posts.map((post) => post.category).filter(Boolean)));
}

function readBlogPost(fileName: string): BlogPost | null {
  try {
    const raw = fs.readFileSync(path.join(blogDirectory, fileName), "utf8");
    const parsed = matter(raw);
    const data = parsed.data as Frontmatter;
    const body = parsed.content.trim();
    const fallbackSlug = fileName.replace(/\.(md|mdx)$/i, "");
    const title = stringValue(data.title, "Guide mariage Hada");
    const description = stringValue(data.description, stringValue(data.excerpt, ""));
    const publishedAt = normalizeDateValue(data.publishedAt, new Date(0).toISOString());
    const excerpt = stringValue(data.excerpt, description);
    const seoTitle = stringValue(data.seoTitle, title);
    const seoDescription = stringValue(data.seoDescription, description);

    return {
      title,
      slug: stringValue(data.slug, fallbackSlug),
      description,
      category: stringValue(data.category, "Organisation"),
      publishedAt,
      updatedAt: normalizeDateValue(data.updatedAt, ""),
      heroImage: stringValue(data.heroImage, "/brand/hada-portrait-circle.png"),
      heroAlt: stringValue(data.heroAlt, title),
      excerpt,
      seoTitle,
      seoDescription,
      draft: booleanValue(data.draft, false),
      videoUrl: stringValue(data.videoUrl, ""),
      body,
      readingTime: estimateReadingTime(body)
    };
  } catch (error) {
    console.error(`[blog] Impossible de lire ${fileName}`, error);
    return null;
  }
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeDateValue(value: unknown, fallback: string) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  const raw = stringValue(value, "");
  if (!raw) return fallback;

  const frenchDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const normalized = frenchDate
    ? `${frenchDate[3]}-${frenchDate[2]}-${frenchDate[1]}T${frenchDate[4] ?? "00"}:${frenchDate[5] ?? "00"}:${frenchDate[6] ?? "00"}`
    : raw;
  const parsed = new Date(normalized);

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function estimateReadingTime(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min de lecture`;
}

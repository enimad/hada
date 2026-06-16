import fs from "node:fs";
import path from "node:path";

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

type Frontmatter = Record<string, string | boolean | undefined>;

export function getAllBlogPosts() {
  if (!fs.existsSync(blogDirectory)) {
    return [];
  }

  return fs
    .readdirSync(blogDirectory)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"))
    .map((fileName) => readBlogPost(fileName))
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

function readBlogPost(fileName: string): BlogPost {
  const raw = fs.readFileSync(path.join(blogDirectory, fileName), "utf8");
  const { data, body } = parseFrontmatter(raw);
  const fallbackSlug = fileName.replace(/\.(md|mdx)$/i, "");
  const title = stringValue(data.title, "Guide mariage Hada");
  const description = stringValue(data.description, stringValue(data.excerpt, ""));
  const publishedAt = stringValue(data.publishedAt, new Date(0).toISOString());
  const excerpt = stringValue(data.excerpt, description);
  const seoTitle = stringValue(data.seoTitle, title);
  const seoDescription = stringValue(data.seoDescription, description);

  return {
    title,
    slug: stringValue(data.slug, fallbackSlug),
    description,
    category: stringValue(data.category, "Organisation"),
    publishedAt,
    updatedAt: stringValue(data.updatedAt, ""),
    heroImage: stringValue(data.heroImage, "/brand/hada-portrait-circle.png"),
    heroAlt: stringValue(data.heroAlt, title),
    excerpt,
    seoTitle,
    seoDescription,
    draft: booleanValue(data.draft, false),
    videoUrl: stringValue(data.videoUrl, ""),
    body: body.trim(),
    readingTime: estimateReadingTime(body)
  };
}

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  if (!raw.startsWith("---")) {
    return { data: {}, body: raw };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { data: {}, body: raw };
  }

  const frontmatter = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const data: Frontmatter = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key) continue;

    data[key] = parseFrontmatterValue(rawValue);
  }

  return { data, body };
}

function parseFrontmatterValue(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function stringValue(value: string | boolean | undefined, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanValue(value: string | boolean | undefined, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function estimateReadingTime(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min de lecture`;
}

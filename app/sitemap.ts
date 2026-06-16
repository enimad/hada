import type { MetadataRoute } from "next";
import { getPublishedBlogPosts } from "@/lib/blog";

const siteUrl = "https://hadawedding.fr";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const blogPosts = getPublishedBlogPosts();

  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${siteUrl}/blog`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8
    },
    {
      url: `${siteUrl}/blog/rss.xml`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.2
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3
    },
    {
      url: `${siteUrl}/cgu`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3
    },
    ...blogPosts.map((post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt || post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7
    }))
  ];
}

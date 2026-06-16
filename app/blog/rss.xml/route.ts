import { getPublishedBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

const siteUrl = "https://hadawedding.fr";

export function GET() {
  const posts = getPublishedBlogPosts();
  const items = posts
    .map((post) => {
      const url = `${siteUrl}/blog/${post.slug}`;

      return `
        <item>
          <title>${escapeXml(post.title)}</title>
          <description>${escapeXml(post.seoDescription)}</description>
          <link>${url}</link>
          <guid>${url}</guid>
          <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
        </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0">
      <channel>
        <title>Blog Hada</title>
        <description>Guides mariage, organisation, budget et prestataires.</description>
        <link>${siteUrl}/blog</link>
        <language>fr-FR</language>
        ${items}
      </channel>
    </rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8"
    }
  });
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

import type { MetadataRoute } from "next";

const siteUrl = "https://hadawedding.fr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog", "/blog/", "/blog/rss.xml", "/privacy", "/cgu", "/googlebfadeaf45eff2836.html"],
        disallow: [
          "/admin",
          "/api/",
          "/auth/",
          "/budget",
          "/chat",
          "/login",
          "/logout",
          "/messages/",
          "/mon-offre",
          "/monmariage",
          "/onboarding",
          "/signup",
          "/vendors",
          "/venues"
        ]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  };
}

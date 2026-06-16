import type { NextConfig } from "next";

const privatePaths = [
  "/admin/:path*",
  "/api/:path*",
  "/auth/:path*",
  "/budget",
  "/chat",
  "/chat-v2",
  "/login/:path*",
  "/logout",
  "/messages/:path*",
  "/mon-offre",
  "/monmariage",
  "/onboarding/:path*",
  "/signup/:path*",
  "/vendors/:path*",
  "/venues/:path*"
];

const nextConfig: NextConfig = {
  async headers() {
    return privatePaths.map((source) => ({
      source,
      headers: [
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow"
        }
      ]
    }));
  }
};

export default nextConfig;

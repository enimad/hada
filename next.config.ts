import type { NextConfig } from "next";

const privatePaths = [
  "/api/:path*",
  "/auth/:path*",
  "/chat",
  "/login/:path*",
  "/logout",
  "/messages/:path*",
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

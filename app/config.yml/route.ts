import { NextRequest, NextResponse } from "next/server";
import { buildDecapConfig } from "@/lib/decap-config";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return new NextResponse(buildConfigForRequest(request), {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function buildConfigForRequest(request: NextRequest) {
  const localBackend = process.env.NODE_ENV === "development" && isLocalHostname(request.nextUrl.hostname);
  return buildDecapConfig({
    localBackend,
    siteUrl: localBackend ? request.nextUrl.origin : undefined
  });
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

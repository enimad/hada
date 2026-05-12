import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATHS = ["/chat", "/monmariage", "/vendors", "/venues", "/messages", "/onboarding"];
const LEGACY_PRODUCTION_HOSTS = new Set(["hada-wp.vercel.app"]);
const CANONICAL_PRODUCTION_ORIGIN = "https://hadawedding.fr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase().split(":")[0];

  if (host && LEGACY_PRODUCTION_HOSTS.has(host)) {
    return NextResponse.redirect(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL_PRODUCTION_ORIGIN), 308);
  }

  if (pathname === "/") {
    if (request.nextUrl.searchParams.has("code")) {
      return NextResponse.next();
    }

    const response = NextResponse.next();
    request.cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith("sb-") || cookie.name.includes("supabase"))
      .forEach((cookie) => {
        response.cookies.delete(cookie.name);
      });

    return response;
  }

  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Keep middleware fast and non-blocking. The chat/vendor APIs still perform the authoritative
  // Supabase token validation before returning private data.
  const hasAuthCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
  if (!hasAuthCookie) {
    return NextResponse.redirect(new URL("/404", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"]
};

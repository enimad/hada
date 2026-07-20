import { NextResponse, type NextRequest } from "next/server";
import { PASSWORD_RECOVERY_COOKIE, PASSWORD_RESET_PATH } from "./lib/auth/password-recovery";

const PROTECTED_PATHS = ["/budget", "/chat", "/mon-offre", "/monmariage", "/vendors", "/venues", "/messages", "/onboarding"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const recoveryCode = request.nextUrl.searchParams.get("code");
    const recoveryRequested = request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
    if (recoveryCode && recoveryRequested) {
      const callbackUrl = new URL("/auth/callback", request.url);
      callbackUrl.searchParams.set("code", recoveryCode);
      callbackUrl.searchParams.set("next", PASSWORD_RESET_PATH);
      const response = NextResponse.redirect(callbackUrl);
      response.cookies.delete(PASSWORD_RECOVERY_COOKIE);
      return response;
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
  matcher: [
    "/",
    "/budget/:path*",
    "/chat/:path*",
    "/mon-offre/:path*",
    "/monmariage/:path*",
    "/vendors/:path*",
    "/venues/:path*",
    "/messages/:path*",
    "/onboarding/:path*"
  ]
};

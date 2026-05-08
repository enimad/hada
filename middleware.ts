import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATHS = ["/chat", "/monmariage", "/vendors", "/venues", "/messages", "/onboarding"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
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
  matcher: ["/", "/chat/:path*", "/monmariage/:path*", "/vendors/:path*", "/venues/:path*", "/messages/:path*", "/onboarding/:path*"]
};

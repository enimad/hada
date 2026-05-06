import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-") || cookie.name.includes("supabase"))
    .forEach((cookie) => {
      response.cookies.delete(cookie.name);
    });

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { toSupabaseApiError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email manquant" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      const apiError = toSupabaseApiError(error);
      return NextResponse.json({ error: apiError.message }, { status: apiError.status });
    }

    const exists = data.users.some((user) => user.email?.toLowerCase() === email);
    return NextResponse.json({ exists });
  } catch (error) {
    const apiError = toSupabaseApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

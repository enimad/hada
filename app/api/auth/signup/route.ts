import { NextRequest, NextResponse } from "next/server";
import { toSupabaseApiError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe requis." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 6 caractères." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      const apiError = toSupabaseApiError(listError);
      return NextResponse.json({ error: apiError.message }, { status: apiError.status });
    }

    const existingUser = usersData.users.find((user) => user.email?.toLowerCase() === email);
    if (existingUser) {
      return NextResponse.json({ error: "Un compte existe déjà avec cette adresse email." }, { status: 409 });
    }

    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      const apiError = toSupabaseApiError(error);
      return NextResponse.json({ error: apiError.message }, { status: apiError.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = toSupabaseApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

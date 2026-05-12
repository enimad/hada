import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
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

  const supabase = createSupabaseServerClient();
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const existingUser = usersData.users.find((user) => user.email?.toLowerCase() === email);
  if (existingUser) {
    return NextResponse.json({ error: "Un compte existe déjà avec cette adresse email." }, { status: 409 });
  }

  const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { error } = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${env.appUrl}/auth/continue`
    }
  });

  if (error) {
    const isEmailRateLimit = /email rate limit/i.test(error.message);
    return NextResponse.json(
      {
        error: isEmailRateLimit
          ? "Trop d'emails de confirmation ont été envoyés récemment. Réessayez dans quelques minutes."
          : error.message
      },
      { status: isEmailRateLimit ? 429 : 500 }
    );
  }

  return NextResponse.json({ ok: true, requiresEmailConfirmation: true });
}

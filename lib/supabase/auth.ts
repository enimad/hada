import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env, validateServerEnv } from "@/lib/env";

export function createSupabaseAuthClient() {
  validateServerEnv();

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function getAuthenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  if (!token) {
    return { user: null, error: "Missing bearer token" };
  }

  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: error?.message ?? "Unauthorized" };
  }

  return { user: data.user, error: null };
}

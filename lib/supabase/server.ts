import { createClient } from "@supabase/supabase-js";
import { env, validateServerEnv } from "@/lib/env";

export function createSupabaseServerClient() {
  validateServerEnv();

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

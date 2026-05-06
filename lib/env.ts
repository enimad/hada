const requiredServerEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MISTRAL_API_KEY"
] as const;

function assertEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function parseSecretList(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const firecrawlApiKeys = Array.from(new Set([...parseSecretList(process.env.FIRECRAWL_API_KEYS), ...parseSecretList(process.env.FIRECRAWL_API_KEY)]));

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  firecrawlApiKey: firecrawlApiKeys[0] ?? "",
  firecrawlApiKeys,
  mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
  mistralModel: process.env.MISTRAL_MODEL ?? "mistral-medium-latest"
};

export function validateServerEnv() {
  for (const key of requiredServerEnv) {
    assertEnv(key, process.env[key]);
  }
}

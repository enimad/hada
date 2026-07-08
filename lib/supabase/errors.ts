import { env } from "@/lib/env";

type ApiError = {
  message: string;
  status: number;
};

export function toSupabaseApiError(error: unknown): ApiError {
  const message = readString(error, "message") ?? "Erreur Supabase inconnue.";
  const cause = readObject(error, "cause");
  const causeMessage = readString(cause, "message") ?? "";
  const code = readString(error, "code") ?? readString(cause, "code");
  const hostname = readString(cause, "hostname") ?? readSupabaseHostname();

  if (message.startsWith("Missing environment variable:")) {
    return {
      status: 500,
      message: `Configuration serveur incomplète : ${message.replace("Missing environment variable: ", "")}.`
    };
  }

  if (code === "ENOTFOUND" || message.includes("fetch failed") || causeMessage.includes("ENOTFOUND")) {
    return {
      status: 503,
      message: `Connexion Supabase impossible${hostname ? ` (${hostname})` : ""}. Vérifiez NEXT_PUBLIC_SUPABASE_URL dans .env.local, puis redémarrez le serveur local.`
    };
  }

  return {
    status: readNumber(error, "status") ?? 500,
    message
  };
}

function readObject(source: unknown, key: string) {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" ? value : null;
}

function readString(source: unknown, key: string) {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readNumber(source: unknown, key: string) {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function readSupabaseHostname() {
  try {
    return env.supabaseUrl ? new URL(env.supabaseUrl).hostname : "";
  } catch {
    return "";
  }
}

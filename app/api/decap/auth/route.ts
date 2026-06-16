import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const clientId = process.env.DECAP_GITHUB_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return htmlResponse(renderSetupError("La variable DECAP_GITHUB_CLIENT_ID est manquante."));
  }

  const callbackUrl = new URL("/api/decap/callback", request.url);
  const state = request.nextUrl.searchParams.get("state") ?? crypto.randomUUID();
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function renderSetupError(message: string) {
  return `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Configuration Decap incomplète</title>
      </head>
      <body style="font-family: sans-serif; padding: 32px; line-height: 1.5;">
        <h1>Connexion GitHub indisponible</h1>
        <p>${escapeHtml(message)}</p>
        <p>Ajoutez les variables Decap/GitHub dans l'environnement courant puis rechargez cette fenêtre.</p>
      </body>
    </html>`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

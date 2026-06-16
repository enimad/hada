import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const clientId = process.env.DECAP_GITHUB_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.DECAP_GITHUB_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET;

  if (error) {
    return htmlResponse(renderOAuthMessage("error", { message: error }));
  }

  if (!code) {
    return htmlResponse(renderOAuthMessage("error", { message: "Code GitHub manquant." }));
  }

  if (!clientId || !clientSecret) {
    return htmlResponse(renderOAuthMessage("error", { message: "Variables Decap/GitHub manquantes dans l'environnement courant." }));
  }

  const callbackUrl = new URL("/api/decap/callback", request.url);
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl.toString()
    })
  });

  const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    return htmlResponse(
      renderOAuthMessage("error", {
        message: tokenData.error_description ?? tokenData.error ?? "GitHub n'a pas renvoyé de jeton d'accès."
      })
    );
  }

  return htmlResponse(
    renderOAuthMessage("success", {
      token: tokenData.access_token,
      provider: "github"
    })
  );
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

function renderOAuthMessage(type: "success" | "error", payload: Record<string, string>) {
  const message =
    type === "success" && payload.token
      ? `authorization:github:${type}:${JSON.stringify({ token: payload.token })}`
      : `authorization:github:${type}:${JSON.stringify(payload)}`;
  const safeMessage = JSON.stringify(message);
  const statusText = type === "success" ? "Connexion réussie" : "Connexion impossible";

  return `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>${statusText}</title>
      </head>
      <body style="font-family: sans-serif; padding: 32px; line-height: 1.5;">
        <h1>${statusText}</h1>
        <p>Connexion transmise à Decap CMS. Cette fenêtre va se fermer automatiquement.</p>
        <script>
          (function () {
            var message = ${safeMessage};
            var didAuthorize = false;

            function sendAuthorization(targetOrigin) {
              if (!window.opener) return false;
              didAuthorize = true;
              window.opener.postMessage(message, targetOrigin || window.location.origin);
              setTimeout(function () {
                if (window.opener) window.close();
              }, 700);
              return true;
            }

            window.addEventListener("message", function (event) {
              sendAuthorization(event.origin);
            }, false);

            if (window.opener) {
              window.opener.postMessage("authorizing:github", "*");
            }

            setTimeout(function () {
              if (!didAuthorize && window.opener) {
                window.opener.postMessage("authorizing:github", "*");
              }
            }, 250);

            setTimeout(function () {
              if (!didAuthorize) {
                sendAuthorization("*");
              }
            }, 1200);
          })();
        </script>
      </body>
    </html>`;
}

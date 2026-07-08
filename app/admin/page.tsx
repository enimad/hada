import Script from "next/script";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Blog Hada",
  robots: {
    index: false,
    follow: false
  }
};

export default function DecapAdminPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f7]">
      <div id="nc-root" />
      <noscript>
        <div className="mx-auto max-w-xl p-8 text-center font-sans">
          JavaScript est nécessaire pour accéder à l'interface d'édition du Blog Hada.
        </div>
      </noscript>
      <Script id="decap-oauth-bridge" strategy="afterInteractive">
        {`
          (function () {
            var storageKey = "hada:decap-oauth-message";

            function relayStoredAuthorization(value) {
              if (!value || typeof value !== "string" || value.indexOf("authorization:github:") !== 0) return;

              try {
                window.localStorage.removeItem(storageKey);
              } catch (error) {}

              [0, 250, 900, 1800].forEach(function (delay) {
                setTimeout(function () {
                  window.postMessage(value, window.location.origin);
                }, delay);
              });
            }

            window.addEventListener("storage", function (event) {
              if (event.key === storageKey) relayStoredAuthorization(event.newValue);
            });

            function drainStorage() {
              try {
                relayStoredAuthorization(window.localStorage.getItem(storageKey));
              } catch (error) {}
            }

            drainStorage();
            [500, 1500, 3000].forEach(function (delay) {
              setTimeout(drainStorage, delay);
            });
          })();
        `}
      </Script>
      <Script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js" strategy="afterInteractive" />
    </main>
  );
}

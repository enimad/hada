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
      <Script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js" strategy="afterInteractive" />
    </main>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PostHogIdentity } from "@/components/posthog-identity";
import "./globals.css";

const siteUrl = "https://hadawedding.fr";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hada - Wedding planner IA pour organiser votre mariage",
    template: "%s | Hada"
  },
  description:
    "Hada aide les futurs mariés à organiser leur mariage avec un chat wedding planner, un budget clair, une checklist et des recherches de prestataires personnalisées.",
  keywords: ["wedding planner IA", "organisation mariage", "budget mariage", "prestataires mariage", "checklist mariage"],
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/blog/rss.xml"
    }
  },
  openGraph: {
    title: "Hada - Wedding planner IA pour organiser votre mariage",
    description: "Organisez votre mariage avec Hada : profil mariage, chat intelligent, budget et recherche de prestataires personnalisée.",
    url: siteUrl,
    siteName: "Hada",
    images: [
      {
        url: "/brand/hada-portrait-circle.png",
        width: 320,
        height: 320,
        alt: "Hada, wedding planner IA"
      }
    ],
    locale: "fr_FR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Hada - Wedding planner IA pour organiser votre mariage",
    description: "Un wedding planner de poche pour organiser votre mariage avec plus de clarté.",
    images: ["/brand/hada-portrait-circle.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <PostHogIdentity />
        {children}
      </body>
    </html>
  );
}

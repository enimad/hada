import type { Metadata } from "next";
import MonOffrePageClient from "./mon-offre-page-client";

export const metadata: Metadata = {
  title: "Mon offre | Hada",
  robots: {
    index: false,
    follow: false
  }
};

export default function MonOffrePage() {
  return <MonOffrePageClient />;
}

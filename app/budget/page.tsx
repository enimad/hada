import type { Metadata } from "next";
import BudgetPageClient from "./budget-page-client";

export const metadata: Metadata = {
  title: "Budget | Hada",
  robots: {
    index: false,
    follow: false
  }
};

export default function BudgetPage() {
  return <BudgetPageClient />;
}

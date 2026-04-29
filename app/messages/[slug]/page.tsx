import { redirect } from "next/navigation";

export default async function LegacyMessagesPage() {
  redirect("/chat");
}

"use client";

import { FormEvent, useState, useTransition } from "react";
import { Shell } from "@/components/shell";

type UiMessage = {
  role: "user" | "assistant";
  content: string;
};

const starterSummary = {
  couple: "Lea & Hugo",
  date: "19 juin 2027",
  location: "Aix-en-Provence",
  guests: "120 invites",
  budget: "25 000 - 35 000 EUR",
  style: "Elegant provençal"
};

export default function ChatPage() {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      role: "assistant",
      content:
        "Bonjour, je suis Hada. Vous preparez un mariage elegant a Aix-en-Provence pour 120 invites en juin 2027. Quel prestataire voulez-vous trouver en premier ?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");

    startTransition(async () => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "demo-user",
          messages: nextMessages
        })
      });

      const result = await response.json();

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            result.assistantMessage ??
            "Je n'ai pas pu formuler une reponse pour le moment. Verifie la configuration Mistral et Supabase."
        }
      ]);
    });
  }

  return (
    <Shell
      title="Chat Hada"
      subtitle="Hada reutilise le profil mariage pour reformuler le contexte, poser des questions utiles et preparer la recherche de prestataires."
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-[28px] bg-white/80 p-6 shadow-card">
          <p className="text-xs uppercase tracking-[0.3em] text-clay">Recap profil</p>
          <div className="mt-5 grid gap-3 text-sm">
            <SummaryItem label="Couple" value={starterSummary.couple} />
            <SummaryItem label="Date" value={starterSummary.date} />
            <SummaryItem label="Zone" value={starterSummary.location} />
            <SummaryItem label="Invites" value={starterSummary.guests} />
            <SummaryItem label="Budget" value={starterSummary.budget} />
            <SummaryItem label="Style" value={starterSummary.style} />
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col rounded-[28px] bg-white/85 p-6 shadow-card">
          <div className="flex-1 space-y-4 overflow-y-auto">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[80%] rounded-[24px] px-5 py-4 text-sm leading-7 ${
                  message.role === "assistant"
                    ? "bg-[#f7f1e8] text-ink"
                    : "ml-auto bg-ink text-white"
                }`}
              >
                {message.content}
              </div>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex gap-3">
            <input
              className="flex-1 rounded-full border border-black/10 bg-white px-5 py-4 text-sm"
              placeholder="Ex: Je cherche un lieu avec hebergement sur place."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button disabled={isPending} className="rounded-full bg-clay px-6 py-4 text-sm text-white">
              {isPending ? "Envoi..." : "Envoyer"}
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-black/45">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArrowUpIcon, MicIcon } from "@/components/mobile-screen";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UiChatMessage } from "@/lib/types";

export default function ChatPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showBeta, setShowBeta] = useState(true);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadConversation() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setIsPreviewMode(true);
        setMessages([
          {
            id: "preview-1",
            role: "assistant",
            content:
              "Bienvenue dans Hada. Connectez-vous pour retrouver votre profil mariage, votre historique de chat et vos recommandations de prestataires."
          }
        ]);
        setIsLoading(false);
        return;
      }

      setAccessToken(session.access_token);

      const response = await fetch("/api/chat", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as {
          messages: UiChatMessage[];
        };
        setMessages(result.messages ?? []);
      } else {
        setMessages([
          {
            id: "fallback-1",
            role: "assistant",
            content: "Je n'ai pas pu charger l'historique pour le moment. Vous pouvez quand meme continuer a discuter avec moi."
          }
        ]);
      }

      setIsLoading(false);
    }

    loadConversation();
  }, []);

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function submitMessage() {
    const content = draft.trim();
    if (!content || isSubmitting) return;

    const optimisticMessage: UiChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content
    };

    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setIsSubmitting(true);

    if (!accessToken) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "Connectez-vous pour utiliser le chat IA complet de Hada."
        }
      ]);
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ content })
      });

      const result = await response.json();
      if (!response.ok) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            content: result.error ?? "Je rencontre un souci temporaire pour repondre."
          }
        ]);
        return;
      }

      setMessages((current) => [...current, result.assistantMessage]);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell active="chat">
        <div />
      </AppShell>
    );
  }

  return (
    <AppShell active="chat">
      <div className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-4xl flex-col pb-40">
        {showBeta ? (
          <div className="sticky top-20 z-20 mx-auto mb-6 w-full max-w-[680px]">
            <div className="rounded-[22px] border border-[#ffd4d8] bg-[#fff1f3] px-4 py-4 shadow-[0_10px_24px_rgba(46,28,54,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full border border-[var(--hada-coral)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--hada-coral)]">
                    Beta
                  </span>
                  <p className="mt-3 text-[14px] leading-6 text-[#504a49]">
                    Hada est maintenant connectee a Supabase et Mistral. La recherche prestataire fonctionnelle est active sur le parcours lieux.
                  </p>
                </div>
                <button type="button" onClick={() => setShowBeta(false)} className="text-[20px] font-semibold text-[#7a6f72]">
                  x
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col gap-5">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[92%] rounded-[26px] px-5 py-4 text-[16px] leading-8 shadow-[0_8px_24px_rgba(46,28,54,0.05)] sm:max-w-[80%] sm:text-[18px] ${
                  message.role === "user" ? "bg-[var(--hada-coral)] text-white" : "bg-white text-[var(--hada-navy)]"
                }`}
              >
                <p className="whitespace-pre-line">{message.content}</p>
                {message.ctaHref && message.ctaLabel ? (
                  <Link
                    href={message.ctaHref}
                    className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
                  >
                    {message.ctaLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={bottomAnchorRef} />
        </div>

        {isPreviewMode ? <p className="mt-6 text-center text-[13px] text-[#9a8c90]">Mode preview sans session active.</p> : null}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#eee5e0] bg-[rgba(253,249,246,0.95)] px-4 py-4 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl">
            <div className="rounded-[28px] border border-[#eadfda] bg-white px-4 pb-4 pt-4 shadow-[0_10px_28px_rgba(46,28,54,0.08)]">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder="Pose ta question a Hada..."
                rows={1}
                className="min-h-[70px] w-full resize-none bg-transparent text-[16px] leading-7 text-[var(--hada-navy)] outline-none placeholder:text-[#8b817f] sm:text-[17px]"
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[28px] font-light text-[#955c61]"
                >
                  +
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[#955c61]"
                  >
                    <MicIcon className="h-5 w-5" />
                  </button>
                  <button
                  type="button"
                  onClick={submitMessage}
                  disabled={!draft.trim() || isSubmitting}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--hada-coral)] text-white shadow-[0_12px_24px_rgba(251,105,116,0.24)] disabled:opacity-50"
                >
                  <ArrowUpIcon className="h-5 w-5" />
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

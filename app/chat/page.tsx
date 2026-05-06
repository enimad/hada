"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ArrowUpIcon, HadaMark, MicIcon, PlusIcon, SearchIcon, SparkIcon } from "@/components/mobile-screen";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UiChatMessage } from "@/lib/types";

const BETA_TOAST = "Cette fonctionnalité n'est pas disponible en version bêta.";
const BETA_BANNER =
  "Hada est en version bêta. Comme chaque beau mariage, les détails se peaufinent avec soin. Certaines fonctionnalités sont en cours de finalisation - merci pour votre patience et votre confiance.";

export default function ChatPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showBeta, setShowBeta] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamedContent, setStreamedContent] = useState<Record<string, string>>({});
  const [waitingLabel, setWaitingLabel] = useState("Hada prépare la recherche");
  const [betaToast, setBetaToast] = useState("");
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const waitingTimeoutRefs = useRef<number[]>([]);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadConversation() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/404");
        return;
      }

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
      setUserId(session.user.id);
      setShowBeta(window.sessionStorage.getItem(getBetaBannerKey(session.user.id)) !== "hidden");

      const response = await fetch("/api/chat", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = (await response.json()) as {
          messages: UiChatMessage[];
        };
        setMessages((result.messages ?? []).map(normalizeMessage));
      } else {
        setMessages([
          {
            id: "fallback-1",
            role: "assistant",
            content: "Je n’ai pas pu charger l’historique pour le moment. Vous pouvez quand même continuer à discuter avec moi."
          }
        ]);
      }

      setIsLoading(false);
    }

    void loadConversation();
  }, [router]);

  useEffect(() => {
    const behavior = isFirstRenderRef.current ? "auto" : "smooth";
    bottomAnchorRef.current?.scrollIntoView({ behavior, block: "end" });
    isFirstRenderRef.current = false;
  }, [messages, streamedContent]);

  useEffect(() => {
    if (!betaToast) return;
    const timer = window.setTimeout(() => setBetaToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [betaToast]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      clearWaitingTimers();
    };
  }, []);

  async function submitMessage(options?: { contentOverride?: string; action?: string }) {
    const content = options?.contentOverride?.trim() || draft.trim();
    if (!content || isSubmitting) return;

    const placeholderId = `assistant-typing-${Date.now()}`;
    const optimisticMessage: UiChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content
    };

    setMessages((current) => [...current, optimisticMessage, { id: placeholderId, role: "assistant", content: "" }]);
    setTypingMessageId(placeholderId);
    setWaitingLabel("Hada prépare la recherche");
    scheduleWaitingLabels();
    setDraft("");
    setIsSubmitting(true);

    if (!accessToken) {
      setMessages((current) => [
        ...current.filter((message) => message.id !== placeholderId),
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "Connectez-vous pour utiliser le chat IA complet de Hada."
        }
      ]);
      setTypingMessageId(null);
      clearWaitingTimers();
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
        body: JSON.stringify({ content, action: options?.action })
      });

      const result = await response.json();
      if (!response.ok) {
        setMessages((current) => [
          ...current.filter((message) => message.id !== placeholderId),
          {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            content: result.error ?? "Je rencontre un souci temporaire pour répondre."
          }
        ]);
        setTypingMessageId(null);
        clearWaitingTimers();
        return;
      }

      const assistantMessage = normalizeMessage(result.assistantMessage);
      setMessages((current) => current.map((message) => (message.id === placeholderId ? assistantMessage : message)));
      setTypingMessageId(null);
      clearWaitingTimers();
      startStreamingMessage(assistantMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  function scheduleWaitingLabels() {
    clearWaitingTimers();
    waitingTimeoutRefs.current = [
      window.setTimeout(() => setWaitingLabel("Recherche des prestataires en cours"), 3500),
      window.setTimeout(() => setWaitingLabel("Vérification des résultats trouvés"), 8500),
      window.setTimeout(() => setWaitingLabel("Création des fiches prestataires"), 15000)
    ];
  }

  function clearWaitingTimers() {
    waitingTimeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    waitingTimeoutRefs.current = [];
  }

  function startStreamingMessage(message: UiChatMessage) {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    const fullText = message.content;
    setStreamingMessageId(message.id);
    setStreamedContent((current) => ({ ...current, [message.id]: "" }));

    let index = 0;

    const step = () => {
      const nextChunk = pickChunkSize(fullText, index);
      index = Math.min(fullText.length, index + nextChunk);

      setStreamedContent((current) => ({ ...current, [message.id]: fullText.slice(0, index) }));

      if (index >= fullText.length) {
        typingTimeoutRef.current = null;
        setStreamingMessageId(null);
        return;
      }

      typingTimeoutRef.current = window.setTimeout(step, pickTypingDelay(fullText[index - 1] ?? ""));
    };

    typingTimeoutRef.current = window.setTimeout(step, 80);
  }

  function closeBetaBanner() {
    setShowBeta(false);
    if (userId) {
      window.sessionStorage.setItem(getBetaBannerKey(userId), "hidden");
    }
  }

  if (isLoading) {
    return (
      <AppShell
        active="chat"
        mobileTitleNode={<HadaMark className="h-8 w-8" />}
        mobileRightSlot={<BetaIconButton label="Recherche bêta" onClick={() => setBetaToast(BETA_TOAST)} icon={<SearchIcon className="h-4 w-4" />} />}
      >
        <div className="flex min-h-[calc(100vh-180px)] items-center justify-center">
          <div className="w-full max-w-[520px] rounded-[30px] border border-[#efe2dc] bg-white/90 p-6 shadow-[0_18px_40px_rgba(46,28,54,0.08)]">
            <div className="flex items-center gap-4">
              <div className="hada-float rounded-full bg-[#fff3f4] p-2">
                <HadaMark className="h-14 w-14" />
              </div>
              <div>
                <p className="text-[18px] font-semibold text-[var(--hada-navy)]">Hada prépare la conversation</p>
                <p className="mt-1 text-[14px] text-[#877d7c]">Chargement des messages et de votre contexte mariage...</p>
              </div>
            </div>
            <div className="mt-6 rounded-full bg-[#f3e8e3] p-1 hada-progress">
              <div className="h-2.5 rounded-full bg-[linear-gradient(90deg,#fb6974,#ffad33)] opacity-90" />
            </div>
          </div>
        </div>
        <BetaToast message={betaToast} />
      </AppShell>
    );
  }

  return (
    <AppShell
      active="chat"
      mobileTitleNode={<HadaMark className="h-8 w-8" />}
      mobileRightSlot={<BetaIconButton label="Recherche bêta" onClick={() => setBetaToast(BETA_TOAST)} icon={<SearchIcon className="h-4 w-4" />} />}
    >
      <div className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-4xl flex-col">
        {showBeta ? (
          <div className="sticky top-20 z-20 mx-auto mb-6 w-full max-w-[680px]">
            <div className="rounded-[22px] border border-[#ffd4d8] bg-[#fff1f3] px-4 py-4 shadow-[0_10px_24px_rgba(46,28,54,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full border border-[var(--hada-coral)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--hada-coral)]">
                    Bêta
                  </span>
                  <p className="mt-3 text-[14px] leading-6 text-[#504a49]">{BETA_BANNER}</p>
                </div>
                <button type="button" onClick={closeBetaBanner} className="text-[20px] font-semibold text-[#7a6f72]">
                  ×
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-[164px] flex flex-1 flex-col gap-5">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[92%] sm:max-w-[80%] ${message.role === "user" ? "" : "w-full"}`}>
                <div
                  className={`hada-fade-up rounded-[26px] px-5 py-4 text-[16px] leading-7 shadow-[0_8px_24px_rgba(46,28,54,0.05)] sm:text-[18px] sm:leading-[1.65] ${
                    message.role === "user" ? "bg-[var(--hada-coral)] text-white" : "bg-white text-[var(--hada-navy)]"
                  }`}
                >
                  {typingMessageId === message.id ? (
                    <TypingBubble label={waitingLabel} />
                  ) : (
                    <MessageBody
                      content={streamingMessageId === message.id ? streamedContent[message.id] ?? "" : message.content}
                      isStreaming={streamingMessageId === message.id}
                    />
                  )}
                </div>
                {message.ctaHref && message.ctaLabel && streamingMessageId !== message.id && typingMessageId !== message.id ? (
                  <div className="mt-3 flex">
                    {message.ctaAction === "retry_search" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void submitMessage({
                            contentOverride: "Relance la recherche avec des critères élargis.",
                            action: "retry_search"
                          })
                        }
                        disabled={isSubmitting}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                      >
                        {message.ctaLabel}
                      </button>
                    ) : message.ctaHref.startsWith("http") ? (
                      <a
                        href={message.ctaHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          event.preventDefault();
                          const href = message.ctaHref;
                          if (!href) return;
                          const opened = window.open(href, "_blank", "noopener,noreferrer");
                          if (!opened) {
                            window.location.href = href;
                          }
                        }}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
                      >
                        {message.ctaLabel}
                      </a>
                    ) : (
                      <Link
                        href={message.ctaHref}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-5 text-[15px] font-semibold text-white"
                      >
                        {message.ctaLabel}
                      </Link>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={bottomAnchorRef} className="h-px" style={{ scrollMarginBottom: "240px" }} />
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
                    void submitMessage();
                  }
                }}
                placeholder="Pose ta question à Hada..."
                rows={1}
                className="min-h-[70px] w-full resize-none bg-transparent text-[16px] leading-7 text-[var(--hada-navy)] outline-none placeholder:text-[#8b817f] sm:text-[17px]"
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setBetaToast(BETA_TOAST)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[#955c61]"
                  aria-label="Ajouter une pièce jointe"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBetaToast(BETA_TOAST)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#eadfda] bg-white text-[#955c61]"
                    aria-label="Envoyer une note vocale"
                  >
                    <MicIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitMessage()}
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
      <BetaToast message={betaToast} />
    </AppShell>
  );
}

function MessageBody({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const blocks = parseMessageBlocks(content);

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.type === "table") {
          return <MessageTable key={`table-${index}`} rows={block.rows} />;
        }

        const isListItem = /^[•\-\d]/.test(block.text);
        const isLastBlock = index === blocks.length - 1;
        return (
          <p key={`${block.text}-${index}`} className={`whitespace-pre-line ${isListItem ? "pl-2" : ""}`}>
            {block.text}
            {isStreaming && isLastBlock ? <span className="ml-1 inline-block h-5 w-[2px] translate-y-1 bg-current align-middle hada-pulse" /> : null}
          </p>
        );
      })}
      {!blocks.length && isStreaming ? <span className="inline-block h-6 w-[2px] bg-current hada-pulse" /> : null}
    </div>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[#8e8685]">
      <SparkIcon className="h-4 w-4 text-[var(--hada-coral)]" />
      <span className="text-[15px] font-medium">{label}</span>
      <span className="flex items-center gap-1">
        <span className="hada-pulse h-2 w-2 rounded-full bg-[#cab8b5]" />
        <span className="hada-pulse h-2 w-2 rounded-full bg-[#cab8b5]" style={{ animationDelay: "0.2s" }} />
        <span className="hada-pulse h-2 w-2 rounded-full bg-[#cab8b5]" style={{ animationDelay: "0.4s" }} />
      </span>
    </div>
  );
}

function BetaIconButton({ icon, onClick, label }: { icon: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e7ddd8] bg-white text-[#5a5451] shadow-[0_8px_20px_rgba(46,28,54,0.08)]"
    >
      {icon}
    </button>
  );
}

function BetaToast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
      <div className="rounded-full bg-[var(--hada-navy)] px-5 py-3 text-center text-[13px] font-medium text-white shadow-[0_16px_34px_rgba(43,33,79,0.25)]">
        {message}
      </div>
    </div>
  );
}

function normalizeMessage(message: UiChatMessage): UiChatMessage {
  if (message.role !== "assistant") return message;

  return {
    ...message,
    content: sanitizeAssistantMessage(message.content)
  };
}

function sanitizeAssistantMessage(input: string) {
  return input
    .replace(/\r/g, "")
    .replace(/^---$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\d+\.\s+/gm, "• ")
    .replace(/^\-\s*/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickTypingDelay(lastChar: string) {
  if (/[.!?]/.test(lastChar)) return 80 + Math.floor(Math.random() * 35);
  if (/[,:;]/.test(lastChar)) return 50 + Math.floor(Math.random() * 30);
  if (/\s/.test(lastChar)) return 12 + Math.floor(Math.random() * 14);
  return 6 + Math.floor(Math.random() * 10);
}

function pickChunkSize(fullText: string, index: number) {
  const nextChar = fullText[index] ?? "";
  if (/\s/.test(nextChar)) return 1;
  const random = Math.random();
  if (random < 0.12) return 1;
  if (random < 0.52) return 2;
  if (random < 0.88) return 3;
  return 4 + Math.round(Math.random());
}

function getBetaBannerKey(userId: string) {
  return `hada:chat-beta-hidden:${userId}`;
}

function parseMessageBlocks(content: string) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: Array<{ type: "text"; text: string } | { type: "table"; rows: string[][] }> = [];

  for (let index = 0; index < lines.length; ) {
    if (isTableLine(lines[index])) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }

      const rows = tableLines
        .map(parseTableRow)
        .filter((row) => row.length > 0)
        .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));

      if (rows.length >= 2) {
        blocks.push({ type: "table", rows });
        continue;
      }

      tableLines.forEach((line) => blocks.push({ type: "text", text: line }));
      continue;
    }

    blocks.push({ type: "text", text: lines[index] });
    index += 1;
  }

  return blocks;
}

function isTableLine(line: string) {
  return (line.match(/\|/g) ?? []).length >= 2;
}

function parseTableRow(line: string) {
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function MessageTable({ rows }: { rows: string[][] }) {
  const [header, ...body] = rows;

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#eee1dd] bg-[#fff8f6]">
      <div className="grid border-b border-[#eee1dd] bg-[#fff0f1]" style={{ gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))` }}>
        {header.map((cell) => (
          <div key={cell} className="px-3 py-2 text-[13px] font-semibold text-[var(--hada-navy)]">
            {cell}
          </div>
        ))}
      </div>
      {body.map((row, rowIndex) => (
        <div
          key={`${row.join("-")}-${rowIndex}`}
          className="grid border-b border-[#f4e8e3] last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))` }}
        >
          {header.map((_, cellIndex) => (
            <div key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 text-[13px] leading-5 text-[#5f576d]">
              {row[cellIndex] ?? ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

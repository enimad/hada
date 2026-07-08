import type { ReactNode } from "react";

export function MarkdownContent({ content }: { content: string }) {
  return <div className="space-y-6">{renderBlocks(content)}</div>;
}

function renderBlocks(content: string) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-lg font-medium leading-9 text-[#5f566a]">
          {renderInline(text)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-3 rounded-[28px] border border-[#f0ddd8] bg-white/80 p-6 shadow-[0_16px_40px_rgba(43,33,79,0.05)]">
        {list.map((item) => (
          <li key={item} className="flex gap-3 text-base font-bold leading-7 text-[var(--hada-navy)]">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--hada-coral)]" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="pt-5 text-2xl font-black leading-tight tracking-[-0.05em] text-[var(--hada-navy)]">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="pt-8 text-3xl font-black leading-tight tracking-[-0.06em] text-[var(--hada-navy)] sm:text-4xl">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h1-${blocks.length}`} className="pt-8 text-3xl font-black leading-tight tracking-[-0.06em] text-[var(--hada-navy)] sm:text-4xl">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`quote-${blocks.length}`} className="rounded-[30px] border border-[#ffd7d9] bg-[#fff0f1] p-6 text-xl font-extrabold leading-8 tracking-[-0.04em] text-[var(--hada-navy)]">
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    const listItems = readListItems(trimmed);
    if (listItems) {
      flushParagraph();
      list.push(...listItems);
      return;
    }

    const imageMatch = trimmed.match(/^!\[(.*)]\((.*)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      blocks.push(
        <figure key={`img-${blocks.length}`} className="overflow-hidden rounded-[32px] border border-[#f0ddd8] bg-white shadow-[0_22px_60px_rgba(43,33,79,0.08)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageMatch[2]} alt={imageMatch[1]} className="h-auto w-full object-cover" loading="lazy" />
        </figure>
      );
      return;
    }

    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return blocks;
}

function readListItems(line: string) {
  const markerMatch = line.match(/^([-*])\s+/);
  if (!markerMatch) return null;

  const marker = markerMatch[1];
  const content = line.slice(markerMatch[0].length).trim();
  if (!content) return [];

  if (marker === "*") {
    return content.split(/\s+\*\s+/).map((item) => item.trim()).filter(Boolean);
  }

  return [content];
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(renderStrong(text.slice(lastIndex, match.index), nodes.length));
    }

    nodes.push(
      <a key={`a-${nodes.length}`} href={match[2]} className="font-extrabold text-[var(--hada-coral)] underline underline-offset-4" target={match[2].startsWith("http") ? "_blank" : undefined} rel={match[2].startsWith("http") ? "noreferrer" : undefined}>
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(renderStrong(text.slice(lastIndex), nodes.length));
  }

  return nodes.flat();
}

function renderStrong(text: string, baseKey: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  const strongPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = strongPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`strong-${baseKey}-${nodes.length}`} className="font-black text-[var(--hada-navy)]">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

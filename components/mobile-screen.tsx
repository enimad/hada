import Image from "next/image";
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import type { Route } from "next";

export function MobileScreen({
  children,
  className = "",
  header,
  footer = true
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  footer?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[var(--hada-cream)]">
      <div className={`mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-7 pb-8 pt-6 sm:px-10 ${className}`}>
        {header}
        {children}
        {footer ? <BottomHint /> : null}
      </div>
    </main>
  );
}

export function BottomHint() {
  return (
    <div className="mt-auto flex items-center justify-center gap-2 pt-12 text-center text-[14px] font-medium text-[#b8aea8] sm:text-[16px]">
      <ShieldIcon className="h-5 w-5 shrink-0" />
      <span>Personnalise pour votre mariage unique</span>
    </div>
  );
}

export function HadaWordmark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/hada-wordmark.png"
      alt="Hada"
      width={520}
      height={160}
      priority
      className={`h-auto w-full max-w-[250px] sm:max-w-[280px] ${className}`}
    />
  );
}

export function HadaMark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/hada-portrait-circle.png"
      alt="Hada"
      width={64}
      height={64}
      priority
      className={`h-9 w-9 rounded-full object-cover ${className}`}
    />
  );
}

export function HadaPortrait({
  variant = "circle",
  className = ""
}: {
  variant?: "circle" | "rays" | "full";
  className?: string;
}) {
  const config =
    variant === "full"
      ? { src: "/brand/hada-full.png", width: 420, height: 420, baseClass: "max-w-[260px] sm:max-w-[300px]" }
      : variant === "rays"
        ? { src: "/brand/hada-portrait-rays.png", width: 360, height: 360, baseClass: "max-w-[220px] sm:max-w-[250px]" }
        : { src: "/brand/hada-portrait-circle.png", width: 320, height: 320, baseClass: "max-w-[220px] sm:max-w-[260px]" };

  return (
    <Image
      src={config.src}
      alt="Hada"
      width={config.width}
      height={config.height}
      priority
      className={`mx-auto h-auto w-full ${config.baseClass} ${className}`}
    />
  );
}

export function MainButton({
  children,
  className = "",
  disabled = false,
  type = "button",
  onClick
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-16 w-full items-center justify-center rounded-full bg-[var(--hada-coral)] px-8 text-[18px] font-semibold tracking-[-0.03em] text-white shadow-[0_12px_34px_rgba(251,105,116,0.18)] transition disabled:bg-[var(--hada-coral-soft)] disabled:text-[#8d8387] sm:h-[72px] sm:text-[20px] ${className}`}
    >
      {children}
    </button>
  );
}

export function LineInput({
  label,
  icon,
  placeholder,
  value,
  onChange,
  type = "text",
  rightSlot,
  inputClassName = "",
  inputMode
}: {
  label?: string;
  icon?: ReactNode;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  rightSlot?: ReactNode;
  inputClassName?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      {label ? <span className="mb-4 block text-[18px] font-medium tracking-[-0.03em] text-[var(--hada-navy)] sm:mb-5 sm:text-[20px]">{label}</span> : null}
      <div className="flex items-center gap-3 border-b-2 border-[var(--hada-line-strong)] pb-3 sm:gap-4 sm:pb-4">
        {icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[#99908c] sm:h-10 sm:w-10">{icon}</span> : null}
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`min-w-0 flex-1 bg-transparent text-[18px] font-normal tracking-[-0.04em] text-[var(--hada-navy)] outline-none placeholder:text-[#8f8884] sm:text-[22px] ${inputClassName}`}
        />
        {rightSlot}
      </div>
    </label>
  );
}

export function DividerOr() {
  return (
    <div className="my-8 flex items-center gap-5 text-[18px] font-semibold tracking-[-0.04em] text-[var(--hada-navy)] sm:my-10 sm:text-[20px]">
      <span className="h-px flex-1 bg-[#e7ddd8]" />
      <span>ou</span>
      <span className="h-px flex-1 bg-[#e7ddd8]" />
    </div>
  );
}

export function BackButton({ href, onClick }: { href?: Route; onClick?: () => void }) {
  const content = (
    <span className="inline-flex h-12 w-12 items-center justify-center text-[var(--hada-navy)]">
      <ArrowLeftIcon className="h-8 w-8" />
    </span>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return (
    <button type="button" onClick={onClick}>
      {content}
    </button>
  );
}

export function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={`h-5 w-5 rounded-full sm:h-6 sm:w-6 ${index < current ? "bg-[var(--hada-gold)]" : "bg-[#ded6cf]"}`}
        />
      ))}
    </div>
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-12 w-12 items-center justify-start text-[#756d69]">
      <MenuIcon className="h-8 w-8" />
    </button>
  );
}

export function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 12H5" />
      <path d="M12 19L5 12 12 5" />
    </svg>
  );
}

export function ArrowUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function EyeOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7A3 3 0 0 0 13.3 13.4" />
      <path d="M9.9 5.2A11.2 11.2 0 0 1 12 5c6.2 0 10 7 10 7a17.7 17.7 0 0 1-4 4.6" />
      <path d="M6.6 6.7C4 8.4 2 12 2 12a17.6 17.6 0 0 0 10 6 10.7 10.7 0 0 0 4.2-.8" />
    </svg>
  );
}

export function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function MapPinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function UsersIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.2" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M15.5 3.2a3.2 3.2 0 0 1 0 6.3" />
    </svg>
  );
}

export function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-9Z" />
      <path d="M3 8h18" />
      <path d="M16 13h2" />
    </svg>
  );
}

export function HeartIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );
}

export function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function SparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="m12 2 1.7 5.1L19 8.8l-5.3 1.7L12 15.6l-1.7-5.1L5 8.8l5.3-1.7L12 2Z" />
      <path d="m18.5 2.5.8 2.3 2.2.8-2.2.7-.8 2.3-.7-2.3-2.3-.7 2.3-.8.7-2.3Z" />
    </svg>
  );
}

export function ThumbsUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 21H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
      <path d="M7 12 10.5 3A2 2 0 0 1 14 4.7V8h4.6a2 2 0 0 1 2 2.4l-1.2 7A2 2 0 0 1 17.4 19H7" />
    </svg>
  );
}

export function ThumbsDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3" />
      <path d="m17 12-3.5 9A2 2 0 0 1 10 19.3V16H5.4a2 2 0 0 1-2-2.4l1.2-7A2 2 0 0 1 6.6 5H17" />
    </svg>
  );
}

export function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3l7 3v5c0 5-3.4 9.2-7 10-3.6-.8-7-5-7-10V6l7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" />
    </svg>
  );
}

export function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-4 1 1-4 11.5-13.5Z" />
    </svg>
  );
}

export function MenuIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 7h16" />
      <path d="M4 12h12" />
      <path d="M4 17h8" />
    </svg>
  );
}

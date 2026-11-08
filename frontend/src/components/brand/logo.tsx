import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0 text-fg", className)} aria-hidden>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M15.6 8.4a5 5 0 1 0 0 7.2" stroke="var(--bg)" strokeWidth="2.3" fill="none" strokeLinecap="round" />
      <circle cx="16.4" cy="12" r="1.5" fill="var(--success)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>
        corede <span className="font-normal text-fg-muted">Systems</span>
      </span>
    </span>
  );
}

import { STATUS } from "@/lib/colors";
import type { MonitorStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusDot({ status, className }: { status: MonitorStatus; className?: string }) {
  const c = STATUS[status].color;
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} title={STATUS[status].label}>
      {status === "down" && (
        <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: c }} />
      )}
      <span
        className="relative inline-flex size-full rounded-full"
        style={{ background: c, boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 20%, transparent)` }}
      />
    </span>
  );
}

export function StatusBadge({ status, className }: { status: MonitorStatus; className?: string }) {
  const c = STATUS[status].color;
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", className)}
      style={{ background: `color-mix(in srgb, ${c} 12%, transparent)`, color: c }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {STATUS[status].label}
    </span>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { Checkbox as RCheckbox, Switch as RSwitch, Tooltip as T } from "radix-ui";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { COLORS } from "@/lib/colors";
import type { Color } from "@/lib/types";
import { cn, copyText } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2.5", className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        {description && <p className="truncate text-[13px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  color,
  className,
  variant = "outline",
}: {
  children: ReactNode;
  color?: Color | string;
  className?: string;
  variant?: "outline" | "soft";
}) {
  const c = color ? (COLORS[color as Color] ?? color) : undefined;
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 truncate rounded-sm px-1.5 text-xs font-medium",
        variant === "outline" && "border border-border text-fg-muted",
        className,
      )}
      style={
        variant === "soft" && c
          ? { background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }
          : undefined
      }
    >
      {variant === "outline" && c && <span className="size-1.5 shrink-0 rounded-full" style={{ background: c }} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ColorDot({ color, className }: { color: Color | string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: COLORS[color as Color] ?? color }}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-bg px-1 font-sans text-[11px] text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Empty({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-bg text-fg-muted [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-muted">{description}</p>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-muted-strong transition-colors focus-ring disabled:opacity-50 data-[state=checked]:bg-fg"
    >
      <RSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-[17px] dark:data-[state=unchecked]:bg-fg-muted dark:data-[state=checked]:bg-bg" />
    </RSwitch.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: {
  checked: boolean | "indeterminate";
  onCheckedChange: (v: boolean) => void;
  className?: string;
  "aria-label"?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <RCheckbox.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface transition-colors focus-ring",
        "data-[state=checked]:border-fg data-[state=checked]:bg-fg data-[state=indeterminate]:border-fg data-[state=indeterminate]:bg-fg",
        className,
      )}
      {...props}
    >
      <RCheckbox.Indicator className="text-bg">
        {checked === "indeterminate" ? (
          <span className="block h-[2px] w-2 rounded-full bg-bg" />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
}

export function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-surface p-[3px]", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-medium transition-colors focus-ring [&_svg]:size-3.5",
              active ? "bg-muted text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
            {o.count != null && <span className={cn("tabular text-xs", active ? "text-fg-muted" : "text-fg-subtle")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-pop data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TooltipProvider = T.Provider;

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(value)) {
          setDone(true);
          toast.success(label ? `${label} скопирован` : "Скопировано");
          setTimeout(() => setDone(false), 1500);
        } else {
          toast.error("Не удалось скопировать — выделите текст вручную");
        }
      }}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs text-fg-muted transition-colors hover:bg-muted hover:text-fg focus-ring [&_svg]:size-3.5",
        className,
      )}
      aria-label="Скопировать"
    >
      {done ? <Check /> : <Copy />}
    </button>
  );
}

export function Code({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("group relative rounded-md border border-border bg-bg", className)}>
      <pre className="overflow-x-auto px-3 py-2.5 pr-10 font-mono text-[12.5px] leading-relaxed text-fg">{children}</pre>
      <CopyButton value={children} className="absolute right-1.5 top-1.5" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-border-strong border-t-fg", className)}
    />
  );
}

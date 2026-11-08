import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border bg-surface text-sm text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow] duration-100 hover:border-border-strong " +
  "focus:border-border-strong focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger/60";

export function Input({
  className,
  icon,
  suffix,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; suffix?: ReactNode }) {
  if (!icon && !suffix) return <input className={cn(control, "h-8 px-2.5", className)} {...props} />;
  return (
    <div className={cn("relative flex items-center", className)}>
      {icon && (
        <span className="pointer-events-none absolute left-2.5 text-fg-subtle [&_svg]:size-4">{icon}</span>
      )}
      <input className={cn(control, "h-8", icon ? "pl-8" : "pl-2.5", suffix ? "pr-16" : "pr-2.5")} {...props} />
      {suffix && <span className="absolute right-1.5 flex items-center">{suffix}</span>}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 px-2.5 py-1.5 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-fg", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {(label || aside) && (
        <div className="flex items-center justify-between gap-2">
          {label && <Label htmlFor={htmlFor}>{label}</Label>}
          {aside}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

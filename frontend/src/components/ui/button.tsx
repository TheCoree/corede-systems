import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline-danger";
type Size = "md" | "icon" | "sm-icon";

const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-fg/85 border border-transparent",
  secondary: "bg-surface text-fg border border-border hover:bg-muted hover:border-border-strong",
  ghost: "text-fg-muted hover:text-fg hover:bg-muted border border-transparent",
  danger: "bg-danger text-white hover:bg-danger/90 border border-transparent",
  "outline-danger": "bg-surface text-danger border border-border hover:bg-danger/10 hover:border-danger/40",
};

const sizes: Record<Size, string> = {
  md: "h-8 px-3 gap-1.5",
  icon: "h-8 w-8 justify-center",
  "sm-icon": "h-6 w-6 justify-center rounded-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  asChild?: boolean;
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center whitespace-nowrap rounded-md text-sm font-medium",
    "transition-[background-color,border-color,color,opacity] duration-100 focus-ring",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  asChild,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}

"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  trigger?: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 flex-col",
            "overflow-hidden rounded-xl border border-border bg-surface shadow-pop data-[state=open]:animate-pop-in",
            className,
          )}
          onOpenAutoFocus={(e) => {
            // фокус на первое поле, а не на крестик
            const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
              "input:not([type=hidden]):not([disabled]), textarea, select",
            );
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-5">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-[13px] text-fg-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Диалог"}</D.Description>
              )}
            </div>
            <D.Close className="-mr-1.5 -mt-1 rounded-md p-1.5 text-fg-subtle hover:bg-muted hover:text-fg focus-ring">
              <X className="size-4" />
              <span className="sr-only">Закрыть</span>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border bg-bg px-5 py-3">{footer}</div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;

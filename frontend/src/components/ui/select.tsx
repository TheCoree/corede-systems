"use client";

import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as S } from "radix-ui";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: ReactNode;
  /** иконка/точка слева от подписи */
  icon?: ReactNode;
  /** разделитель перед пунктом */
  separator?: boolean;
  disabled?: boolean;
};

// Radix не допускает пустое значение у пункта — подменяем на служебное
const EMPTY = "__empty__";
const toRadix = (v: string) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

/** Выпадающий список в стиле интерфейса (вместо нативного <select>). */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Выберите…",
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <S.Root value={toRadix(value)} onValueChange={(v) => onValueChange(fromRadix(v))} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface pl-2.5 pr-2 text-left text-sm text-fg",
          "transition-[border-color,box-shadow] duration-100 hover:border-border-strong",
          "focus:outline-none focus-visible:border-border-strong focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
          "data-[state=open]:border-border-strong data-[placeholder]:text-fg-subtle disabled:cursor-not-allowed disabled:opacity-60",
          "[&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2 [&>span]:truncate",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-fg-subtle transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[max(var(--radix-select-trigger-width),180px)]",
            "overflow-hidden rounded-lg border border-border bg-surface shadow-pop data-[state=open]:animate-pop-in",
          )}
        >
          <S.ScrollUpButton className="flex h-6 items-center justify-center text-fg-subtle">
            <ChevronUp className="size-4" />
          </S.ScrollUpButton>
          <S.Viewport className="p-1">
            {options.map((o) => (
              <Fragment key={o.value || EMPTY}>
                {o.separator && <S.Separator className="-mx-1 my-1 h-px bg-border" />}
                <S.Item
                  value={toRadix(o.value)}
                  disabled={o.disabled}
                  className={cn(
                    "relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md pl-2 pr-8 text-sm text-fg outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    "[&_svg]:size-4 [&_svg]:shrink-0",
                  )}
                >
                  {o.icon}
                  <S.ItemText>{o.label}</S.ItemText>
                  <S.ItemIndicator className="absolute right-2 flex items-center">
                    <Check className="!size-4 text-fg" />
                  </S.ItemIndicator>
                </S.Item>
              </Fragment>
            ))}
          </S.Viewport>
          <S.ScrollDownButton className="flex h-6 items-center justify-center text-fg-subtle">
            <ChevronDown className="size-4" />
          </S.ScrollDownButton>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

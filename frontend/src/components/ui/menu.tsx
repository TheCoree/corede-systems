"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuSub = M.Sub;
export const MenuRadioGroup = M.RadioGroup;

const content =
  "z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop " +
  "data-[state=open]:animate-pop-in";

export function MenuContent({ className, align = "end", sideOffset = 6, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} className={cn(content, className)} {...props} />
    </M.Portal>
  );
}

const item =
  "relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-sm text-fg outline-none " +
  "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted";

export function MenuItem({
  className,
  danger,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof M.Item> & { danger?: boolean; shortcut?: ReactNode }) {
  return (
    <M.Item className={cn(item, danger && "text-danger [&_svg]:text-danger", className)} {...props}>
      {children}
      {shortcut && <span className="ml-auto pl-4 text-xs text-fg-subtle">{shortcut}</span>}
    </M.Item>
  );
}

export function MenuCheckbox({ className, children, ...props }: ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(item, "pr-8", className)} onSelect={(e) => e.preventDefault()} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2">
        <Check className="!text-fg" />
      </M.ItemIndicator>
    </M.CheckboxItem>
  );
}

export function MenuRadio({ className, children, ...props }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(item, "pr-8", className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2">
        <Check className="!text-fg" />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 pb-1 pt-1.5 text-xs font-medium text-fg-subtle", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function MenuSubTrigger({ className, children, ...props }: ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger className={cn(item, "data-[state=open]:bg-muted", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={6} className={cn(content, "max-h-72 overflow-y-auto", className)} {...props} />
    </M.Portal>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "Общие" },
  { href: "/settings/tags", label: "Теги" },
  { href: "/settings/notifications", label: "Уведомления" },
  { href: "/settings/tokens", label: "API-токены" },
  { href: "/settings/widget", label: "Виджет iOS" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { href } = useWorkspace();
  return (
    <nav className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
      {TABS.map((t) => {
        const full = href(t.href);
        const active = pathname === full;
        return (
          <Link
            key={t.href}
            href={full}
            className={cn(
              "relative flex h-10 shrink-0 items-center px-3 text-sm transition-colors",
              active ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-fg" />}
          </Link>
        );
      })}
    </nav>
  );
}

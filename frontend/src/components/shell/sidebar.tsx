"use client";

import { type LucideIcon, Search, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kbd } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { useMe, useWorkspace } from "@/lib/hooks";
import type { Summary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { coreBottom, coreTop, modules, type NavItem } from "@/modules/registry";
import { openCommandPalette } from "./command-palette";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  badgeTone = "danger",
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  badgeTone?: "danger" | "neutral";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-ring",
        active ? "bg-muted font-medium text-fg" : "text-fg-muted hover:bg-muted/60 hover:text-fg",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-subtle group-hover:text-fg-muted")} />
      <span className="truncate">{label}</span>
      {!!badge && (
        <span
          className={cn(
            "ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-medium tabular",
            badgeTone === "danger" ? "bg-danger/15 text-danger" : "bg-muted-strong text-fg-muted",
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { slug, href, api } = useWorkspace();
  const { data: summary } = useApi<Summary>(slug ? api("/summary") : null, { refreshInterval: 30000 });
  const badges: Record<NonNullable<NavItem["badge"]>, number | undefined> = {
    open_incidents: summary?.open_incidents.length,
  };

  const isActive = (item: NavItem) => {
    const full = href(item.href);
    return item.href === "" ? pathname === full : pathname === full || pathname.startsWith(`${full}/`);
  };

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <NavLink
        key={item.href}
        href={href(item.href)}
        label={item.label}
        icon={item.icon}
        active={isActive(item)}
        badge={item.badge ? badges[item.badge] : undefined}
        onNavigate={onNavigate}
      />
    ));

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <WorkspaceSwitcher onNavigate={onNavigate} />
      </div>
      <div className="px-2">
        <button
          onClick={() => {
            onNavigate?.();
            openCommandPalette();
          }}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted focus-ring"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Поиск…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        <div className="space-y-0.5">{renderItems(coreTop)}</div>
        {[...modules, coreBottom].map((group) => (
          <div key={group.id} className="space-y-0.5">
            <div className="px-2 pb-1 text-xs font-medium text-fg-subtle">{group.label}</div>
            {renderItems(group.nav)}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-2">
        {me?.user.is_admin && (
          <NavLink
            href="/admin"
            label="Администрирование"
            icon={Shield}
            active={pathname.startsWith("/admin")}
            badge={me.pending_users}
            badgeTone="neutral"
            onNavigate={onNavigate}
          />
        )}
        <UserMenu onNavigate={onNavigate} />
      </div>
    </div>
  );
}

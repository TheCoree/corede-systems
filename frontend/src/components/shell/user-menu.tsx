"use client";

import { LogOut, Monitor, Moon, Shield, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadio,
  MenuRadioGroup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import { useMe } from "@/lib/hooks";

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-medium text-fg-muted ${className}`}
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  if (!me) return null;
  const go = (href: string) => {
    onNavigate?.();
    router.push(href);
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-muted focus-ring">
          <Avatar name={me.user.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight">{me.user.name}</span>
            <span className="block truncate text-xs leading-tight text-fg-subtle">{me.user.email}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" side="top" className="w-[232px]">
        <MenuItem onSelect={() => go("/account")}>
          <UserRound />
          Аккаунт
        </MenuItem>
        {me.user.is_admin && (
          <MenuItem onSelect={() => go("/admin")}>
            <Shield />
            Администрирование
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuLabel>Тема</MenuLabel>
        <MenuRadioGroup value={theme} onValueChange={setTheme}>
          <MenuRadio value="light">
            <Sun />
            Светлая
          </MenuRadio>
          <MenuRadio value="dark">
            <Moon />
            Тёмная
          </MenuRadio>
          <MenuRadio value="system">
            <Monitor />
            Как в системе
          </MenuRadio>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await api("/auth/logout", { method: "POST" }).catch(() => {});
            router.replace("/login");
            // сбросить весь кэш SWR, чтобы данные прошлой сессии не мелькнули
            await mutate(() => true, undefined, { revalidate: false });
          }}
        >
          <LogOut />
          Выйти
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

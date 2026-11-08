"use client";

import { FolderKanban, type LucideIcon, Search, Shield, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { STATUS } from "@/lib/colors";
import { useMe, useWorkspace } from "@/lib/hooks";
import type { Monitor, MonitorStatus, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { allNav } from "@/modules/registry";

const EVENT = "cds:command-palette";
export const openCommandPalette = () => window.dispatchEvent(new Event(EVENT));

type Entry = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  icon?: LucideIcon;
  status?: MonitorStatus;
};

export function CommandPalette() {
  const router = useRouter();
  const { data: me } = useMe();
  const { slug, href, api } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: monitors } = useApi<Monitor[]>(open && slug ? api("/monitors") : null);
  const { data: projects } = useApi<Project[]>(open && slug ? api("/projects") : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIndex(0);
        setOpen((o) => !o);
      }
    };
    const onOpen = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENT, onOpen);
    };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = allNav().map((n) => ({
      id: `nav:${n.href}`,
      group: "Страницы",
      label: n.label,
      href: href(n.href),
      icon: n.icon,
    }));
    pages.push({ id: "nav:account", group: "Страницы", label: "Аккаунт", href: "/account", icon: UserRound });
    if (me?.user.is_admin)
      pages.push({ id: "nav:admin", group: "Страницы", label: "Администрирование", href: "/admin", icon: Shield });
    const mons: Entry[] = (monitors ?? []).map((m) => ({
      id: `m:${m.id}`,
      group: "Мониторы",
      label: m.name,
      hint: m.target,
      href: href(`/monitors/${m.id}`),
      status: m.status,
    }));
    const projs: Entry[] = (projects ?? []).map((p) => ({
      id: `p:${p.id}`,
      group: "Проекты",
      label: p.name,
      href: href(`/monitors?project=${p.id}`),
      icon: FolderKanban,
    }));
    const all = [...pages, ...mons, ...projs];
    const query = q.trim().toLowerCase();
    if (!query) return [...pages, ...mons.slice(0, 8)];
    return all.filter((e) => e.label.toLowerCase().includes(query) || e.hint?.toLowerCase().includes(query));
  }, [monitors, projects, q, href, me]);

  const openPalette = (v: boolean) => {
    setIndex(0);
    setOpen(v);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function go(e: Entry) {
    setOpen(false);
    setQ("");
    router.push(e.href);
  }

  let lastGroup = "";
  return (
    <D.Root open={open} onOpenChange={openPalette}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-24px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop data-[state=open]:animate-pop-in"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, entries.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && entries[index]) {
              e.preventDefault();
              go(entries[index]);
            }
          }}
        >
          <D.Title className="sr-only">Поиск</D.Title>
          <D.Description className="sr-only">Страницы, мониторы и проекты</D.Description>
          <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 text-fg-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIndex(0);
              }}
              placeholder="Мониторы, проекты, страницы…"
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
            {entries.length === 0 && <div className="px-3 py-8 text-center text-sm text-fg-muted">Ничего не найдено</div>}
            {entries.map((e, i) => {
              const header = e.group !== lastGroup ? e.group : null;
              lastGroup = e.group;
              const Icon = e.icon;
              return (
                <div key={e.id}>
                  {header && <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-fg-subtle">{header}</div>}
                  <button
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => go(e)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm",
                      i === index ? "bg-muted text-fg" : "text-fg-muted",
                    )}
                  >
                    {e.status ? (
                      <span className="flex size-4 items-center justify-center">
                        <span className="size-2 rounded-full" style={{ background: STATUS[e.status].color }} />
                      </span>
                    ) : (
                      Icon && <Icon className="size-4 shrink-0 text-fg-subtle" />
                    )}
                    <span className="truncate text-fg">{e.label}</span>
                    {e.hint && <span className="ml-auto truncate pl-3 font-mono text-xs text-fg-subtle">{e.hint}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

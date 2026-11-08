"use client";

import {
  Activity,
  ArrowDownUp,
  Copy,
  ExternalLink,
  FolderInput,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuCheckbox,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadio,
  MenuRadioGroup,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { Badge, Card, Checkbox, ColorDot, Empty, Segmented, Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { useApi } from "@/lib/api";
import { STATUS, STATUS_ORDER } from "@/lib/colors";
import { fmtMs, fmtPercent, intervalLabel, since, timeAgo } from "@/lib/format";
import { useLocalState, useNow, useWorkspace } from "@/lib/hooks";
import type { Monitor, MonitorStatus, Project, Tag } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { HourlyBars } from "./components/bars";
import { fromMonitor, MonitorDialog, type MonitorFormState } from "./components/monitor-form";
import { StatusDot } from "./components/status";
import { useMonitorActions } from "./use-monitor-actions";

type GroupBy = "none" | "project" | "tag" | "status";
type SortBy = "status" | "name" | "uptime" | "latency" | "checked" | "created";
type StatusFilter = "all" | MonitorStatus;
type View = { group: GroupBy; sort: SortBy };

const GROUP_LABEL: Record<GroupBy, string> = { none: "Без группировки", project: "По проекту", tag: "По тегу", status: "По статусу" };
const SORT_LABEL: Record<SortBy, string> = {
  status: "Сначала проблемные",
  name: "По названию",
  uptime: "По uptime (хуже выше)",
  latency: "По отклику (медленнее выше)",
  checked: "По последней проверке",
  created: "Сначала новые",
};

const COLS =
  "grid items-center gap-x-4 grid-cols-[16px_minmax(0,1fr)_auto_28px] " +
  "md:grid-cols-[16px_minmax(0,1fr)_122px_64px_64px_28px] " +
  "lg:grid-cols-[16px_minmax(0,2fr)_minmax(0,1.1fr)_122px_64px_64px_84px_28px]";

function sorter(sort: SortBy) {
  return (a: Monitor, b: Monitor) => {
    switch (sort) {
      case "status":
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, "ru");
      case "name":
        return a.name.localeCompare(b.name, "ru");
      case "uptime":
        return (a.uptime_30d ?? 101) - (b.uptime_30d ?? 101);
      case "latency":
        return (b.last_latency_ms ?? -1) - (a.last_latency_ms ?? -1);
      case "checked":
        return (b.last_checked_at ?? "").localeCompare(a.last_checked_at ?? "");
      case "created":
        return b.created_at.localeCompare(a.created_at);
    }
  };
}

type Group = { key: string; label: string; color?: string; items: Monitor[] };

function groupMonitors(list: Monitor[], by: GroupBy, projects: Project[]): Group[] {
  if (by === "none") return [{ key: "all", label: "", items: list }];
  const map = new Map<string, Group>();
  const add = (key: string, label: string, color: string | undefined, m: Monitor) => {
    if (!map.has(key)) map.set(key, { key, label, color, items: [] });
    map.get(key)!.items.push(m);
  };
  for (const m of list) {
    if (by === "project") {
      if (m.project) add(m.project.id, m.project.name, m.project.color, m);
      else add("~none", "Без проекта", undefined, m);
    } else if (by === "status") {
      add(m.status, STATUS[m.status].label, STATUS[m.status].color, m);
    } else {
      if (!m.tags.length) add("~none", "Без тегов", undefined, m);
      for (const t of m.tags) add(t.id, t.name, t.color, m);
    }
  }
  const groups = [...map.values()];
  if (by === "status") return groups.sort((a, b) => STATUS_ORDER[a.key as MonitorStatus] - STATUS_ORDER[b.key as MonitorStatus]);
  const order = new Map(projects.map((p, i) => [p.id, i]));
  return groups.sort((a, b) => {
    if (a.key === "~none") return 1;
    if (b.key === "~none") return -1;
    // группы с упавшими — выше
    const da = a.items.some((m) => m.status === "down") ? 0 : 1;
    const db = b.items.some((m) => m.status === "down") ? 0 : 1;
    return da - db || (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0) || a.label.localeCompare(b.label, "ru");
  });
}

export function MonitorsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { api: wsApi, href, slug } = useWorkspace();
  const now = useNow();
  const actions = useMonitorActions();
  const [confirm, confirmDialog] = useConfirm();

  const { data: monitors, isLoading } = useApi<Monitor[]>(wsApi("/monitors"), { refreshInterval: 15000 });
  const { data: projects = [] } = useApi<Project[]>(wsApi("/projects"));
  const { data: tags = [] } = useApi<Tag[]>(wsApi("/tags"));

  const [view, setView] = useLocalState<View>(`cds:monitors-view:${slug}`, { group: "project", sort: "status" });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ open: boolean; monitor?: Monitor; defaults?: Partial<MonitorFormState> }>({
    open: false,
  });

  const projectFilter = search.get("project") ?? "";
  const setProjectFilter = (v: string) => {
    const p = new URLSearchParams(search.toString());
    if (v) p.set("project", v);
    else p.delete("project");
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  const all = useMemo(() => monitors ?? [], [monitors]);
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: all.length, up: 0, down: 0, pending: 0, paused: 0 };
    for (const m of all) c[m.status]++;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return all
      .filter((m) => status === "all" || m.status === status || (status === "up" && m.status === "pending"))
      .filter((m) => !projectFilter || (projectFilter === "none" ? !m.project : m.project?.id === projectFilter))
      .filter((m) => !tagFilter.length || tagFilter.every((t) => m.tags.some((x) => x.id === t)))
      .filter(
        (m) =>
          !query ||
          m.name.toLowerCase().includes(query) ||
          m.target.toLowerCase().includes(query) ||
          m.project?.name.toLowerCase().includes(query) ||
          m.tags.some((t) => t.name.toLowerCase().includes(query)),
      )
      .sort(sorter(view.sort));
  }, [all, q, status, projectFilter, tagFilter, view.sort]);

  const groups = useMemo(() => groupMonitors(filtered, view.group, projects), [filtered, view.group, projects]);
  const hasFilters = !!q || status !== "all" || !!projectFilter || tagFilter.length > 0;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selIds = [...selected].filter((id) => all.some((m) => m.id === id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  async function bulk(action: string, extra?: Record<string, unknown>) {
    if (action === "delete") {
      const ok = await confirm({
        title: `Удалить ${selIds.length} ${plural(selIds.length, "монитор", "монитора", "мониторов")}?`,
        description: "История проверок и инциденты тоже будут удалены.",
        confirmLabel: "Удалить",
        danger: true,
      });
      if (!ok) return;
    }
    await actions.bulk(selIds, action, extra);
    if (action === "delete") setSelected(new Set());
  }

  const openCreate = () =>
    setDialog({
      open: true,
      defaults: projectFilter && projectFilter !== "none" ? { project_id: projectFilter } : undefined,
    });

  const total = all.length;
  const down = counts.down;

  return (
    <>
      <PageHeader
        title="Мониторы"
        description={
          total
            ? `${total} ${plural(total, "монитор", "монитора", "мониторов")}${down ? ` · ${down} недоступно` : " · всё работает"}`
            : "Сайты, API, порты и cron-задачи под наблюдением"
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus />
            Добавить
          </Button>
        }
      />

      {total > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            icon={<Search />}
            placeholder="Поиск по названию, адресу, тегу…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-72"
          />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Все", count: counts.all },
              { value: "down", label: "Недоступны", count: counts.down },
              { value: "up", label: "Работают", count: counts.up + counts.pending },
              { value: "paused", label: "Пауза", count: counts.paused },
            ]}
          />
          <Select
            value={projectFilter}
            onValueChange={setProjectFilter}
            className="w-48"
            aria-label="Проект"
            options={[
              { value: "", label: "Все проекты" },
              ...projects.map((p, i) => ({
                value: p.id,
                label: p.name,
                icon: <ColorDot color={p.color} className="size-2" />,
                separator: i === 0,
              })),
              {
                value: "none",
                label: "Без проекта",
                icon: <ColorDot color="var(--border-strong)" className="size-2" />,
                separator: projects.length === 0,
              },
            ]}
          />
          {tags.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <Button className={cn(tagFilter.length && "border-border-strong text-fg")}>
                  <TagIcon />
                  Теги
                  {tagFilter.length > 0 && <span className="tabular text-fg-muted">{tagFilter.length}</span>}
                </Button>
              </MenuTrigger>
              <MenuContent align="start" className="max-h-80 overflow-y-auto">
                <MenuLabel>Показывать с тегами</MenuLabel>
                {tags.map((t) => (
                  <MenuCheckbox
                    key={t.id}
                    checked={tagFilter.includes(t.id)}
                    onCheckedChange={(v) => setTagFilter((f) => (v ? [...f, t.id] : f.filter((x) => x !== t.id)))}
                  >
                    <ColorDot color={t.color} className="size-2" />
                    {t.name}
                  </MenuCheckbox>
                ))}
                {tagFilter.length > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuItem onSelect={() => setTagFilter([])}>
                      <X />
                      Сбросить
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setStatus("all");
                  setTagFilter([]);
                  setProjectFilter("");
                }}
              >
                Сбросить
              </Button>
            )}
            <Menu>
              <MenuTrigger asChild>
                <Button>
                  <Rows3 />
                  Вид
                </Button>
              </MenuTrigger>
              <MenuContent className="w-60">
                <MenuLabel>Группировка</MenuLabel>
                <MenuRadioGroup value={view.group} onValueChange={(v) => setView((p) => ({ ...p, group: v as GroupBy }))}>
                  {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                    <MenuRadio key={g} value={g}>
                      {GROUP_LABEL[g]}
                    </MenuRadio>
                  ))}
                </MenuRadioGroup>
                <MenuSeparator />
                <MenuLabel className="flex items-center gap-1.5">
                  <ArrowDownUp className="size-3" />
                  Сортировка
                </MenuLabel>
                <MenuRadioGroup value={view.sort} onValueChange={(v) => setView((p) => ({ ...p, sort: v as SortBy }))}>
                  {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
                    <MenuRadio key={s} value={s}>
                      {SORT_LABEL[s]}
                    </MenuRadio>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </div>
        </div>
      )}

      {isLoading && !monitors ? (
        <Card>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex h-14 items-center gap-4 border-b border-border px-4 last:border-0">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-28" />
            </div>
          ))}
        </Card>
      ) : total === 0 ? (
        <Card>
          <Empty
            icon={<Activity />}
            title="Пока нет мониторов"
            description="Добавьте сайт, API, порт сервера или heartbeat для cron-задачи. Узнаете о падении раньше клиента."
            action={
              <Button variant="primary" onClick={openCreate}>
                <Plus />
                Добавить монитор
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <Empty icon={<Search />} title="Ничего не найдено" description="Попробуйте изменить фильтры или запрос." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className={cn(COLS, "h-10 border-b border-border bg-bg px-4 text-xs font-medium text-fg-subtle")}>
            <Checkbox
              aria-label="Выбрать все"
              checked={allVisibleSelected ? true : selIds.length ? "indeterminate" : false}
              onCheckedChange={(v) =>
                setSelected((s) => {
                  const n = new Set(s);
                  for (const m of filtered) {
                    if (v) n.add(m.id);
                    else n.delete(m.id);
                  }
                  return n;
                })
              }
            />
            <span>Название</span>
            <span className="hidden lg:block">Проект и теги</span>
            <span className="hidden md:block">24 часа</span>
            <span className="text-right">
              <span className="hidden md:inline">Uptime</span>
              <span className="md:hidden">30 дн.</span>
            </span>
            <span className="hidden text-right md:block">Отклик</span>
            <span className="hidden text-right lg:block">Проверка</span>
            <span />
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              {view.group !== "none" && (
                <div className="flex h-9 items-center gap-2 border-b border-border bg-bg/60 px-4 text-[13px]">
                  {g.color ? <ColorDot color={g.color} className="size-2" /> : <span className="size-2 rounded-full border border-fg-subtle" />}
                  <span className="font-medium">{g.label}</span>
                  <span className="text-fg-subtle tabular">{g.items.length}</span>
                  {g.items.some((m) => m.status === "down") && (
                    <span className="text-xs text-danger">
                      {g.items.filter((m) => m.status === "down").length} недоступно
                    </span>
                  )}
                </div>
              )}
              {g.items.map((m) => (
                <MonitorRow
                  key={`${g.key}:${m.id}`}
                  m={m}
                  now={now}
                  href={href(`/monitors/${m.id}`)}
                  selected={selected.has(m.id)}
                  onSelect={() => toggle(m.id)}
                  onEdit={() => setDialog({ open: true, monitor: m })}
                  onDuplicate={() =>
                    setDialog({ open: true, defaults: { ...fromMonitor(m), name: `${m.name} (копия)` } })
                  }
                  onDelete={async () => {
                    if (
                      await confirm({
                        title: `Удалить «${m.name}»?`,
                        description: "История проверок и инциденты тоже будут удалены.",
                        confirmLabel: "Удалить",
                        danger: true,
                      })
                    )
                      await actions.remove(m);
                  }}
                  actions={actions}
                />
              ))}
            </div>
          ))}
        </Card>
      )}

      {selIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 shadow-pop md:left-[calc(50%+120px)]">
          <span className="whitespace-nowrap px-2 text-[13px] font-medium tabular">
            {selIds.length} выбрано
          </span>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" onClick={() => bulk("check")}>
            <RefreshCw />
            Проверить
          </Button>
          <Button variant="ghost" onClick={() => bulk("pause")}>
            <Pause />
            Пауза
          </Button>
          <Button variant="ghost" onClick={() => bulk("resume")}>
            <Play />
            Возобновить
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost">
                <FolderInput />
                В проект
              </Button>
            </MenuTrigger>
            <MenuContent side="top" align="center" className="max-h-72 overflow-y-auto">
              {projects.map((p) => (
                <MenuItem key={p.id} onSelect={() => bulk("move", { project_id: p.id })}>
                  <ColorDot color={p.color} className="size-2" />
                  {p.name}
                </MenuItem>
              ))}
              {projects.length > 0 && <MenuSeparator />}
              <MenuItem onSelect={() => bulk("move", { project_id: null })}>Без проекта</MenuItem>
            </MenuContent>
          </Menu>
          {tags.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost">
                  <TagIcon />
                  Тег
                </Button>
              </MenuTrigger>
              <MenuContent side="top" align="center">
                <MenuSub>
                  <MenuSubTrigger>Добавить тег</MenuSubTrigger>
                  <MenuSubContent>
                    {tags.map((t) => (
                      <MenuItem key={t.id} onSelect={() => bulk("tag", { tag_id: t.id })}>
                        <ColorDot color={t.color} className="size-2" />
                        {t.name}
                      </MenuItem>
                    ))}
                  </MenuSubContent>
                </MenuSub>
                <MenuSub>
                  <MenuSubTrigger>Убрать тег</MenuSubTrigger>
                  <MenuSubContent>
                    {tags.map((t) => (
                      <MenuItem key={t.id} onSelect={() => bulk("untag", { tag_id: t.id })}>
                        <ColorDot color={t.color} className="size-2" />
                        {t.name}
                      </MenuItem>
                    ))}
                  </MenuSubContent>
                </MenuSub>
              </MenuContent>
            </Menu>
          )}
          <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => bulk("delete")}>
            <Trash2 />
            Удалить
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} aria-label="Снять выделение">
            <X />
          </Button>
        </div>
      )}

      <MonitorDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        monitor={dialog.monitor}
        defaults={dialog.defaults}
      />
      {confirmDialog}
    </>
  );
}

function MonitorRow({
  m,
  now,
  href,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  actions,
}: {
  m: Monitor;
  now: number;
  href: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  actions: ReturnType<typeof useMonitorActions>;
}) {
  const router = useRouter();
  const isDown = m.status === "down";
  return (
    <div
      onClick={() => router.push(href)}
      className={cn(
        COLS,
        "group relative min-h-14 cursor-pointer border-b border-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50",
        selected && "bg-muted/60",
      )}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex">
        <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Выбрать ${m.name}`} />
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <StatusDot status={m.status} />
        <div className="min-w-0">
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-sm font-medium hover:underline"
          >
            {m.name}
          </Link>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
            <span className="truncate font-mono">{m.target}</span>
            <span className="hidden shrink-0 sm:inline">· {intervalLabel(m.interval)}</span>
            {m.tags.length > 0 && (
              <span className="hidden shrink-0 md:inline lg:hidden">· {m.tags.map((t) => t.name).join(", ")}</span>
            )}
          </div>
          {isDown && (
            <div className="mt-0.5 truncate text-xs text-danger">
              {since(m.fail_since ?? m.last_change_at, now)} · {m.last_error}
            </div>
          )}
        </div>
      </div>

      <div className="hidden min-w-0 flex-wrap items-center gap-1 lg:flex">
        {m.project && (
          <Badge color={m.project.color} variant="soft">
            {m.project.name}
          </Badge>
        )}
        {m.tags.map((t) => (
          <Badge key={t.id} color={t.color}>
            {t.name}
          </Badge>
        ))}
      </div>

      <div className="hidden md:block">
        <HourlyBars bars={m.bars} />
      </div>

      <div
        className={cn(
          "text-right text-[13px] tabular",
          m.uptime_30d != null && m.uptime_30d < 99 ? "text-warning" : "text-fg",
          m.uptime_30d != null && m.uptime_30d < 95 && "text-danger",
        )}
      >
        {fmtPercent(m.uptime_30d, m.uptime_30d != null && m.uptime_30d < 100 ? 2 : 0)}
      </div>
      <div className="hidden text-right text-[13px] text-fg-muted tabular md:block">{fmtMs(m.last_latency_ms)}</div>
      <div className="hidden text-right text-[13px] text-fg-muted lg:block">
        {m.paused ? "пауза" : timeAgo(m.last_checked_at, now)}
      </div>

      <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm-icon" aria-label="Действия">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {m.type !== "push" && !m.paused && (
              <MenuItem onSelect={() => actions.checkNow(m)}>
                <RefreshCw />
                Проверить сейчас
              </MenuItem>
            )}
            <MenuItem onSelect={onEdit}>
              <Pencil />
              Изменить
            </MenuItem>
            <MenuItem onSelect={() => actions.setPaused(m, !m.paused)}>
              {m.paused ? <Play /> : <Pause />}
              {m.paused ? "Возобновить" : "Поставить на паузу"}
            </MenuItem>
            <MenuItem onSelect={onDuplicate}>
              <Copy />
              Дублировать
            </MenuItem>
            {m.url && (
              <MenuItem onSelect={() => window.open(m.url!, "_blank", "noopener")}>
                <ExternalLink />
                Открыть сайт
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem danger onSelect={onDelete}>
              <Trash2 />
              Удалить
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}

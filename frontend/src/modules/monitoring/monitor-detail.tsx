"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
  Siren,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Card, CardHeader, Empty, Segmented, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { STATUS } from "@/lib/colors";
import {
  daysUntil,
  fmtDate,
  fmtDateTime,
  fmtMs,
  fmtPercent,
  intervalLabel,
  since,
  timeAgo,
} from "@/lib/format";
import { useNow, useWorkspace } from "@/lib/hooks";
import type { CheckRow, DailyPoint, Incident, Monitor, Series } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DailyBars } from "./components/bars";
import { IncidentRow } from "./components/incident-list";
import { LatencyChart } from "./components/latency-chart";
import { MonitorDialog } from "./components/monitor-form";
import { PushInstructions } from "./components/push-instructions";
import { StatusDot } from "./components/status";
import { useMonitorActions } from "./use-monitor-actions";

type Range = Series["range"];
const tz = () => new Date().getTimezoneOffset();

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tracking-tight tabular" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="truncate text-xs text-fg-subtle">{sub}</div>}
    </Card>
  );
}

export function MonitorDetail({ id }: { id: string }) {
  const router = useRouter();
  const { api: wsApi, href } = useWorkspace();
  const now = useNow(10000);
  const actions = useMonitorActions();
  const [confirm, confirmDialog] = useConfirm();
  const [range, setRange] = useState<Range>("24h");
  const [editOpen, setEditOpen] = useState(false);
  const [onlyFailed, setOnlyFailed] = useState(false);

  const { data: m, error } = useApi<Monitor>(wsApi(`/monitors/${id}`), { refreshInterval: 15000 });
  const { data: series } = useApi<Series>(wsApi(`/monitors/${id}/stats?range=${range}&tz=${tz()}`), {
    refreshInterval: 30000,
    keepPreviousData: true,
  });
  const { data: days } = useApi<DailyPoint[]>(wsApi(`/monitors/${id}/daily?days=90&tz=${tz()}`), {
    refreshInterval: 60000,
  });
  const { data: incidents } = useApi<Incident[]>(wsApi(`/incidents?monitor_id=${id}&limit=20`), {
    refreshInterval: 30000,
  });
  const { data: checks } = useApi<CheckRow[]>(
    wsApi(`/monitors/${id}/checks?limit=25${onlyFailed ? "&failed=true" : ""}`),
    { refreshInterval: 15000, keepPreviousData: true },
  );

  const back = (
    <Link href={href("/monitors")} className="inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg">
      <ArrowLeft className="size-3.5" />
      Мониторы
    </Link>
  );

  if (error) {
    return (
      <>
        <PageHeader title="Монитор" back={back} />
        <Card>
          <Empty title="Монитор не найден" description="Возможно, он был удалён." />
        </Card>
      </>
    );
  }
  if (!m) {
    return (
      <div className="space-y-6">
        {back}
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px]" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const downFor = m.status === "down" ? since(m.fail_since ?? m.last_change_at, now) : null;
  const sslDays = m.ssl_expires_at ? daysUntil(m.ssl_expires_at, now) : null;

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span className="flex min-w-0 items-center gap-3.5 pl-[3px]">
            <StatusDot status={m.status} className="size-3" />
            <span className="min-w-0 truncate">{m.name}</span>
          </span>
        }
        description={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {m.url ? (
              <a href={m.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-[13px] hover:text-fg">
                {m.target}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <span className="font-mono text-[13px]">{m.target}</span>
            )}
            <span className="text-fg-subtle">· каждые {intervalLabel(m.interval)}</span>
            {m.project && (
              <Link href={href(`/monitors?project=${m.project.id}`)}>
                <Badge color={m.project.color} variant="soft">
                  {m.project.name}
                </Badge>
              </Link>
            )}
            {m.tags.map((t) => (
              <Badge key={t.id} color={t.color}>
                {t.name}
              </Badge>
            ))}
          </div>
        }
        actions={
          <>
            {m.type !== "push" && !m.paused && (
              <Button onClick={() => actions.checkNow(m)}>
                <RefreshCw />
                Проверить
              </Button>
            )}
            <Button onClick={() => actions.setPaused(m, !m.paused)}>
              {m.paused ? <Play /> : <Pause />}
              {m.paused ? "Возобновить" : "Пауза"}
            </Button>
            <Button onClick={() => setEditOpen(true)}>
              <Pencil />
              Изменить
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon" aria-label="Ещё">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                {m.url && (
                  <MenuItem onSelect={() => window.open(m.url!, "_blank", "noopener")}>
                    <ExternalLink />
                    Открыть сайт
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem
                  danger
                  onSelect={async () => {
                    if (
                      await confirm({
                        title: `Удалить «${m.name}»?`,
                        description: "История проверок и инциденты тоже будут удалены.",
                        confirmLabel: "Удалить",
                        danger: true,
                      })
                    ) {
                      await actions.remove(m);
                      router.push(href("/monitors"));
                    }
                  }}
                >
                  <Trash2 />
                  Удалить
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      {m.status === "down" && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3">
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-danger">Недоступен уже {downFor}</div>
            <div className="mt-0.5 text-[13px] text-fg-muted">
              С {fmtDateTime(m.fail_since ?? m.last_change_at!)} · {m.last_error}
            </div>
          </div>
        </div>
      )}
      {m.status === "pending" && m.fail_streak > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] px-4 py-3 text-[13px]">
          <RefreshCw className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Проверка не прошла ({m.last_error}). Подтверждаем — {m.fail_streak} из {m.confirmations}.
          </span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Статус"
          value={STATUS[m.status].label}
          tone={STATUS[m.status].color}
          sub={m.paused ? "мониторинг остановлен" : m.last_change_at ? `уже ${since(m.last_change_at, now)}` : "ждём первую проверку"}
        />
        <Stat label="Uptime 24 ч" value={fmtPercent(m.uptime_24h)} />
        <Stat label="Uptime 7 дн." value={fmtPercent(m.uptime_7d)} />
        <Stat label="Uptime 30 дн." value={fmtPercent(m.uptime_30d)} />
        <Stat
          label="Отклик"
          value={fmtMs(m.last_latency_ms)}
          sub={`средний за 24 ч: ${fmtMs(m.avg_latency_24h)}`}
        />
        {m.type === "http" && m.url?.startsWith("https") ? (
          <Stat
            label="SSL-сертификат"
            value={sslDays == null ? "—" : sslDays < 0 ? "истёк" : `${sslDays} дн.`}
            tone={sslDays != null && sslDays < 14 ? (sslDays < 3 ? "var(--danger)" : "var(--warning)") : undefined}
            sub={m.ssl_expires_at ? `до ${fmtDate(m.ssl_expires_at)}${m.ssl_issuer ? ` · ${m.ssl_issuer}` : ""}` : "ещё не проверен"}
          />
        ) : (
          <Stat
            label="Последняя проверка"
            value={timeAgo(m.last_checked_at, now)}
            sub={m.last_status_code ? `HTTP ${m.last_status_code}` : m.type === "push" ? "push / heartbeat" : m.type.toUpperCase()}
          />
        )}
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Время отклика"
          description={
            series
              ? `средний ${fmtMs(series.avg_latency)} · максимум ${fmtMs(series.max_latency)} · доступность ${fmtPercent(series.uptime)}`
              : " "
          }
          actions={
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: "24h", label: "24 ч" },
                { value: "7d", label: "7 дн." },
                { value: "30d", label: "30 дн." },
                { value: "90d", label: "90 дн." },
              ]}
            />
          }
        />
        <div className="px-3 pb-2 pt-4">
          {series ? <LatencyChart series={series} /> : <Skeleton className="h-[220px]" />}
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Доступность за 90 дней"
          description={days ? `${fmtPercent(calcUptime(days))} за период` : " "}
        />
        <div className="px-4 pb-4 pt-5">{days ? <DailyBars days={days} /> : <Skeleton className="h-9" />}</div>
      </Card>

      {m.type === "push" && (
        <div className="mb-6">
          <PushInstructions monitor={m} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Инциденты" description="Периоды недоступности" />
          {!incidents ? (
            <div className="p-4">
              <Skeleton className="h-10" />
            </div>
          ) : incidents.length === 0 ? (
            <Empty icon={<ShieldCheck />} title="Инцидентов не было" className="py-10" />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {incidents.map((i) => (
                <IncidentRow key={i.id} incident={i} showMonitor={false} />
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Журнал проверок"
            description="Последние 25"
            actions={
              <Segmented
                value={onlyFailed ? "failed" : "all"}
                onChange={(v) => setOnlyFailed(v === "failed")}
                options={[
                  { value: "all", label: "Все" },
                  { value: "failed", label: "Ошибки" },
                ]}
              />
            }
          />
          {!checks ? (
            <div className="p-4">
              <Skeleton className="h-10" />
            </div>
          ) : checks.length === 0 ? (
            <Empty icon={<Siren />} title={onlyFailed ? "Ошибок нет" : "Проверок ещё не было"} className="py-10" />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {checks.map((c) => (
                <div key={c.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0">
                  {c.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-danger" />
                  )}
                  <span className="w-28 shrink-0 text-fg-muted tabular" title={fmtDateTime(c.checked_at)}>
                    {new Date(c.checked_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", c.ok ? "text-fg-muted" : "text-danger")}>
                    {c.ok ? (c.status_code ? `HTTP ${c.status_code}` : "OK") : c.error}
                  </span>
                  <span className="shrink-0 text-fg-muted tabular">{fmtMs(c.latency_ms)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <MonitorDialog open={editOpen} onOpenChange={setEditOpen} monitor={m} />
      {confirmDialog}
    </>
  );
}

function calcUptime(days: DailyPoint[]) {
  const total = days.reduce((s, d) => s + d.total, 0);
  const up = days.reduce((s, d) => s + d.up, 0);
  return total ? (up / total) * 100 : null;
}

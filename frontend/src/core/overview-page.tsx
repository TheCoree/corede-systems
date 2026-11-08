"use client";

import { ArrowRight, Bell, Check, Plus, ShieldAlert, Smartphone, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader, ColorDot, Empty, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { daysUntil, fmtMs, fmtPercent, since } from "@/lib/format";
import { useMe, useNow, useWorkspace } from "@/lib/hooks";
import type { Channel, Monitor, Project, Summary } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { IncidentRow } from "@/modules/monitoring/components/incident-list";
import { MonitorDialog } from "@/modules/monitoring/components/monitor-form";
import { StatusDot } from "@/modules/monitoring/components/status";

function Kpi({ label, value, tone, href }: { label: string; value: React.ReactNode; tone?: string; href?: string }) {
  const body = (
    <Card className={cn("px-4 py-3.5 transition-colors", href && "hover:border-border-strong")}>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function OverviewPage() {
  const { api: wsApi, href, workspace } = useWorkspace();
  const { data: me } = useMe();
  const now = useNow();
  const [addOpen, setAddOpen] = useState(false);
  const { data: summary } = useApi<Summary>(wsApi("/summary"), { refreshInterval: 15000 });
  const { data: monitors } = useApi<Monitor[]>(wsApi("/monitors"), { refreshInterval: 15000 });
  const { data: projects } = useApi<Project[]>(wsApi("/projects"));
  const { data: channels } = useApi<Channel[]>(wsApi("/channels"));

  const down = (monitors ?? []).filter((m) => m.status === "down");
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  })();

  const projectStats = (projects ?? [])
    .map((p) => {
      const ms = (monitors ?? []).filter((m) => m.project?.id === p.id);
      return { p, total: ms.length, down: ms.filter((m) => m.status === "down").length };
    })
    .sort((a, b) => b.down - a.down || b.total - a.total);

  if (!summary || !monitors) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px]" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const empty = summary.total === 0;
  const allGood = !empty && summary.counts.down === 0;

  return (
    <>
      <PageHeader
        title={`${greeting}${me ? `, ${me.user.name.split(" ")[0]}` : ""}`}
        description={
          empty ? (
            `Пространство «${workspace?.name ?? ""}» пока пустое`
          ) : allGood ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-success" />
              Все {summary.total} {plural(summary.total, "монитор работает", "монитора работают", "мониторов работают")}
            </span>
          ) : (
            <span className="text-danger">
              {summary.counts.down} {plural(summary.counts.down, "монитор недоступен", "монитора недоступны", "мониторов недоступны")}
            </span>
          )
        }
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus />
            Добавить монитор
          </Button>
        }
      />

      {down.length > 0 && (
        <Card className="mb-6 overflow-hidden border-danger/30">
          <div className="flex items-center gap-2 border-b border-danger/20 bg-danger/[0.06] px-4 py-2.5 text-sm font-medium text-danger">
            <XCircle className="size-4" />
            Требуют внимания
          </div>
          {down.map((m) => (
            <Link
              key={m.id}
              href={href(`/monitors/${m.id}`)}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/50"
            >
              <StatusDot status="down" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="truncate text-[13px] text-fg-muted">{m.last_error}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-medium text-danger tabular">{since(m.fail_since ?? m.last_change_at, now)}</div>
                {m.project && <div className="text-xs text-fg-subtle">{m.project.name}</div>}
              </div>
            </Link>
          ))}
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Мониторы" value={summary.total} href={href("/monitors")} />
        <Kpi
          label="Недоступны"
          value={summary.counts.down}
          tone={summary.counts.down ? "var(--danger)" : undefined}
          href={href("/incidents")}
        />
        <Kpi label="Uptime 24 ч" value={fmtPercent(summary.uptime_24h)} />
        <Kpi label="Uptime 30 дн." value={fmtPercent(summary.uptime_30d)} />
      </div>

      {empty ? (
        <Card>
          <CardHeader title="С чего начать" />
          <div className="divide-y divide-border">
            {[
              {
                icon: Plus,
                title: "Добавьте первый монитор",
                text: "Сайт, API, TCP-порт или heartbeat для cron-задачи. Можно сразу списком.",
                action: (
                  <Button variant="primary" onClick={() => setAddOpen(true)}>
                    Добавить
                  </Button>
                ),
              },
              {
                icon: Bell,
                title: "Подключите уведомления",
                text: "Telegram, Discord, Slack или webhook — узнаете о падении раньше клиента.",
                action: (
                  <Link href={href("/settings/notifications")} className={buttonClass()}>
                    Настроить
                  </Link>
                ),
              },
              {
                icon: Smartphone,
                title: "Виджет на iPhone",
                text: "Статусы на домашнем экране через приложение Scriptable.",
                action: (
                  <Link href={href("/settings/widget")} className={buttonClass()}>
                    Открыть
                  </Link>
                ),
              },
            ].map((s) => (
              <div key={s.title} className="flex items-center gap-4 px-4 py-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg">
                  <s.icon className="size-4 text-fg-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-[13px] text-fg-muted">{s.text}</div>
                </div>
                {s.action}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <CardHeader
                title="Проекты"
                actions={
                  <Link href={href("/projects")} className="text-[13px] text-fg-muted hover:text-fg">
                    Все
                  </Link>
                }
              />
              {projectStats.length === 0 ? (
                <Empty title="Проектов нет" description="Группируйте мониторы по клиентам и сайтам." className="py-8" />
              ) : (
                projectStats.slice(0, 8).map(({ p, total, down }) => (
                  <Link
                    key={p.id}
                    href={href(`/monitors?project=${p.id}`)}
                    className="flex h-11 items-center gap-3 border-b border-border px-4 text-sm last:border-b-0 hover:bg-muted/50"
                  >
                    <ColorDot color={p.color} className="size-2" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {down > 0 ? (
                      <span className="text-[13px] text-danger tabular">{down} down</span>
                    ) : total > 0 ? (
                      <Check className="size-4 text-success" />
                    ) : null}
                    <span className="w-8 text-right text-[13px] text-fg-subtle tabular">{total}</span>
                  </Link>
                ))
              )}
            </Card>

            {summary.ssl_expiring.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader title="SSL истекает" description="В ближайшие 14 дней" />
                {summary.ssl_expiring.map((s) => {
                  const d = daysUntil(s.ssl_expires_at, now);
                  return (
                    <Link
                      key={s.id}
                      href={href(`/monitors/${s.id}`)}
                      className="flex h-11 items-center gap-3 border-b border-border px-4 text-sm last:border-b-0 hover:bg-muted/50"
                    >
                      <ShieldAlert className={cn("size-4", d < 3 ? "text-danger" : "text-warning")} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className={cn("text-[13px] tabular", d < 3 ? "text-danger" : "text-warning")}>
                        {d < 0 ? "истёк" : `${d} дн.`}
                      </span>
                    </Link>
                  );
                })}
              </Card>
            )}

            {channels && channels.length === 0 && (
              <Card className="flex items-center gap-3 px-4 py-3.5">
                <Bell className="size-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="font-medium">Уведомления не настроены</div>
                  <div className="text-fg-muted">Подключите Telegram, чтобы узнавать о падениях сразу.</div>
                </div>
                <Link href={href("/settings/notifications")} className={buttonClass("secondary", "icon")} aria-label="Настроить">
                  <ArrowRight />
                </Link>
              </Card>
            )}
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title="Последние инциденты"
              description={`${summary.incidents_30d} за 30 дней · средний отклик ${fmtMs(summary.avg_latency_24h)}`}
              actions={
                <Link href={href("/incidents")} className="text-[13px] text-fg-muted hover:text-fg">
                  Все
                </Link>
              }
            />
            {summary.recent_incidents.length === 0 ? (
              <Empty title="Инцидентов не было" description="Всё стабильно." className="py-10" />
            ) : (
              summary.recent_incidents.map((i) => <IncidentRow key={i.id} incident={i} />)
            )}
          </Card>
        </div>
      )}

      <MonitorDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

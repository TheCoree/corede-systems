"use client";

import { ChevronRight, Globe, HeartPulse, Network } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Segmented, Switch } from "@/components/ui/misc";
import { ProjectSelect, TagPicker } from "@/core/pickers";
import { api, ApiError, revalidate } from "@/lib/api";
import { intervalLabel } from "@/lib/format";
import { useWorkspace } from "@/lib/hooks";
import type { Monitor, MonitorType } from "@/lib/types";
import { cn, plural } from "@/lib/utils";

const INTERVALS = [20, 30, 60, 120, 300, 600, 1800, 3600];
const PUSH_INTERVALS = [60, 300, 600, 1800, 3600, 21600, 43200, 86400];
const TIMEOUTS = [5, 10, 15, 30, 60];
const GRACES = [30, 60, 300, 600, 1800, 3600];

export type MonitorFormState = State;

type State = {
  type: MonitorType;
  name: string;
  project_id: string | null;
  tag_ids: string[];
  url: string;
  method: string;
  expected_status: string;
  keyword: string;
  keyword_invert: boolean;
  headers: string;
  follow_redirects: boolean;
  verify_ssl: boolean;
  host: string;
  port: string;
  interval: number;
  timeout: number;
  confirmations: number;
  notify: boolean;
};

const empty: State = {
  type: "http",
  name: "",
  project_id: null,
  tag_ids: [],
  url: "",
  method: "GET",
  expected_status: "200-399",
  keyword: "",
  keyword_invert: false,
  headers: "",
  follow_redirects: true,
  verify_ssl: true,
  host: "",
  port: "",
  interval: 60,
  timeout: 10,
  confirmations: 2,
  notify: true,
};

export function fromMonitor(m: Monitor): State {
  return {
    type: m.type,
    name: m.name,
    project_id: m.project?.id ?? null,
    tag_ids: m.tags.map((t) => t.id),
    url: m.url ?? "",
    method: m.method,
    expected_status: m.expected_status,
    keyword: m.keyword ?? "",
    keyword_invert: m.keyword_invert,
    headers: Object.entries(m.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    follow_redirects: m.follow_redirects,
    verify_ssl: m.verify_ssl,
    host: m.host ?? "",
    port: m.port ? String(m.port) : "",
    interval: m.interval,
    timeout: m.timeout,
    confirmations: m.confirmations,
    notify: m.notify,
  };
}

/** Пункты для числового списка; текущее значение добавляется, если его нет в пресетах. */
function numOptions(values: number[], current: number, label: (v: number) => string): SelectOption[] {
  const all = values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
  return all.map((v) => ({ value: String(v), label: label(v) }));
}

function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function hostOf(url: string) {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function toPayload(s: State) {
  const base = {
    name: s.name.trim(),
    type: s.type,
    project_id: s.project_id,
    tag_ids: s.tag_ids,
    interval: s.interval,
    timeout: s.timeout,
    confirmations: s.confirmations,
    notify: s.notify,
  };
  if (s.type === "http")
    return {
      ...base,
      url: s.url.trim(),
      method: s.method,
      expected_status: s.expected_status,
      keyword: s.keyword.trim() || null,
      keyword_invert: s.keyword_invert,
      headers: parseHeaders(s.headers),
      follow_redirects: s.follow_redirects,
      verify_ssl: s.verify_ssl,
    };
  if (s.type === "tcp") return { ...base, host: s.host.trim(), port: Number(s.port) || null };
  return base;
}

/** "Название | url" или просто url на строку */
function parseBulk(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.includes("|") ? line.split("|").map((x) => x.trim()) : [null, line];
      const url = b ?? "";
      return { name: a || hostOf(url) || url, url };
    });
}

type DialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  monitor?: Monitor;
  defaults?: Partial<State>;
  onSaved?: (m: Monitor) => void;
};

/** Форма монтируется заново при каждом открытии — состояние всегда свежее. */
export function MonitorDialog(props: DialogProps) {
  if (!props.open) return null;
  return <MonitorDialogInner {...props} />;
}

function MonitorDialogInner({ open, onOpenChange, monitor, defaults, onSaved }: DialogProps) {
  const { api: wsApi } = useWorkspace();
  const editing = !!monitor;
  const [s, setS] = useState<State>(() => (monitor ? fromMonitor(monitor) : { ...empty, ...defaults }));
  const [mode, setMode] = useState<"one" | "bulk">("one");
  const [bulk, setBulk] = useState("");
  const [nameTouched, setNameTouched] = useState(!!monitor || !!defaults?.name);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));

  const setType = (t: MonitorType) =>
    setS((p) => ({
      ...p,
      type: t,
      interval: t === "push" ? (PUSH_INTERVALS.includes(p.interval) ? p.interval : 300) : p.interval > 3600 ? 300 : p.interval,
      timeout: t === "push" ? 60 : 10,
      confirmations: t === "push" ? 1 : 2,
    }));

  const bulkItems = mode === "bulk" ? parseBulk(bulk) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "bulk" && !editing) {
        let ok = 0;
        const failed: string[] = [];
        for (const item of bulkItems) {
          try {
            await api(wsApi("/monitors"), {
              method: "POST",
              body: { ...toPayload({ ...s, type: "http", name: item.name, url: item.url }) },
            });
            ok++;
          } catch (err) {
            failed.push(`${item.url}: ${err instanceof ApiError ? err.message : "ошибка"}`);
          }
        }
        await revalidate(wsApi(""));
        if (failed.length) setError(failed.join("\n"));
        if (ok) toast.success(`Добавлено ${ok} ${plural(ok, "монитор", "монитора", "мониторов")}`);
        if (!failed.length) onOpenChange(false);
        return;
      }
      const saved = editing
        ? await api<Monitor>(wsApi(`/monitors/${monitor!.id}`), { method: "PATCH", body: toPayload(s) })
        : await api<Monitor>(wsApi("/monitors"), { method: "POST", body: toPayload(s) });
      await revalidate(wsApi(""));
      toast.success(editing ? "Сохранено" : `Монитор «${saved.name}» добавлен`);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const isPush = s.type === "push";
  const canSubmit =
    mode === "bulk"
      ? bulkItems.length > 0
      : !!s.name.trim() && (s.type !== "http" || !!s.url.trim()) && (s.type !== "tcp" || (!!s.host.trim() && !!s.port));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-[560px]"
      title={editing ? "Настройки монитора" : "Новый монитор"}
      description={editing ? monitor?.name : "Сайт, API, порт сервера или cron-задача"}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button variant="primary" type="submit" form="monitor-form" loading={saving} disabled={!canSubmit}>
            {editing
              ? "Сохранить"
              : mode === "bulk"
                ? `Добавить ${bulkItems.length || ""}`.trim()
                : "Добавить"}
          </Button>
        </>
      }
    >
      <form id="monitor-form" onSubmit={submit} className="flex flex-col gap-5">
        {!editing && (
          <Segmented
            className="self-start"
            value={mode}
            onChange={setMode}
            options={[
              { value: "one", label: "Один" },
              { value: "bulk", label: "Списком" },
            ]}
          />
        )}

        {mode === "bulk" ? (
          <Field
            label="Адреса"
            hint="Каждый с новой строки. Название можно указать так: Клиент — сайт | https://site.ru"
          >
            <Textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={6}
              className="font-mono text-[13px]"
              placeholder={"https://site-one.ru\nАПИ клиента | https://api.client.com/health\nshop.example.com"}
            />
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { t: "http", icon: Globe, label: "HTTP(S)", hint: "Сайт или API" },
                  { t: "tcp", icon: Network, label: "TCP-порт", hint: "SSH, БД, почта" },
                  { t: "push", icon: HeartPulse, label: "Heartbeat", hint: "Сервер стучится сам" },
                ] as const
              ).map(({ t, icon: Icon, label, hint }) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-ring",
                    s.type === t ? "border-fg/60 bg-muted" : "border-border hover:border-border-strong",
                  )}
                >
                  <Icon className={cn("size-4", s.type === t ? "text-fg" : "text-fg-subtle")} />
                  <span className="text-[13px] font-medium">{label}</span>
                  <span className="text-xs text-fg-muted">{hint}</span>
                </button>
              ))}
            </div>

            {s.type === "http" && (
              <Field label="URL">
                <Input
                  value={s.url}
                  onChange={(e) => {
                    const url = e.target.value;
                    setS((p) => ({ ...p, url, name: nameTouched ? p.name : hostOf(url) }));
                  }}
                  placeholder="https://example.com"
                  className="font-mono text-[13px]"
                />
              </Field>
            )}
            {s.type === "tcp" && (
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="Хост">
                  <Input
                    value={s.host}
                    onChange={(e) => {
                      const host = e.target.value;
                      setS((p) => ({ ...p, host, name: nameTouched ? p.name : host }));
                    }}
                    placeholder="203.0.113.10"
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="Порт">
                  <Input
                    value={s.port}
                    onChange={(e) => set("port", e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="22"
                    inputMode="numeric"
                    className="font-mono text-[13px]"
                  />
                </Field>
              </div>
            )}
            {isPush && (
              <p className="rounded-md border border-border bg-bg px-3 py-2.5 text-[13px] text-fg-muted">
                Ваш сервер или cron-задача отправляет запрос на уникальный URL (его покажем после создания). Если
                сигнала нет дольше интервала + допуска — монитор упадёт. Подходит для бэкапов, очередей и серверов за NAT.
              </p>
            )}

            <Field label="Название">
              <Input
                value={s.name}
                onChange={(e) => {
                  setNameTouched(true);
                  set("name", e.target.value);
                }}
                placeholder={isPush ? "Ночной бэкап" : "Сайт клиента"}
                maxLength={120}
              />
            </Field>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Проект">
            <ProjectSelect value={s.project_id} onChange={(v) => set("project_id", v)} />
          </Field>
          <Field label={isPush ? "Ожидаемый интервал" : "Интервал проверки"}>
            <Select
              value={String(s.interval)}
              onValueChange={(v) => set("interval", Number(v))}
              options={numOptions(isPush ? PUSH_INTERVALS : INTERVALS, s.interval, (v) => `каждые ${intervalLabel(v)}`)}
            />
          </Field>
        </div>

        <Field label="Теги">
          <TagPicker value={s.tag_ids} onChange={(v) => set("tag_ids", v)} />
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            className="flex items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg"
          >
            <ChevronRight className={cn("size-4 transition-transform", advanced && "rotate-90")} />
            Дополнительно
          </button>
          {advanced && (
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={isPush ? "Допуск" : "Таймаут"} hint={isPush ? "Запас сверх интервала" : undefined}>
                  <Select
                    value={String(s.timeout)}
                    onValueChange={(v) => set("timeout", Number(v))}
                    options={numOptions(isPush ? GRACES : TIMEOUTS, s.timeout, intervalLabel)}
                  />
                </Field>
                <Field label="Считать упавшим" hint="Защита от ложных тревог">
                  <Select
                    value={String(s.confirmations)}
                    onValueChange={(v) => set("confirmations", Number(v))}
                    options={numOptions([1, 2, 3, 5], s.confirmations, (v) =>
                      v === 1 ? "сразу после 1 ошибки" : `после ${v} ошибок подряд`,
                    )}
                  />
                </Field>
              </div>

              {s.type === "http" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Метод">
                      <Select
                        value={s.method}
                        onValueChange={(v) => set("method", v)}
                        options={["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((m) => ({
                          value: m,
                          label: <span className="font-mono text-[13px]">{m}</span>,
                        }))}
                      />
                    </Field>
                    <Field label="Ожидаемые коды" hint="Например: 200-299, 301">
                      <Input
                        value={s.expected_status}
                        onChange={(e) => set("expected_status", e.target.value)}
                        className="font-mono text-[13px]"
                      />
                    </Field>
                  </div>
                  <Field
                    label="Ключевое слово"
                    hint={
                      s.keyword_invert
                        ? "Монитор упадёт, если текст ПОЯВИТСЯ на странице (например, «Fatal error»)"
                        : "Монитор упадёт, если текста НЕТ на странице"
                    }
                    aside={
                      <label className="flex items-center gap-2 text-[13px] text-fg-muted">
                        Инвертировать
                        <Switch checked={s.keyword_invert} onCheckedChange={(v) => set("keyword_invert", v)} />
                      </label>
                    }
                  >
                    <Input value={s.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="Необязательно" />
                  </Field>
                  <Field label="Заголовки" hint="По одному на строку: Authorization: Bearer …">
                    <Textarea
                      value={s.headers}
                      onChange={(e) => set("headers", e.target.value)}
                      rows={2}
                      className="min-h-16 font-mono text-[13px]"
                    />
                  </Field>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center justify-between gap-3 text-[13px]">
                      <span>
                        Проверять SSL-сертификат
                        <span className="block text-fg-muted">И предупреждать об истечении срока</span>
                      </span>
                      <Switch checked={s.verify_ssl} onCheckedChange={(v) => set("verify_ssl", v)} />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-[13px]">
                      Следовать редиректам
                      <Switch checked={s.follow_redirects} onCheckedChange={(v) => set("follow_redirects", v)} />
                    </label>
                  </div>
                </>
              )}
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>
                  Уведомления
                  <span className="block text-fg-muted">Отправлять события в каналы пространства</span>
                </span>
                <Switch checked={s.notify} onCheckedChange={(v) => set("notify", v)} />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="whitespace-pre-wrap rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

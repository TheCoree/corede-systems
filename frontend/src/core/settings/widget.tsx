"use client";

import { Download, KeyRound, Smartphone, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardHeader, CopyButton, Skeleton } from "@/components/ui/misc";
import { ApiError, useApi } from "@/lib/api";
import { useOrigin, useWorkspace } from "@/lib/hooks";
import { scriptableWidget } from "@/lib/scriptable";
import type { Monitor, Summary } from "@/lib/types";
import { useCreateToken } from "./tokens";
import { WidgetPreview } from "./widget-preview";

const STEPS = [
  "Установите Scriptable из App Store (бесплатно).",
  "Откройте Scriptable → «+» → вставьте скрипт → назовите его «corede». Нажмите ▶︎ — откроется предпросмотр любого размера.",
  "Домашний экран: долгое нажатие → «+» → Scriptable → выберите размер (малый, средний, большой; на iPad — очень большой).",
  "Нажмите на виджет → Script: corede. Parameter по желанию: project:Название, tag:prod или down (только проблемы).",
  "Экран блокировки: долгое нажатие → «Настроить» → добавьте Scriptable (круг, прямоугольник или строку над часами).",
  "Нажатие на строку монитора в среднем и большом виджете открывает его страницу в панели.",
];

export function WidgetSettings() {
  const { api: wsApi, workspace } = useWorkspace();
  const createToken = useCreateToken();
  const { data: summary } = useApi<Summary>(wsApi("/summary"));
  const { data: monitors } = useApi<Monitor[]>(wsApi("/monitors"));
  const [serverDraft, setServer] = useState<string | null>(null);
  const origin = useOrigin();
  const server = serverDraft ?? origin;
  const [token, setToken] = useState("");
  const [creating, setCreating] = useState(false);

  const isLocal = /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(server);
  const script = useMemo(() => (token ? scriptableWidget(server, token) : ""), [server, token]);

  async function generate() {
    setCreating(true);
    try {
      const t = await createToken({ name: "iOS виджет", scope: "read" });
      setToken(t.token);
      toast.success("Токен для виджета создан");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  }

  function download() {
    const blob = new Blob([script], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "corede.js";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Smartphone className="size-4" />
          Статусы на экране iPhone и iPad
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Виджет через Scriptable: все размеры домашнего экрана и экрана блокировки, живой таймер простоя, графики за 24 часа.
          Обновляется каждые ~5 минут, упавшие мониторы — первыми, без сети показывает последние данные.
        </p>
      </div>

      <Card className="p-4">
        {monitors ? (
          <WidgetPreview summary={summary} monitors={monitors} title={workspace?.name ?? "corede"} />
        ) : (
          <Skeleton className="h-[360px]" />
        )}
      </Card>

      <Card>
        <CardHeader title="1. Адрес и токен" />
        <div className="space-y-4 p-4">
          <Field label="Адрес панели" hint="Должен открываться с телефона — публичный домен с HTTPS.">
            <Input value={server} onChange={(e) => setServer(e.target.value.trim())} className="font-mono text-[13px]" />
          </Field>
          {isLocal && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[13px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              localhost недоступен с телефона. Укажите адрес, по которому панель доступна из интернета (или локальной сети).
            </div>
          )}
          <Field label="Токен (только чтение)">
            <div className="flex gap-2">
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value.trim())}
                placeholder="cds_… — вставьте существующий или создайте новый"
                className="flex-1 font-mono text-[13px]"
              />
              <Button onClick={generate} loading={creating}>
                <KeyRound />
                Создать
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="2. Скрипт"
          description={token ? "Токен уже вписан в скрипт" : "Появится после выбора токена"}
          actions={
            token ? (
              <>
                <CopyButton value={script} label="Скрипт" className="h-8 px-2.5 text-sm" />
                <Button onClick={download}>
                  <Download />
                  .js
                </Button>
              </>
            ) : null
          }
        />
        <div className="p-4">
          {token ? (
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-[12px] leading-relaxed text-fg-muted">
              {script}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-fg-muted">
              Создайте токен выше — скрипт сгенерируется автоматически
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="3. Установка" />
        <ol className="space-y-3 p-4">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 text-[13px]">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-[11px] font-medium tabular">
                {i + 1}
              </span>
              <span className="pt-px text-fg-muted">{s}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

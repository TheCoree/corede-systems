"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Card, CardHeader, Code, CopyButton, Segmented } from "@/components/ui/misc";
import { api, revalidate } from "@/lib/api";
import { intervalLabel } from "@/lib/format";
import { useOrigin, useWorkspace } from "@/lib/hooks";
import type { Monitor } from "@/lib/types";

function cronFor(sec: number) {
  if (sec < 3600) return `*/${Math.max(1, Math.round(sec / 60))} * * * *`;
  if (sec < 86400) return `0 */${Math.round(sec / 3600)} * * *`;
  return "0 3 * * *";
}

export function PushInstructions({ monitor }: { monitor: Monitor }) {
  const { api: wsApi } = useWorkspace();
  const [confirm, dialog] = useConfirm();
  const [tab, setTab] = useState<"curl" | "cron" | "after">("cron");
  const url = `${useOrigin()}/api/push/${monitor.push_token}`;

  const snippets = {
    curl: `curl -fsS -m 10 "${url}"`,
    cron: `${cronFor(monitor.interval)}  curl -fsS -m 10 "${url}" > /dev/null`,
    after: `# сигнал только при успехе задачи, иначе — сообщение об ошибке
/opt/backup.sh && curl -fsS -m 10 "${url}" \\
  || curl -fsS -m 10 "${url}?status=down&msg=backup%20failed"`,
  };

  return (
    <Card>
      <CardHeader
        title="Как отправлять сигнал"
        description={`Ожидаем запрос хотя бы раз в ${intervalLabel(monitor.interval)} (+${intervalLabel(monitor.timeout)} допуска)`}
        actions={
          <Button
            onClick={async () => {
              if (
                await confirm({
                  title: "Выпустить новый push-URL?",
                  description: "Старый адрес перестанет работать — его нужно будет заменить на серверах.",
                  confirmLabel: "Выпустить",
                })
              ) {
                await api(wsApi(`/monitors/${monitor.id}/push-token`), { method: "POST" });
                await revalidate(wsApi("/monitors"));
              }
            }}
          >
            <RotateCw />
            Новый URL
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{url}</span>
          <CopyButton value={url} label="URL" />
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "cron", label: "crontab" },
            { value: "curl", label: "curl" },
            { value: "after", label: "После задачи" },
          ]}
        />
        <Code>{snippets[tab]}</Code>
        <p className="text-[13px] text-fg-muted">
          Параметры: <span className="font-mono text-fg">status=down</span> — сообщить о сбое,{" "}
          <span className="font-mono text-fg">msg=…</span> — текст ошибки,{" "}
          <span className="font-mono text-fg">ping=120</span> — длительность в мс для графика.
        </p>
      </div>
      {dialog}
    </Card>
  );
}

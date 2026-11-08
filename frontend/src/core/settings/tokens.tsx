"use client";

import { KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, Card, Code, Empty, Skeleton } from "@/components/ui/misc";
import { api, ApiError, useApi } from "@/lib/api";
import { fmtDate, timeAgo } from "@/lib/format";
import { useOrigin, useWorkspace } from "@/lib/hooks";
import type { ApiToken } from "@/lib/types";

type Created = ApiToken & { token: string };

export function useCreateToken() {
  const { api: wsApi } = useWorkspace();
  return (body: { name: string; scope: "read" | "write"; expires_days?: number | null }) =>
    api<Created>(wsApi("/tokens"), { method: "POST", body });
}

export function TokensSettings() {
  const { api: wsApi } = useWorkspace();
  const [confirm, confirmDialog] = useConfirm();
  const createToken = useCreateToken();
  const { data: tokens, mutate } = useApi<ApiToken[]>(wsApi("/tokens"));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [expires, setExpires] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const t = await createToken({ name, scope, expires_days: expires ? Number(expires) : null });
      setCreated(t);
      void mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const base = useOrigin();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-fg-muted">
          Доступ к API пространства без входа: виджеты, скрипты, внешние дашборды. Передавайте в заголовке{" "}
          <span className="font-mono text-fg">Authorization: Bearer …</span>
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setCreated(null);
            setName("");
            setScope("read");
            setExpires("");
            setOpen(true);
          }}
        >
          <Plus />
          Создать токен
        </Button>
      </div>

      <Card className="overflow-hidden">
        {!tokens ? (
          <div className="p-4">
            <Skeleton className="h-10" />
          </div>
        ) : tokens.length === 0 ? (
          <Empty icon={<KeyRound />} title="Токенов нет" />
        ) : (
          tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <KeyRound className="size-4 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <Badge>{t.scope === "write" ? "чтение и запись" : "только чтение"}</Badge>
                </div>
                <div className="truncate text-[13px] text-fg-muted">
                  <span className="font-mono">{t.prefix}…</span> · создан {fmtDate(t.created_at)} ·{" "}
                  {t.last_used_at ? `использован ${timeAgo(t.last_used_at)}` : "не использовался"}
                  {t.expires_at && ` · до ${fmtDate(t.expires_at)}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Отозвать"
                onClick={async () => {
                  if (await confirm({ title: `Отозвать «${t.name}»?`, description: "Всё, что использует этот токен, перестанет работать.", confirmLabel: "Отозвать", danger: true })) {
                    await api(wsApi(`/tokens/${t.id}`), { method: "DELETE" });
                    void mutate();
                  }
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-sm font-medium">Пример</div>
        <Code>{`curl -H "Authorization: Bearer cds_…" ${base}/api/widget\ncurl -H "Authorization: Bearer cds_…" ${base}/api/w/<пространство>/monitors`}</Code>
        <p className="mt-2 text-[13px] text-fg-muted">
          Полная схема API: <a href="/api/docs" target="_blank" className="text-fg underline-offset-2 hover:underline">/api/docs</a>
        </p>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={created ? "Токен создан" : "Новый токен"}
        footer={
          created ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              Готово
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Отмена</Button>
              <Button variant="primary" type="submit" form="token-form" loading={saving} disabled={!name.trim()}>
                Создать
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[13px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              Скопируйте токен сейчас — потом его нельзя будет посмотреть.
            </div>
            <Code>{created.token}</Code>
          </div>
        ) : (
          <form id="token-form" onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Название">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, iPhone или Grafana" maxLength={80} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Права">
                <Select
                  value={scope}
                  onValueChange={(v) => setScope(v as "read" | "write")}
                  options={[
                    { value: "read", label: "Только чтение" },
                    { value: "write", label: "Чтение и запись" },
                  ]}
                />
              </Field>
              <Field label="Срок действия">
                <Select
                  value={expires}
                  onValueChange={setExpires}
                  options={[
                    { value: "", label: "Бессрочно" },
                    { value: "30", label: "30 дней" },
                    { value: "90", label: "90 дней" },
                    { value: "365", label: "1 год" },
                  ]}
                />
              </Field>
            </div>
          </form>
        )}
      </Dialog>
      {confirmDialog}
    </div>
  );
}

"use client";

import { Bell, MoreHorizontal, Pencil, Plus, Send, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Card, Empty, Skeleton, Switch } from "@/components/ui/misc";
import { api, ApiError, useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useWorkspace } from "@/lib/hooks";
import type { Channel, ChannelType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TelegramIcon = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={p.className} fill="currentColor" aria-hidden>
    <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L6.6 13.4 2 12c-1-.3-1-1 .2-1.5L20.6 3.4c.8-.3 1.6.2 1.3.9Z" />
  </svg>
);
const DiscordIcon = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={p.className} fill="currentColor" aria-hidden>
    <path d="M19.3 5.3A17 17 0 0 0 15 4l-.5 1.1a15.6 15.6 0 0 0-5 0L9 4a17 17 0 0 0-4.3 1.3C2 9.3 1.3 13.2 1.6 17a17 17 0 0 0 5.3 2.7l1.1-1.8c-.6-.2-1.2-.5-1.7-.9l.4-.3a12 12 0 0 0 10.6 0l.4.3c-.5.4-1.1.7-1.7.9l1.1 1.8a17 17 0 0 0 5.3-2.7c.4-4.4-.7-8.3-3.1-11.7ZM8.7 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" />
  </svg>
);
const SlackIcon = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={p.className} fill="currentColor" aria-hidden>
    <path d="M6 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Zm2-9a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Zm9 2a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Zm-2 9a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
  </svg>
);

const TYPES: Record<ChannelType, { label: string; icon: (p: { className?: string }) => React.ReactNode; hint: string }> = {
  telegram: { label: "Telegram", icon: TelegramIcon, hint: "Бот пишет в личку, группу или канал" },
  discord: { label: "Discord", icon: DiscordIcon, hint: "Webhook канала" },
  slack: { label: "Slack", icon: SlackIcon, hint: "Incoming Webhook" },
  webhook: { label: "Webhook", icon: (p) => <Webhook className={p.className} />, hint: "JSON POST на ваш URL" },
};

type ChannelDialogProps = { open: boolean; onOpenChange: (v: boolean) => void; channel?: Channel; onSaved: () => void };

function ChannelDialog(props: ChannelDialogProps) {
  return props.open ? <ChannelDialogInner {...props} /> : null;
}

function ChannelDialogInner({ open, onOpenChange, channel, onSaved }: ChannelDialogProps) {
  const { api: wsApi } = useWorkspace();
  const [type, setType] = useState<ChannelType>(channel?.type ?? "telegram");
  const [name, setName] = useState(channel?.name ?? "");
  const [cfg, setCfg] = useState<Record<string, string>>(channel?.config ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name: name || TYPES[type].label, type, config: cfg };
      if (channel) await api(wsApi(`/channels/${channel.id}`), { method: "PATCH", body: { name: body.name, config: cfg } });
      else await api(wsApi("/channels"), { method: "POST", body });
      onSaved();
      onOpenChange(false);
      toast.success(channel ? "Канал сохранён" : "Канал добавлен — отправьте тест");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const setC = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg((c) => ({ ...c, [k]: e.target.value }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={channel ? "Канал уведомлений" : "Новый канал"}
      description="Сюда придут события: монитор упал, восстановился, истекает SSL."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button variant="primary" type="submit" form="channel-form" loading={saving}>
            {channel ? "Сохранить" : "Добавить"}
          </Button>
        </>
      }
    >
      <form id="channel-form" onSubmit={submit} className="flex flex-col gap-4">
        {!channel && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(TYPES) as ChannelType[]).map((t) => {
              const Icon = TYPES[t].icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setCfg({});
                  }}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border text-[13px] transition-colors focus-ring",
                    type === t ? "border-fg/60 bg-muted text-fg" : "border-border text-fg-muted hover:border-border-strong",
                  )}
                >
                  <Icon className="size-4" />
                  {TYPES[t].label}
                </button>
              );
            })}
          </div>
        )}
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={TYPES[type].label} maxLength={80} />
        </Field>
        {type === "telegram" ? (
          <>
            <Field label="Токен бота" hint="Создайте бота у @BotFather и вставьте токен вида 123456:ABC…">
              <Input value={cfg.bot_token ?? ""} onChange={setC("bot_token")} className="font-mono text-[13px]" autoComplete="off" />
            </Field>
            <Field
              label="Chat ID"
              hint="Напишите боту /start, затем узнайте id у @userinfobot. Для группы — добавьте бота и используйте id вида -100…"
            >
              <Input value={cfg.chat_id ?? ""} onChange={setC("chat_id")} className="font-mono text-[13px]" placeholder="123456789" />
            </Field>
          </>
        ) : (
          <Field label="URL вебхука" hint={TYPES[type].hint}>
            <Input value={cfg.url ?? ""} onChange={setC("url")} className="font-mono text-[13px]" placeholder="https://…" autoComplete="off" />
          </Field>
        )}
        {channel && <p className="text-xs text-fg-subtle">Секреты скрыты. Оставьте поле как есть, чтобы не менять.</p>}
        {error && <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
      </form>
    </Dialog>
  );
}

export function NotificationsSettings() {
  const { api: wsApi } = useWorkspace();
  const [confirm, confirmDialog] = useConfirm();
  const { data: channels, mutate } = useApi<Channel[]>(wsApi("/channels"));
  const [dialog, setDialog] = useState<{ open: boolean; channel?: Channel }>({ open: false });
  const [testing, setTesting] = useState<string | null>(null);

  async function test(c: Channel) {
    setTesting(c.id);
    try {
      await api(wsApi(`/channels/${c.id}/test`), { method: "POST" });
      toast.success(`Тест отправлен в «${c.name}»`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setTesting(null);
      void mutate();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-fg-muted">События всех мониторов пространства (у которых включены уведомления).</p>
        <Button variant="primary" onClick={() => setDialog({ open: true })}>
          <Plus />
          Добавить канал
        </Button>
      </div>
      <Card className="overflow-hidden">
        {!channels ? (
          <div className="p-4">
            <Skeleton className="h-10" />
          </div>
        ) : channels.length === 0 ? (
          <Empty
            icon={<Bell />}
            title="Каналов нет"
            description="Подключите Telegram — бот напишет, как только сайт клиента перестанет отвечать."
            action={
              <Button variant="primary" onClick={() => setDialog({ open: true })}>
                <Plus />
                Добавить канал
              </Button>
            }
          />
        ) : (
          channels.map((c) => {
            const Icon = TYPES[c.type].icon;
            return (
              <div key={c.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg">
                  <Icon className="size-4 text-fg-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className={cn("truncate text-[13px]", c.last_error ? "text-danger" : "text-fg-muted")}>
                    {c.last_error
                      ? `Ошибка: ${c.last_error}`
                      : c.last_sent_at
                        ? `${TYPES[c.type].label} · последнее событие ${timeAgo(c.last_sent_at)}`
                        : `${TYPES[c.type].label} · ${c.type === "telegram" ? `chat ${c.config.chat_id}` : c.config.url}`}
                  </div>
                </div>
                <Button onClick={() => test(c)} loading={testing === c.id}>
                  <Send />
                  Тест
                </Button>
                <Switch
                  checked={c.enabled}
                  onCheckedChange={async (v) => {
                    await api(wsApi(`/channels/${c.id}`), { method: "PATCH", body: { enabled: v } });
                    void mutate();
                  }}
                />
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Действия">
                      <MoreHorizontal />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => setDialog({ open: true, channel: c })}>
                      <Pencil />
                      Изменить
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      danger
                      onSelect={async () => {
                        if (await confirm({ title: `Удалить канал «${c.name}»?`, confirmLabel: "Удалить", danger: true })) {
                          await api(wsApi(`/channels/${c.id}`), { method: "DELETE" });
                          void mutate();
                        }
                      }}
                    >
                      <Trash2 />
                      Удалить
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            );
          })
        )}
      </Card>
      <ChannelDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        channel={dialog.channel}
        onSaved={() => void mutate()}
      />
      {confirmDialog}
    </div>
  );
}

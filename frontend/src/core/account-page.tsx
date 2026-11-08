"use client";

import { Laptop, Smartphone } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card, Segmented, Skeleton } from "@/components/ui/misc";
import { api, ApiError, useApi } from "@/lib/api";
import { fmtDate, timeAgo } from "@/lib/format";
import { useMe, useMounted } from "@/lib/hooks";
import type { SessionInfo } from "@/lib/types";
import { SettingsCard } from "./settings/general";

function deviceName(ua: string | null) {
  if (!ua) return "Неизвестное устройство";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

export function AccountPage() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { data: sessions, mutate: reloadSessions } = useApi<SessionInfo[]>("/auth/sessions");
  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? me?.user.name ?? "";
  const [pwd, setPwd] = useState({ current: "", next: "" });
  const [saving, setSaving] = useState<string | null>(null);

  async function saveName() {
    setSaving("name");
    try {
      await api("/auth/me", { method: "PATCH", body: { name } });
      await mutate("/auth/me");
      setName(null);
      toast.success("Имя сохранено");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setSaving(null);
    }
  }

  async function savePassword() {
    setSaving("pwd");
    try {
      await api("/auth/password", { method: "POST", body: { current: pwd.current, new: pwd.next } });
      setPwd({ current: "", next: "" });
      void reloadSessions();
      toast.success("Пароль изменён, остальные сессии завершены");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setSaving(null);
    }
  }

  if (!me) return <Skeleton className="h-64" />;

  return (
    <>
      <PageHeader title="Аккаунт" description={me.user.email} />
      <div className="max-w-3xl space-y-6">
        <SettingsCard
          title="Профиль"
          footer={
            <Button variant="primary" onClick={saveName} loading={saving === "name"} disabled={!name.trim() || name === me.user.name}>
              Сохранить
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Имя">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Email">
              <Input value={me.user.email} disabled />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            {me.user.is_admin && <Badge color="purple" variant="soft">Администратор</Badge>}
            <span>Аккаунт с {fmtDate(me.user.created_at)}</span>
          </div>
        </SettingsCard>

        <SettingsCard title="Тема" description="Интерфейс подстраивается под выбранный режим.">
          {mounted && (
            <Segmented
              value={(theme ?? "dark") as "light" | "dark" | "system"}
              onChange={setTheme}
              options={[
                { value: "light", label: "Светлая" },
                { value: "dark", label: "Тёмная" },
                { value: "system", label: "Как в системе" },
              ]}
            />
          )}
        </SettingsCard>

        <SettingsCard
          title="Пароль"
          description="После смены пароля все остальные сессии будут завершены."
          footer={
            <Button variant="primary" onClick={savePassword} loading={saving === "pwd"} disabled={!pwd.current || pwd.next.length < 8}>
              Сменить пароль
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Текущий пароль">
              <Input type="password" autoComplete="current-password" value={pwd.current} onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} />
            </Field>
            <Field label="Новый пароль" hint="Минимум 8 символов">
              <Input type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} />
            </Field>
          </div>
        </SettingsCard>

        <Card className="overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-base font-semibold tracking-tight">Активные сессии</h3>
            <p className="mt-1 text-[13px] text-fg-muted">Устройства, с которых выполнен вход.</p>
          </div>
          {sessions?.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-t border-border px-5 py-3">
              {/iPhone|Android/.test(s.user_agent ?? "") ? (
                <Smartphone className="size-4 shrink-0 text-fg-subtle" />
              ) : (
                <Laptop className="size-4 shrink-0 text-fg-subtle" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate">{deviceName(s.user_agent)}</span>
                  {s.current && <Badge color="green" variant="soft">Эта сессия</Badge>}
                </div>
                <div className="text-[13px] text-fg-muted">
                  {s.ip} · активность {timeAgo(s.last_seen_at)}
                </div>
              </div>
              {!s.current && (
                <Button
                  onClick={async () => {
                    await api(`/auth/sessions/${s.id}`, { method: "DELETE" });
                    void reloadSessions();
                  }}
                >
                  Завершить
                </Button>
              )}
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

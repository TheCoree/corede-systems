"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { api, ApiError, useApi } from "@/lib/api";
import { useOrigin, useWorkspace } from "@/lib/hooks";
import type { Workspace } from "@/lib/types";

export function SettingsCard({
  title,
  description,
  children,
  footer,
  danger,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card className={danger ? "border-danger/30" : undefined}>
      <div className="p-5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {footer && (
        <div
          className={`flex items-center justify-end gap-3 rounded-b-lg border-t px-5 py-3 ${danger ? "border-danger/30 bg-danger/[0.04]" : "border-border bg-bg"}`}
        >
          {footer}
        </div>
      )}
    </Card>
  );
}

export function GeneralSettings() {
  const router = useRouter();
  const { api: wsApi, slug } = useWorkspace();
  const [confirm, dialog] = useConfirm();
  const origin = useOrigin();
  const { data: ws, mutate: reloadWs } = useApi<Workspace>(wsApi(""));
  // черновики: null = «как на сервере»
  const [nameDraft, setName] = useState<string | null>(null);
  const [slugDraft, setNewSlug] = useState<string | null>(null);
  const name = nameDraft ?? ws?.name ?? "";
  const newSlug = slugDraft ?? ws?.slug ?? "";
  const [saving, setSaving] = useState<string | null>(null);

  const canManage = ws?.role === "owner" || ws?.role === "admin";

  async function save(field: "name" | "slug") {
    setSaving(field);
    try {
      const body = field === "name" ? { name } : { slug: newSlug };
      const res = await api<Workspace>(wsApi(""), { method: "PATCH", body });
      await mutate("/auth/me");
      toast.success("Сохранено");
      if (field === "slug" && res.slug !== slug) {
        router.replace(`/${res.slug}/settings`);
      } else {
        await reloadWs(res, { revalidate: false });
      }
      setName(null);
      setNewSlug(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Название"
        description="Показывается в переключателе пространств и уведомлениях."
        footer={
          <Button variant="primary" onClick={() => save("name")} loading={saving === "name"} disabled={!canManage || !name.trim() || name === ws?.name}>
            Сохранить
          </Button>
        }
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" maxLength={80} disabled={!canManage} />
      </SettingsCard>

      <SettingsCard
        title="Адрес"
        description="Используется в ссылках панели и уведомлений. Латиница, цифры и дефис."
        footer={
          <Button variant="primary" onClick={() => save("slug")} loading={saving === "slug"} disabled={!canManage || !newSlug || newSlug === ws?.slug}>
            Сохранить
          </Button>
        }
      >
        <Field>
          <div className="flex max-w-sm items-center overflow-hidden rounded-md border border-border bg-bg">
            <span className="whitespace-nowrap px-2.5 text-sm text-fg-subtle">
              {origin.replace(/^https?:\/\//, "")}/
            </span>
            <input
              value={newSlug}
              disabled={!canManage}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="h-8 min-w-0 flex-1 border-l border-border bg-surface px-2.5 text-sm outline-none"
            />
          </div>
        </Field>
      </SettingsCard>

      {ws?.role === "owner" && (
        <SettingsCard
          danger
          title="Удалить пространство"
          description="Все проекты, мониторы, история и токены будут удалены без возможности восстановления."
          footer={
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Удалить «${ws.name}»?`,
                    description: "Все данные пространства будут удалены.",
                    confirmLabel: "Удалить навсегда",
                    danger: true,
                    typeToConfirm: ws.slug,
                  })
                ) {
                  try {
                    await api(wsApi(""), { method: "DELETE" });
                    await mutate("/auth/me");
                    router.replace("/");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Ошибка");
                  }
                }
              }}
            >
              Удалить пространство
            </Button>
          }
        />
      )}
      {dialog}
    </div>
  );
}

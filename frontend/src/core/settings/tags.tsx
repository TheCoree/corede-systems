"use client";

import { Plus, Tags, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { Card, ColorDot, Empty, Skeleton } from "@/components/ui/misc";
import { ColorPicker } from "@/core/pickers";
import { api, ApiError, revalidate, useApi } from "@/lib/api";
import { COLOR_LIST } from "@/lib/colors";
import { useWorkspace } from "@/lib/hooks";
import type { Color, Monitor, Tag } from "@/lib/types";
import { plural } from "@/lib/utils";

export function TagsSettings() {
  const { api: wsApi } = useWorkspace();
  const [confirm, dialog] = useConfirm();
  const { data: tags } = useApi<Tag[]>(wsApi("/tags"));
  const { data: monitors } = useApi<Monitor[]>(wsApi("/monitors"));
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const mon of monitors ?? []) for (const t of mon.tags) m.set(t.id, (m.get(t.id) ?? 0) + 1);
    return m;
  }, [monitors]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await revalidate(wsApi(""));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    }
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    await run(() =>
      api(wsApi("/tags"), {
        method: "POST",
        body: { name, color: COLOR_LIST[(tags?.length ?? 0) % COLOR_LIST.length] },
      }),
    );
    setName("");
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">
        Теги — второе измерение сортировки помимо проектов: окружение (prod, staging), хостинг, тип сервера, приоритет.
      </p>
      <form onSubmit={create} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название тега" className="max-w-xs" maxLength={40} />
        <Button type="submit" variant="primary" loading={adding} disabled={!name.trim()}>
          <Plus />
          Добавить
        </Button>
      </form>
      <Card className="overflow-hidden">
        {!tags ? (
          <div className="p-4">
            <Skeleton className="h-8" />
          </div>
        ) : tags.length === 0 ? (
          <Empty icon={<Tags />} title="Тегов пока нет" />
        ) : (
          tags.map((t) => (
            <div key={t.id} className="flex h-12 items-center gap-3 border-b border-border px-4 last:border-b-0">
              <Menu>
                <MenuTrigger asChild>
                  <button className="flex size-7 items-center justify-center rounded-md hover:bg-muted" aria-label="Цвет">
                    <ColorDot color={t.color} />
                  </button>
                </MenuTrigger>
                <MenuContent align="start" className="w-auto p-2">
                  <ColorPicker
                    value={t.color}
                    onChange={(c: Color) => run(() => api(wsApi(`/tags/${t.id}`), { method: "PATCH", body: { color: c } }))}
                  />
                </MenuContent>
              </Menu>
              <input
                defaultValue={t.name}
                maxLength={40}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.name) void run(() => api(wsApi(`/tags/${t.id}`), { method: "PATCH", body: { name: v } }));
                  else e.target.value = t.name;
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-border-strong focus:bg-surface focus:outline-none"
              />
              <span className="text-[13px] text-fg-subtle tabular">
                {usage.get(t.id) ?? 0} {plural(usage.get(t.id) ?? 0, "монитор", "монитора", "мониторов")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Удалить"
                onClick={async () => {
                  if (await confirm({ title: `Удалить тег «${t.name}»?`, description: "Тег будет снят со всех мониторов.", confirmLabel: "Удалить", danger: true }))
                    await run(() => api(wsApi(`/tags/${t.id}`), { method: "DELETE" }));
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </Card>
      {dialog}
    </div>
  );
}

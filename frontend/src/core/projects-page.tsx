"use client";

import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Card, ColorDot, Empty, Skeleton } from "@/components/ui/misc";
import { ColorPicker } from "@/core/pickers";
import { api, ApiError, revalidate, useApi } from "@/lib/api";
import { COLORS, ratioColor, STATUS } from "@/lib/colors";
import { fmtPercent } from "@/lib/format";
import { useWorkspace } from "@/lib/hooks";
import type { Color, Monitor, MonitorStatus, Project } from "@/lib/types";
import { plural } from "@/lib/utils";

type ProjectDialogProps = { open: boolean; onOpenChange: (v: boolean) => void; project?: Project };

function ProjectDialog(props: ProjectDialogProps) {
  return props.open ? <ProjectDialogInner {...props} /> : null;
}

function ProjectDialogInner({ open, onOpenChange, project }: ProjectDialogProps) {
  const { api: wsApi } = useWorkspace();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState<Color>(project?.color ?? "blue");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name, description: description || null, color };
      if (project) await api(wsApi(`/projects/${project.id}`), { method: "PATCH", body });
      else await api(wsApi("/projects"), { method: "POST", body });
      await revalidate(wsApi(""));
      toast.success(project ? "Проект сохранён" : "Проект создан");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? "Проект" : "Новый проект"}
      description="Клиент, сайт или группа серверов — объединяет мониторы и будущие модули."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button variant="primary" type="submit" form="project-form" loading={saving} disabled={!name.trim()}>
            {project ? "Сохранить" : "Создать"}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Клиент — интернет-магазин" maxLength={80} />
        </Field>
        <Field label="Описание">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Контакты, хостинг, заметки"
            className="min-h-16"
          />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </form>
    </Dialog>
  );
}

export function ProjectsPage() {
  const { api: wsApi, href } = useWorkspace();
  const [confirm, confirmDialog] = useConfirm();
  const { data: projects } = useApi<Project[]>(wsApi("/projects"));
  const { data: monitors } = useApi<Monitor[]>(wsApi("/monitors"), { refreshInterval: 30000 });
  const [dialog, setDialog] = useState<{ open: boolean; project?: Project }>({ open: false });

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; byStatus: Record<MonitorStatus, number>; up: number; checks: number }>();
    for (const m of monitors ?? []) {
      const key = m.project?.id ?? "~none";
      if (!map.has(key)) map.set(key, { total: 0, byStatus: { up: 0, down: 0, pending: 0, paused: 0 }, up: 0, checks: 0 });
      const s = map.get(key)!;
      s.total++;
      s.byStatus[m.status]++;
      for (const b of m.bars) {
        s.checks += b.total;
        s.up += b.up;
      }
    }
    return map;
  }, [monitors]);

  const unassigned = stats.get("~none");

  return (
    <>
      <PageHeader
        title="Проекты"
        description="Клиенты, сайты, группы серверов — общая сущность для всех модулей системы"
        actions={
          <Button variant="primary" onClick={() => setDialog({ open: true })}>
            <Plus />
            Новый проект
          </Button>
        }
      />
      {!projects ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <Empty
            icon={<FolderKanban />}
            title="Проектов пока нет"
            description="Создайте проект под каждого клиента — так проще сортировать мониторы и видеть, у кого проблемы."
            action={
              <Button variant="primary" onClick={() => setDialog({ open: true })}>
                <Plus />
                Создать проект
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const s = stats.get(p.id);
            return (
              <Card key={p.id} className="group relative flex flex-col transition-colors hover:border-border-strong">
                <Link href={href(`/monitors?project=${p.id}`)} className="absolute inset-0 rounded-lg" aria-label={p.name} />
                <div className="flex items-start gap-3 p-4 pb-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
                    style={{ background: `color-mix(in srgb, ${COLORS[p.color]} 16%, transparent)`, color: COLORS[p.color] }}
                  >
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-[13px] text-fg-muted">{p.description || "Без описания"}</div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="sm-icon" className="relative z-10" aria-label="Действия">
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setDialog({ open: true, project: p })}>
                        <Pencil />
                        Изменить
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        danger
                        onSelect={async () => {
                          if (
                            await confirm({
                              title: `Удалить проект «${p.name}»?`,
                              description: "Мониторы останутся, но будут без проекта.",
                              confirmLabel: "Удалить",
                              danger: true,
                            })
                          ) {
                            await api(wsApi(`/projects/${p.id}`), { method: "DELETE" });
                            await revalidate(wsApi(""));
                            toast.success("Проект удалён");
                          }
                        }}
                      >
                        <Trash2 />
                        Удалить
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <div className="mt-auto flex items-center gap-3 border-t border-border px-4 py-3 text-[13px]">
                  {s ? (
                    <>
                      <span className="text-fg-muted">
                        {s.total} {plural(s.total, "монитор", "монитора", "мониторов")}
                      </span>
                      <span className="ml-auto flex items-center gap-2.5">
                        {(["down", "up", "paused"] as MonitorStatus[]).map((st) =>
                          s.byStatus[st] || (st === "up" && s.byStatus.pending) ? (
                            <span key={st} className="flex items-center gap-1 tabular" title={STATUS[st].label}>
                              <span className="size-1.5 rounded-full" style={{ background: STATUS[st].color }} />
                              {s.byStatus[st] + (st === "up" ? s.byStatus.pending : 0)}
                            </span>
                          ) : null,
                        )}
                        <span className="tabular" style={{ color: ratioColor(s.checks, s.up) }}>
                          {s.checks ? fmtPercent((s.up / s.checks) * 100) : "—"}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-fg-subtle">Нет мониторов</span>
                  )}
                </div>
              </Card>
            );
          })}
          {unassigned && (
            <Card className="relative flex flex-col border-dashed transition-colors hover:border-border-strong">
              <Link href={href("/monitors?project=none")} className="absolute inset-0 rounded-lg" aria-label="Без проекта" />
              <div className="flex items-start gap-3 p-4 pb-3">
                <ColorDot color="gray" className="mt-1" />
                <div>
                  <div className="text-sm font-medium">Без проекта</div>
                  <div className="text-[13px] text-fg-muted">Мониторы, не привязанные к проекту</div>
                </div>
              </div>
              <div className="mt-auto border-t border-dashed border-border px-4 py-3 text-[13px] text-fg-muted">
                {unassigned.total} {plural(unassigned.total, "монитор", "монитора", "мониторов")}
              </div>
            </Card>
          )}
        </div>
      )}
      <ProjectDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} project={dialog.project} />
      {confirmDialog}
    </>
  );
}

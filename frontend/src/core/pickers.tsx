"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorDot } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { api, ApiError, revalidate, useApi } from "@/lib/api";
import { COLOR_LIST, COLOR_NAMES, COLORS } from "@/lib/colors";
import { useWorkspace } from "@/lib/hooks";
import type { Color, Project, Tag } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ColorPicker({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_LIST.map((c) => (
        <button
          key={c}
          type="button"
          title={COLOR_NAMES[c]}
          onClick={() => onChange(c)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md border transition-colors focus-ring",
            value === c ? "border-border-strong bg-muted" : "border-transparent hover:bg-muted",
          )}
        >
          <span className="flex size-4 items-center justify-center rounded-full" style={{ background: COLORS[c] }}>
            {value === c && <Check className="size-3 text-white" strokeWidth={3} />}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Выбор проекта с возможностью тут же создать новый. */
export function ProjectSelect({
  value,
  onChange,
  allowNone = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const { api: wsApi } = useWorkspace();
  const { data: projects, mutate } = useApi<Project[]>(wsApi("/projects"));
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const p = await api<Project>(wsApi("/projects"), { method: "POST", body: { name, color: "blue" } });
      await mutate();
      onChange(p.id);
      setCreating(false);
      setName("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название проекта"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setCreating(false);
            }
          }}
        />
        <Button variant="primary" onClick={create} loading={loading} disabled={!name.trim()}>
          Создать
        </Button>
        <Button onClick={() => setCreating(false)}>Отмена</Button>
      </div>
    );
  }

  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => {
        if (v === "__new") setCreating(true);
        else onChange(v || null);
      }}
      options={[
        ...(allowNone ? [{ value: "", label: "Без проекта", icon: <ColorDot color="var(--border-strong)" className="size-2" /> }] : []),
        ...(projects ?? []).map((p) => ({ value: p.id, label: p.name, icon: <ColorDot color={p.color} className="size-2" /> })),
        { value: "__new", label: "Новый проект…", icon: <Plus className="text-fg-muted" />, separator: true },
      ]}
    />
  );
}

/** Теги-переключатели + быстрое создание. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { api: wsApi } = useWorkspace();
  const { data: tags, mutate } = useApi<Tag[]>(wsApi("/tags"));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  async function create() {
    const n = name.trim();
    if (!n) return;
    try {
      const color = COLOR_LIST[((tags?.length ?? 0) + 1) % COLOR_LIST.length];
      const t = await api<Tag>(wsApi("/tags"), { method: "POST", body: { name: n, color } });
      await mutate();
      void revalidate(wsApi("/monitors"));
      onChange([...value, t.id]);
      setName("");
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags?.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[13px] transition-colors focus-ring",
              on ? "border-border-strong bg-muted text-fg" : "border-border text-fg-muted hover:text-fg",
            )}
          >
            <span className="size-2 rounded-full" style={{ background: COLORS[t.color] }} />
            {t.name}
            {on && <Check className="size-3" />}
          </button>
        );
      })}
      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? void create() : setAdding(false))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="Новый тег"
          className="h-7 w-28 rounded-md border border-border-strong bg-surface px-2 text-[13px] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border-strong px-2 text-[13px] text-fg-muted hover:text-fg focus-ring"
        >
          <Plus className="size-3.5" />
          Тег
        </button>
      )}
    </div>
  );
}

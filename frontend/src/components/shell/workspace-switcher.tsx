"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { api, ApiError } from "@/lib/api";
import { useMe, useWorkspace } from "@/lib/hooks";
import type { Workspace } from "@/lib/types";

export function WorkspaceAvatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-fg/90 to-fg/60 text-[11px] font-semibold text-bg ${className}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { workspace, slug } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const ws = await api<Workspace>("/workspaces", { method: "POST", body: { name } });
      await mutate("/auth/me");
      setOpen(false);
      setName("");
      onNavigate?.();
      router.push(`/${ws.slug}`);
      toast.success(`Пространство «${ws.name}» создано`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-muted focus-ring">
            <WorkspaceAvatar name={workspace?.name ?? "?"} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{workspace?.name ?? "…"}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-[232px]">
          <MenuLabel>Пространства</MenuLabel>
          {me?.workspaces.map((w) => (
            <MenuItem
              key={w.id}
              onSelect={() => {
                onNavigate?.();
                router.push(`/${w.slug}`);
              }}
            >
              <WorkspaceAvatar name={w.name} className="size-5 text-[10px]" />
              <span className="truncate">{w.name}</span>
              {w.slug === slug && <Check className="ml-auto !text-fg" />}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => setOpen(true)}>
            <Plus />
            Новое пространство
          </MenuItem>
        </MenuContent>
      </Menu>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Новое пространство"
        description="Отдельный набор проектов, мониторов и настроек — например, для другой компании."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="primary" type="submit" form="ws-create" loading={loading} disabled={!name.trim()}>
              Создать
            </Button>
          </>
        }
      >
        <form id="ws-create" onSubmit={create}>
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Студия" maxLength={80} />
          </Field>
        </form>
      </Dialog>
    </>
  );
}

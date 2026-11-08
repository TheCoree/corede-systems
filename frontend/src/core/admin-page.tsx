"use client";

import { Check, MoreHorizontal, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX, Users, X } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Card, Empty, Segmented, Skeleton } from "@/components/ui/misc";
import { api, ApiError, useApi } from "@/lib/api";
import { fmtDate, timeAgo } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { AdminUser } from "@/lib/types";

type Filter = "pending" | "active" | "disabled" | "all";

const STATUS_BADGE: Record<AdminUser["status"], { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "amber" },
  active: { label: "Активен", color: "green" },
  rejected: { label: "Отклонён", color: "gray" },
  disabled: { label: "Отключён", color: "red" },
};

export function AdminPage() {
  const { data: me } = useMe();
  const [confirm, confirmDialog] = useConfirm();
  const { data: users, mutate: reload } = useApi<AdminUser[]>(me?.user.is_admin ? "/admin/users" : null, {
    refreshInterval: 30000,
  });
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<string | null>(null);

  if (me && !me.user.is_admin) {
    return <Empty title="Нет доступа" description="Раздел доступен только администраторам." />;
  }

  const counts = {
    pending: users?.filter((u) => u.status === "pending").length ?? 0,
    active: users?.filter((u) => u.status === "active").length ?? 0,
    disabled: users?.filter((u) => u.status === "disabled" || u.status === "rejected").length ?? 0,
    all: users?.length ?? 0,
  };
  const list = (users ?? []).filter((u) =>
    filter === "all" ? true : filter === "disabled" ? u.status === "disabled" || u.status === "rejected" : u.status === filter,
  );

  async function patch(u: AdminUser, body: Partial<Pick<AdminUser, "status" | "is_admin">>, msg: string) {
    setBusy(u.id);
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body });
      await Promise.all([reload(), mutate("/auth/me")]);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Администрирование"
        description="Заявки на доступ и пользователи системы"
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Заявки", count: counts.pending },
              { value: "active", label: "Активные", count: counts.active },
              { value: "disabled", label: "Отключённые", count: counts.disabled },
              { value: "all", label: "Все", count: counts.all },
            ]}
          />
        }
      />
      <Card className="overflow-hidden">
        {!users ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : list.length === 0 ? (
          <Empty
            icon={filter === "pending" ? <UserCheck /> : <Users />}
            title={filter === "pending" ? "Новых заявок нет" : "Пусто"}
            description={filter === "pending" ? "Когда кто-то запросит доступ, заявка появится здесь." : undefined}
          />
        ) : (
          list.map((u) => {
            const self = u.id === me?.user.id;
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
                <Avatar name={u.name} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{u.name}</span>
                    <Badge color={STATUS_BADGE[u.status].color} variant="soft">
                      {STATUS_BADGE[u.status].label}
                    </Badge>
                    {u.is_admin && <Badge color="purple" variant="soft">Админ</Badge>}
                    {self && <Badge>Вы</Badge>}
                  </div>
                  <div className="truncate text-[13px] text-fg-muted">
                    {u.email} · заявка {fmtDate(u.created_at)}
                    {u.last_login_at && ` · вход ${timeAgo(u.last_login_at)}`}
                  </div>
                  {u.note && <div className="mt-1 text-[13px] text-fg">«{u.note}»</div>}
                </div>
                <div className="flex items-center gap-2">
                  {u.status === "pending" && (
                    <>
                      <Button onClick={() => patch(u, { status: "rejected" }, "Заявка отклонена")} disabled={busy === u.id}>
                        <X />
                        Отклонить
                      </Button>
                      <Button variant="primary" onClick={() => patch(u, { status: "active" }, `${u.name} получил доступ`)} loading={busy === u.id}>
                        <Check />
                        Одобрить
                      </Button>
                    </>
                  )}
                  {(u.status === "disabled" || u.status === "rejected") && (
                    <Button onClick={() => patch(u, { status: "active" }, "Доступ открыт")} loading={busy === u.id}>
                      <UserCheck />
                      Открыть доступ
                    </Button>
                  )}
                  {!self && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Действия">
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        {u.status === "active" && (
                          <MenuItem onSelect={() => patch(u, { is_admin: !u.is_admin }, u.is_admin ? "Права администратора сняты" : "Назначен администратором")}>
                            {u.is_admin ? <ShieldOff /> : <ShieldCheck />}
                            {u.is_admin ? "Снять админа" : "Сделать админом"}
                          </MenuItem>
                        )}
                        {u.status === "active" && (
                          <MenuItem onSelect={() => patch(u, { status: "disabled" }, "Аккаунт отключён")}>
                            <UserX />
                            Отключить
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem
                          danger
                          onSelect={async () => {
                            if (
                              await confirm({
                                title: `Удалить ${u.name}?`,
                                description: "Личные пространства пользователя (где он единственный участник) будут удалены.",
                                confirmLabel: "Удалить",
                                danger: true,
                              })
                            ) {
                              await api(`/admin/users/${u.id}`, { method: "DELETE" });
                              await Promise.all([reload(), mutate("/auth/me")]);
                              toast.success("Пользователь удалён");
                            }
                          }}
                        >
                          <Trash2 />
                          Удалить
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>
      {confirmDialog}
    </>
  );
}

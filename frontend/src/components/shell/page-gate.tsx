"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Empty } from "@/components/ui/misc";
import { useMe } from "@/lib/hooks";

/** Проверки уровня страницы: API недоступен / нет доступа к пространству. */
export function PageGate({ children }: { children: ReactNode }) {
  const params = useParams<{ workspace?: string }>();
  const { data: me, error } = useMe();

  if (!me && error && (error as { status?: number }).status !== 401) {
    return <Empty title="Нет связи с сервером" description="API недоступен. Проверьте, что бэкенд запущен." />;
  }
  if (me && params?.workspace && !me.user.is_admin && !me.workspaces.some((w) => w.slug === params.workspace)) {
    return <Empty title="Пространство не найдено" description="Возможно, у вас нет к нему доступа." />;
  }
  return children;
}

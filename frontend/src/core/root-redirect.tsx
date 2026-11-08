"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageSkeleton } from "@/components/shell/app-page";
import { Empty } from "@/components/ui/misc";
import { lastWorkspace, useMe } from "@/lib/hooks";

export function RootRedirect() {
  const router = useRouter();
  const { data: me } = useMe();

  useEffect(() => {
    if (!me?.workspaces.length) return;
    const last = lastWorkspace();
    const target = me.workspaces.find((w) => w.slug === last) ?? me.workspaces[0];
    router.replace(`/${target.slug}`);
  }, [me, router]);

  if (me && !me.workspaces.length) {
    return <Empty title="Нет пространств" description="Создайте пространство через переключатель слева." />;
  }
  return <PageSkeleton />;
}

"use client";

import { toast } from "sonner";
import { api, ApiError, revalidate } from "@/lib/api";
import { fmtMs } from "@/lib/format";
import { useWorkspace } from "@/lib/hooks";
import type { Monitor } from "@/lib/types";
import { plural } from "@/lib/utils";

type CheckResult = { ok: boolean; latency_ms: number | null; status_code: number | null; error: string | null };

export function useMonitorActions() {
  const { api: wsApi } = useWorkspace();

  const refresh = () => revalidate(wsApi(""));

  async function run<T>(fn: () => Promise<T>, success?: string) {
    try {
      const r = await fn();
      if (success) toast.success(success);
      await refresh();
      return r;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ошибка");
      return undefined;
    }
  }

  return {
    refresh,
    checkNow: async (m: Monitor) => {
      const id = toast.loading(`Проверяем ${m.name}…`);
      try {
        const r = await api<CheckResult>(wsApi(`/monitors/${m.id}/check`), { method: "POST" });
        if (r.ok) toast.success(`${m.name}: работает · ${fmtMs(r.latency_ms)}`, { id });
        else toast.error(`${m.name}: ${r.error}`, { id });
        await refresh();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Ошибка", { id });
      }
    },
    setPaused: (m: Monitor, paused: boolean) =>
      run(
        () => api(wsApi(`/monitors/${m.id}`), { method: "PATCH", body: { paused } }),
        paused ? "Монитор на паузе" : "Мониторинг возобновлён",
      ),
    remove: (m: Monitor) => run(() => api(wsApi(`/monitors/${m.id}`), { method: "DELETE" }), "Монитор удалён"),
    bulk: (ids: string[], action: string, extra: Record<string, unknown> = {}) =>
      run(
        () => api<{ affected: number }>(wsApi("/monitors/bulk"), { method: "POST", body: { ids, action, ...extra } }),
        `Готово: ${ids.length} ${plural(ids.length, "монитор", "монитора", "мониторов")}`,
      ),
  };
}

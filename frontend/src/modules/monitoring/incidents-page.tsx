"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, Empty, Segmented, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/api";
import { useWorkspace } from "@/lib/hooks";
import type { Incident } from "@/lib/types";
import { IncidentRow } from "./components/incident-list";

export function IncidentsPage() {
  const { api: wsApi } = useWorkspace();
  const [state, setState] = useState<"all" | "open" | "resolved">("all");
  const { data } = useApi<Incident[]>(wsApi(`/incidents?state=${state}&limit=200`), {
    refreshInterval: 20000,
    keepPreviousData: true,
  });
  const open = data?.filter((i) => !i.resolved_at).length ?? 0;

  return (
    <>
      <PageHeader
        title="Инциденты"
        description={open ? `${open} продолжается прямо сейчас` : "Периоды недоступности мониторов"}
        actions={
          <Segmented
            value={state}
            onChange={setState}
            options={[
              { value: "all", label: "Все" },
              { value: "open", label: "Открытые" },
              { value: "resolved", label: "Решённые" },
            ]}
          />
        }
      />
      <Card className="overflow-hidden">
        {!data ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <Empty
            icon={<ShieldCheck />}
            title={state === "open" ? "Открытых инцидентов нет" : "Инцидентов пока нет"}
            description="Когда монитор упадёт, здесь появится запись с причиной и длительностью."
          />
        ) : (
          data.map((i) => <IncidentRow key={i.id} incident={i} />)
        )}
      </Card>
    </>
  );
}

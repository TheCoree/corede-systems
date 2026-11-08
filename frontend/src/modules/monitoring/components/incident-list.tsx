"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { duration, fmtDateTime, timeAgo } from "@/lib/format";
import { useNow, useWorkspace } from "@/lib/hooks";
import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IncidentRow({ incident: i, showMonitor = true }: { incident: Incident; showMonitor?: boolean }) {
  const { href } = useWorkspace();
  const now = useNow();
  const open = !i.resolved_at;
  const dur = open ? (now - new Date(i.started_at).getTime()) / 1000 : i.duration_seconds;
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        {open ? (
          <span className="relative flex size-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-danger opacity-50" />
            <span className="relative size-2.5 rounded-full bg-danger" />
          </span>
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showMonitor ? (
            <Link href={href(`/monitors/${i.monitor.id}`)} className="truncate text-sm font-medium hover:underline">
              {i.monitor.name}
            </Link>
          ) : (
            <span className="text-sm font-medium">{open ? "Продолжается" : "Решён"}</span>
          )}
          {showMonitor && i.monitor.project && (
            <Badge color={i.monitor.project.color} variant="soft">
              {i.monitor.project.name}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-fg-muted">{i.cause ?? "Причина неизвестна"}</p>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-[13px] font-medium tabular", open && "text-danger")}>{duration(dur)}</div>
        <div className="text-xs text-fg-subtle" title={fmtDateTime(i.started_at)}>
          {timeAgo(i.started_at, now)}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ratioColor } from "@/lib/colors";
import { fmtPercent, fmtTime } from "@/lib/format";
import type { Bar, DailyPoint } from "@/lib/types";
import { cn, plural } from "@/lib/utils";

/** Компактная полоса за 24 часа для строк списка. */
export function HourlyBars({ bars, className }: { bars: Bar[]; className?: string }) {
  return (
    <div className={cn("flex h-5 items-stretch gap-[2px]", className)} aria-label="Доступность за 24 часа">
      {bars.map((b) => (
        <span
          key={b.t}
          title={`${fmtTime(b.t)} — ${b.total ? fmtPercent((b.up / b.total) * 100) : "нет данных"}`}
          className="w-[3px] rounded-full"
          style={{ background: ratioColor(b.total, b.up) }}
        />
      ))}
    </div>
  );
}

const dayFmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", weekday: "short" });

/** 90 дней как на статус-страницах, с подсказкой при наведении. */
export function DailyBars({ days }: { days: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const d = hover != null ? days[hover] : null;
  return (
    <div className="relative">
      <div className="flex h-9 gap-[2px]" onMouseLeave={() => setHover(null)}>
        {days.map((day, i) => (
          <div
            key={day.date}
            onMouseEnter={() => setHover(i)}
            className="flex-1 rounded-[3px] transition-opacity duration-75"
            style={{ background: ratioColor(day.total, day.up), opacity: hover == null || hover === i ? 1 : 0.5 }}
          />
        ))}
      </div>
      {d && hover != null && (
        <div
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-pop"
          style={{ left: `clamp(60px, ${((hover + 0.5) / days.length) * 100}%, calc(100% - 60px))` }}
        >
          <div className="font-medium">{dayFmt.format(new Date(`${d.date}T12:00:00`))}</div>
          <div className="text-fg-muted">
            {d.total
              ? `${fmtPercent((d.up / d.total) * 100)} · ${d.total} ${plural(d.total, "проверка", "проверки", "проверок")}`
              : "Нет данных"}
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-between text-xs text-fg-subtle">
        <span>{days.length} дн. назад</span>
        <span>Сегодня</span>
      </div>
    </div>
  );
}

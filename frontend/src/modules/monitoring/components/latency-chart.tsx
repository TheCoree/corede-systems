"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { fmtDateTime, fmtDayShort, fmtMs, fmtPercent, fmtTime } from "@/lib/format";
import type { Series } from "@/lib/types";
import { plural } from "@/lib/utils";

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

const shortMs = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)} с` : `${Math.round(v)} мс`);

export function LatencyChart({ series, height = 220 }: { series: Series; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = series.points;
  const n = pts.length;
  const padL = 46;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const vals = pts.map((p) => p.avg).filter((v): v is number => v != null);
  const maxV = niceMax(Math.max(10, ...vals) * 1.1);
  const step = n > 1 ? innerW / (n - 1) : 0;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : i * step);
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;
  const bottom = padT + innerH;

  const segments: [number, number][][] = [];
  let cur: [number, number][] = [];
  pts.forEach((p, i) => {
    if (p.avg == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push([x(i), y(p.avg)]);
  });
  if (cur.length) segments.push(cur);

  const line = segments.map((s) => `M${s.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join("L")}`).join(" ");
  const area = segments
    .filter((s) => s.length > 1)
    .map((s) => `M${s[0][0]},${bottom}L${s.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join("L")}L${s[s.length - 1][0]},${bottom}Z`)
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * maxV);
  const xTicks = n > 1 ? [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(k * (n - 1))) : [0];
  const fmtX = series.range === "24h" ? fmtTime : fmtDayShort;
  const colW = Math.max(2, step || innerW);

  const h = hover != null ? pts[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block overflow-visible"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - rect.left - padL;
            if (n < 1) return;
            setHover(Math.max(0, Math.min(n - 1, Math.round(n > 1 ? mx / step : 0))));
          }}
        >
          <defs>
            <linearGradient id="lat-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--fg-subtle)] text-[11px] tabular">
                {shortMs(t)}
              </text>
            </g>
          ))}

          {/* периоды с неудачными проверками */}
          {pts.map((p, i) =>
            p.total > 0 && p.up < p.total ? (
              <g key={`f${p.t}`}>
                <rect
                  x={x(i) - colW / 2}
                  y={padT}
                  width={colW}
                  height={innerH}
                  fill="var(--danger)"
                  opacity={0.08 + 0.12 * (1 - p.up / p.total)}
                />
                <rect x={x(i) - colW / 2} y={bottom - 3} width={colW} height={3} fill="var(--danger)" />
              </g>
            ) : null,
          )}

          <path d={area} fill="url(#lat-fill)" />
          <path d={line} fill="none" stroke="var(--chart)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          {segments
            .filter((s) => s.length === 1)
            .map(([[a, b]]) => (
              <circle key={`${a}-${b}`} cx={a} cy={b} r={2.5} fill="var(--chart)" />
            ))}

          {xTicks.map((i, k) => (
            <text
              key={`${i}-${k}`}
              x={x(i)}
              y={height - 6}
              textAnchor={k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"}
              className="fill-[var(--fg-subtle)] text-[11px] tabular"
            >
              {pts[i] ? fmtX(pts[i].t) : ""}
            </text>
          ))}

          {h && hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={bottom} stroke="var(--border-strong)" />
              {h.avg != null && <circle cx={x(hover)} cy={y(h.avg)} r={3.5} fill="var(--surface)" stroke="var(--chart)" strokeWidth={2} />}
            </g>
          )}
        </svg>
      )}
      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-pop"
          style={{
            left: x(hover),
            transform: `translateX(${x(hover) > width / 2 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <div className="mb-1 font-medium">{fmtDateTime(h.t)}</div>
          {h.total ? (
            <div className="space-y-0.5 text-fg-muted tabular">
              <div className="flex justify-between gap-6">
                <span>Средний</span>
                <span className="text-fg">{fmtMs(h.avg)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span>Максимум</span>
                <span className="text-fg">{fmtMs(h.max)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span>Доступность</span>
                <span style={{ color: h.up < h.total ? "var(--danger)" : undefined }} className={h.up < h.total ? "" : "text-fg"}>
                  {fmtPercent((h.up / h.total) * 100)}
                </span>
              </div>
              <div className="pt-0.5 text-fg-subtle">
                {h.total} {plural(h.total, "проверка", "проверки", "проверок")}
              </div>
            </div>
          ) : (
            <div className="text-fg-muted">Нет данных</div>
          )}
        </div>
      )}
    </div>
  );
}

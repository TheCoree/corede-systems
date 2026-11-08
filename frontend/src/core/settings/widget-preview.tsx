"use client";

import { useTheme } from "next-themes";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Segmented } from "@/components/ui/misc";
import { useNow } from "@/lib/hooks";
import type { Monitor, MonitorStatus, Summary } from "@/lib/types";
import { plural } from "@/lib/utils";

/** Предпросмотр iOS-виджета (повторяет раскладку скрипта Scriptable). */

type Appearance = "light" | "dark";
type Family = "small" | "medium" | "large" | "extraLarge" | "lock";

const IOS: Record<Appearance, Record<string, string>> = {
  light: {
    bg: "#FFFFFF",
    fg: "#000000",
    sec: "rgba(60,60,67,.6)",
    ter: "rgba(60,60,67,.3)",
    up: "#34C759",
    down: "#FF3B30",
    pending: "#FF9500",
    paused: "#8E8E93",
    wall: "linear-gradient(160deg,#c9d6ff 0%,#e2c9f5 55%,#f8d9e6 100%)",
  },
  dark: {
    bg: "#1C1C1E",
    fg: "#FFFFFF",
    sec: "rgba(235,235,245,.6)",
    ter: "rgba(235,235,245,.3)",
    up: "#30D158",
    down: "#FF453A",
    pending: "#FF9F0A",
    paused: "#8E8E93",
    wall: "linear-gradient(160deg,#1d1b33 0%,#35295a 55%,#4b2a4f 100%)",
  },
};

const FONT: CSSProperties = {
  fontFamily: 'ui-rounded, "SF Pro Rounded", "SF Pro Display", -apple-system, system-ui, sans-serif',
};
const MONO: CSSProperties = { fontFamily: 'ui-monospace, "SF Mono", var(--font-mono), monospace' };

type WM = {
  id: string;
  name: string;
  status: MonitorStatus;
  latency: number | null;
  since: string | null;
  error: string | null;
  project: string | null;
  bars: (number | null)[];
};

const ORDER: Record<MonitorStatus, number> = { down: 0, pending: 1, up: 2, paused: 3 };

function toWidget(monitors: Monitor[]): WM[] {
  return [...monitors]
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "ru"))
    .map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      latency: m.last_latency_ms,
      since: m.status === "down" ? (m.fail_since ?? m.last_change_at) : null,
      error: m.status === "down" ? m.last_error : null,
      project: m.project?.name ?? null,
      bars: m.bars.map((b) => (b.total ? b.up / b.total : null)),
    }));
}

const pct = (v: number | null | undefined) =>
  v == null ? "—" : v >= 100 ? "100%" : `${v.toFixed(2).replace(".", ",")}%`;
const ms = (v: number | null) =>
  v == null ? "—" : v < 1000 ? `${Math.round(v)} мс` : `${(v / 1000).toFixed(1).replace(".", ",")} с`;

function useTimer(since: string | null) {
  const now = useNow(1000);
  if (!since) return "";
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

function Timer({ since, color, size }: { since: string | null; color: string; size: number }) {
  const t = useTimer(since);
  return (
    <span style={{ ...MONO, color, fontSize: size, fontWeight: 500 }} className="tabular">
      {t}
    </span>
  );
}

// ---------- примитивы ----------

function Ring({
  ratio,
  color,
  track,
  size,
  width,
  children,
}: {
  ratio: number;
  color: string;
  track: string;
  size: number;
  width: number;
  children?: ReactNode;
}) {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={width} />
        {ratio > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={`${c * Math.min(1, ratio)} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function Check({ size, color, stroke = 3 }: { size: number; color: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function StatusIcon({ status, size, p }: { status: MonitorStatus; size: number; p: Record<string, string> }) {
  const color = p[status] ?? p.paused;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill={color} />
      {status === "up" && <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
      {status === "down" && (
        <>
          <rect x="10.7" y="5.8" width="2.6" height="8" rx="1.3" fill="#fff" />
          <circle cx="12" cy="17.4" r="1.5" fill="#fff" />
        </>
      )}
      {status === "paused" && (
        <>
          <rect x="8.3" y="7" width="2.6" height="10" rx="1" fill="#fff" />
          <rect x="13.1" y="7" width="2.6" height="10" rx="1" fill="#fff" />
        </>
      )}
      {status === "pending" && <path d="M12 7v5l3 2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

function Bars({ values, w, h }: { values: (number | null)[]; w: number; h: number }) {
  const list = values.length ? values : Array.from({ length: 24 }, () => null);
  const gap = 1.5;
  const bw = (w - gap * (list.length - 1)) / list.length;
  return (
    <svg width={w} height={h} className="shrink-0">
      {list.map((v, i) => (
        <rect
          key={i}
          x={i * (bw + gap)}
          y={0}
          width={bw}
          height={h}
          rx={Math.min(bw / 2, 2)}
          fill={v == null ? "rgba(142,142,147,.22)" : v >= 0.999 ? "#30D158" : v >= 0.95 ? "#FF9F0A" : "#FF453A"}
        />
      ))}
    </svg>
  );
}

function ServerGlyph({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="7.5" rx="2.2" />
      <rect x="3" y="13.5" width="18" height="7.5" rx="2.2" />
      <path d="M7 6.8h.01M7 17.3h.01" />
    </svg>
  );
}

// ---------- модель ----------

type Model = {
  title: string;
  list: WM[];
  down: number;
  paused: number;
  active: number;
  ratio: number;
  uptime: number | null;
  firstDown?: WM;
};

function headline(m: Model) {
  if (m.down) return `${m.down} ${plural(m.down, "недоступен", "недоступны", "недоступно")}`;
  return m.active ? "Всё работает" : "Нет мониторов";
}

function Shell({
  w,
  h,
  p,
  children,
  pad = 14,
}: {
  w: number;
  h: number;
  p: Record<string, string>;
  children: ReactNode;
  pad?: number;
}) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden"
      style={{
        ...FONT,
        width: w,
        height: h,
        padding: pad,
        borderRadius: 24,
        background: p.bg,
        color: p.fg,
        boxShadow: "0 8px 28px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.08)",
      }}
    >
      {children}
    </div>
  );
}

function Header({ m, p }: { m: Model; p: Record<string, string> }) {
  return (
    <div className="flex items-center gap-[5px]" style={{ color: p.sec, fontSize: 12, fontWeight: 600 }}>
      <ServerGlyph color={p.sec} />
      <span className="truncate">{m.title}</span>
    </div>
  );
}

function RingBadge({ m, p, size, width }: { m: Model; p: Record<string, string>; size: number; width: number }) {
  return (
    <Ring ratio={m.ratio} color={m.down ? p.down : p.up} track="rgba(142,142,147,.25)" size={size} width={width}>
      {m.down ? (
        <span style={{ color: p.down, fontSize: Math.round(size * 0.4), fontWeight: 800, lineHeight: 1 }}>{m.down}</span>
      ) : (
        <Check size={Math.round(size * 0.42)} color={p.up} />
      )}
    </Ring>
  );
}

function Row({
  wm,
  p,
  font,
  icon,
  subtitle,
  bars,
}: {
  wm: WM;
  p: Record<string, string>;
  font: number;
  icon: number;
  subtitle?: boolean;
  bars?: [number, number];
}) {
  const sub = subtitle ? (wm.status === "down" && wm.error ? wm.error : wm.project) : null;
  return (
    <div className="flex items-center" style={{ gap: 7 }}>
      <StatusIcon status={wm.status} size={icon} p={p} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate" style={{ fontSize: font, fontWeight: 500 }}>
          {wm.name}
        </div>
        {sub && (
          <div className="truncate" style={{ fontSize: font - 2.5, color: wm.status === "down" ? p.down : p.sec }}>
            {sub}
          </div>
        )}
      </div>
      {bars && <Bars values={wm.bars} w={bars[0]} h={bars[1]} />}
      <div className="shrink-0 text-right" style={{ width: 58 }}>
        {wm.status === "down" ? (
          <Timer since={wm.since} color={p.down} size={font - 2} />
        ) : (
          <span style={{ ...MONO, fontSize: font - 2, color: p.sec, fontWeight: 500 }} className="tabular">
            {wm.status === "paused" ? "пауза" : ms(wm.latency)}
          </span>
        )}
      </div>
    </div>
  );
}

function Updated({ p }: { p: Record<string, string> }) {
  const t = new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return <span style={{ fontSize: 11, color: p.ter }}>обновлено {t}</span>;
}

// ---------- размеры ----------

function Small({ m, p }: { m: Model; p: Record<string, string> }) {
  return (
    <Shell w={170} h={170} p={p}>
      <Header m={m} p={p} />
      <div className="flex-1" />
      <RingBadge m={m} p={p} size={52} width={6} />
      <div style={{ height: 10 }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: m.down ? p.down : p.up, lineHeight: 1.15 }} className="truncate">
        {headline(m)}
      </div>
      {m.firstDown ? (
        <>
          <div className="truncate" style={{ fontSize: 12, fontWeight: 500 }}>
            {m.firstDown.name}
          </div>
          <Timer since={m.firstDown.since} color={p.down} size={11} />
        </>
      ) : (
        <div style={{ fontSize: 12, color: p.sec }}>uptime 24 ч {pct(m.uptime)}</div>
      )}
    </Shell>
  );
}

function Medium({ m, p }: { m: Model; p: Record<string, string> }) {
  const max = 4;
  return (
    <Shell w={364} h={170} p={p}>
      <Header m={m} p={p} />
      <div className="mt-[10px] flex min-h-0 flex-1 gap-3">
        <div className="flex w-[116px] shrink-0 flex-col">
          <RingBadge m={m} p={p} size={46} width={5.5} />
          <div style={{ height: 8 }} />
          <div className="truncate" style={{ fontSize: 14, fontWeight: 700, color: m.down ? p.down : p.up }}>
            {headline(m)}
          </div>
          <div style={{ fontSize: 11, color: p.sec }}>uptime {pct(m.uptime)}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
          {m.list.slice(0, max).map((wm) => (
            <Row key={wm.id} wm={wm} p={p} font={13} icon={13} />
          ))}
          {m.list.length > max && <span style={{ fontSize: 11, color: p.ter }}>ещё {m.list.length - max}</span>}
          {!m.list.length && <span style={{ fontSize: 12, color: p.sec }}>Мониторов нет</span>}
        </div>
      </div>
    </Shell>
  );
}

function Hero({ m, p, ring, size }: { m: Model; p: Record<string, string>; ring: number; size: number }) {
  return (
    <div className="flex items-center" style={{ gap: 14 }}>
      <RingBadge m={m} p={p} size={ring} width={7} />
      <div className="min-w-0 leading-tight">
        <div style={{ fontSize: size, fontWeight: 700, color: m.down ? p.down : p.up }}>{headline(m)}</div>
        <div className="truncate" style={{ fontSize: size - 3, fontWeight: m.firstDown ? 500 : 400, color: m.firstDown ? p.fg : p.sec, marginTop: 2 }}>
          {m.firstDown
            ? m.firstDown.name
            : [`${m.active} ${plural(m.active, "монитор", "монитора", "мониторов")}`, m.paused ? `${m.paused} на паузе` : null]
                .filter(Boolean)
                .join(" · ")}
        </div>
        <div style={{ fontSize: size - 4, color: p.sec }}>uptime 24 ч {pct(m.uptime)}</div>
      </div>
    </div>
  );
}

function Large({ m, p }: { m: Model; p: Record<string, string> }) {
  const max = 6;
  return (
    <Shell w={364} h={382} p={p} pad={16}>
      <Header m={m} p={p} />
      <div style={{ height: 12 }} />
      <Hero m={m} p={p} ring={56} size={17} />
      <div className="flex flex-col" style={{ gap: 8, marginTop: 14 }}>
        {m.list.slice(0, max).map((wm) => (
          <Row key={wm.id} wm={wm} p={p} font={14} icon={15} subtitle bars={[64, 14]} />
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex items-center justify-between">
        <Updated p={p} />
        {m.list.length > max && <span style={{ fontSize: 11, color: p.ter }}>ещё {m.list.length - max}</span>}
      </div>
    </Shell>
  );
}

function ExtraLarge({ m, p }: { m: Model; p: Record<string, string> }) {
  const per = 6;
  return (
    <Shell w={720} h={382} p={p} pad={16}>
      <Header m={m} p={p} />
      <div style={{ height: 12 }} />
      <Hero m={m} p={p} ring={62} size={19} />
      <div className="grid grid-cols-2" style={{ columnGap: 22, marginTop: 14 }}>
        {[0, 1].map((c) => (
          <div key={c} className="flex min-w-0 flex-col" style={{ gap: 9 }}>
            {m.list.slice(c * per, (c + 1) * per).map((wm) => (
              <Row key={wm.id} wm={wm} p={p} font={14} icon={15} subtitle bars={[96, 16]} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex items-center justify-between">
        <Updated p={p} />
        {m.list.length > per * 2 && <span style={{ fontSize: 11, color: p.ter }}>ещё {m.list.length - per * 2}</span>}
      </div>
    </Shell>
  );
}

function LockScreen({ m }: { m: Model }) {
  const now = useNow(30000);
  const time = new Date(now).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const raw = new Date(now).toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" });
  const date = raw.charAt(0).toUpperCase() + raw.slice(1); // как в iOS: «Суббота, 7 ноября»
  const glass = "rgba(255,255,255,.16)";
  const downs = m.list.filter((x) => x.status === "down").slice(0, 2);
  return (
    <div
      className="flex w-[364px] max-w-full flex-col items-center overflow-hidden px-6 pb-8 pt-7 text-white"
      style={{ ...FONT, borderRadius: 36, background: "linear-gradient(170deg,#1b2a4a 0%,#3b2d63 50%,#7a3f63 100%)" }}
    >
      {/* строка — над часами */}
      <div className="flex items-center gap-1 text-[15px] font-semibold opacity-90">
        {m.down ? "⚠︎" : "✓"}{" "}
        {m.down
          ? `${headline(m)}${m.firstDown ? ` · ${m.firstDown.name}` : ""}`
          : `${m.active} ${plural(m.active, "работает", "работают", "работают")} · ${pct(m.uptime)}`}
      </div>
      <div className="mt-0.5 text-[13px] opacity-80">{date}</div>
      <div className="text-[84px] font-semibold leading-none tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>
        {time}
      </div>
      <div className="mt-5 flex w-full items-stretch gap-3">
        {/* круг */}
        <div className="flex size-[76px] shrink-0 items-center justify-center rounded-full" style={{ background: glass }}>
          <Ring ratio={m.ratio} color="#fff" track="rgba(255,255,255,.25)" size={60} width={5}>
            {m.down ? (
              <span className="text-[24px] font-extrabold leading-none">{m.down}</span>
            ) : (
              <Check size={24} color="#fff" />
            )}
          </Ring>
        </div>
        {/* прямоугольник */}
        <div className="flex min-w-0 flex-1 flex-col justify-center rounded-[18px] px-3 py-2" style={{ background: glass }}>
          <div className="flex items-center gap-1 text-[15px] font-bold leading-tight">
            {m.down ? "⚠︎" : <Check size={14} color="#fff" />}
            <span className="truncate">{headline(m)}</span>
          </div>
          {downs.length ? (
            downs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-[13px] leading-tight">
                <span className="truncate font-medium">{d.name}</span>
                <Timer since={d.since} color="#fff" size={12} />
              </div>
            ))
          ) : (
            <>
              <div className="text-[13px] font-medium leading-tight">
                {m.active} {plural(m.active, "монитор", "монитора", "мониторов")}
              </div>
              <div className="text-[12px] leading-tight opacity-90">uptime 24 ч {pct(m.uptime)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- обёртка ----------

const FAMILIES: { value: Family; label: string }[] = [
  { value: "small", label: "Малый" },
  { value: "medium", label: "Средний" },
  { value: "large", label: "Большой" },
  { value: "extraLarge", label: "iPad" },
  { value: "lock", label: "Экран блокировки" },
];

export function WidgetPreview({ summary, monitors, title }: { summary?: Summary; monitors: Monitor[]; title: string }) {
  const { resolvedTheme } = useTheme();
  const [family, setFamily] = useState<Family>("medium");
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const look: Appearance = appearance ?? (resolvedTheme === "light" ? "light" : "dark");
  const p = IOS[look];

  const list = toWidget(monitors);
  const down = list.filter((x) => x.status === "down").length;
  const paused = list.filter((x) => x.status === "paused").length;
  const active = list.length - paused;
  const model: Model = {
    title,
    list,
    down,
    paused,
    active,
    ratio: active ? (active - down) / active : 1,
    uptime: summary?.uptime_24h ?? null,
    firstDown: list.find((x) => x.status === "down"),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={family} onChange={setFamily} options={FAMILIES} />
        {family !== "lock" && (
          <Segmented
            value={look}
            onChange={(v) => setAppearance(v)}
            options={[
              { value: "light", label: "Светлая" },
              { value: "dark", label: "Тёмная" },
            ]}
          />
        )}
      </div>
      <div
        className="flex min-h-[300px] items-center justify-center overflow-x-auto rounded-xl p-8"
        style={{ background: family === "lock" ? "var(--muted)" : p.wall }}
      >
        {family === "small" && <Small m={model} p={p} />}
        {family === "medium" && <Medium m={model} p={p} />}
        {family === "large" && <Large m={model} p={p} />}
        {family === "extraLarge" && <ExtraLarge m={model} p={p} />}
        {family === "lock" && <LockScreen m={model} />}
      </div>
    </div>
  );
}

const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto", style: "short" });

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 10) return "только что";
  // trunc, а не round — чтобы совпадало с duration() («2 мин» и «2 мин назад»)
  if (abs < 60) return rtf.format(Math.trunc(diff), "second");
  if (abs < 3600) return rtf.format(Math.trunc(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.trunc(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.trunc(diff / 86400), "day");
  return fmtDate(iso);
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return h ? `${d} д ${h} ч` : `${d} д`;
  if (h) return m ? `${h} ч ${m} мин` : `${h} ч`;
  if (m) return `${m} мин`;
  return `${s} сек`;
}

export function since(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  return duration((now - new Date(iso).getTime()) / 1000);
}

export function fmtPercent(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  if (v >= 100) return "100%";
  return `${v.toFixed(digits)}%`;
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 1000) return `${Math.round(v)} мс`;
  return `${(v / 1000).toFixed(2)} с`;
}

const dtf = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const df = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", year: "numeric" });
const tf = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" });
const dshort = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });

export const fmtDateTime = (iso: string) => dtf.format(new Date(iso));
export const fmtDate = (iso: string) => df.format(new Date(iso));
export const fmtTime = (iso: string) => tf.format(new Date(iso));
export const fmtDayShort = (iso: string) => dshort.format(new Date(iso));

export function intervalLabel(sec: number): string {
  if (sec < 60) return `${sec} сек`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ч`;
  return `${Math.round(sec / 86400)} д`;
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.floor((new Date(iso).getTime() - now) / 86400000);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

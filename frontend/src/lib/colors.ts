import type { Color, MonitorStatus } from "./types";

export const COLORS: Record<Color, string> = {
  gray: "#8f8f8f",
  blue: "#3b82f6",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
  teal: "#14b8a6",
};

export const COLOR_NAMES: Record<Color, string> = {
  gray: "Серый",
  blue: "Синий",
  green: "Зелёный",
  amber: "Янтарный",
  red: "Красный",
  purple: "Фиолетовый",
  pink: "Розовый",
  teal: "Бирюзовый",
};

export const COLOR_LIST = Object.keys(COLORS) as Color[];

export const STATUS: Record<MonitorStatus, { label: string; color: string; short: string }> = {
  up: { label: "Работает", short: "Up", color: "var(--success)" },
  down: { label: "Недоступен", short: "Down", color: "var(--danger)" },
  pending: { label: "Проверяется", short: "Pending", color: "var(--warning)" },
  paused: { label: "На паузе", short: "Paused", color: "var(--fg-subtle)" },
};

export const STATUS_ORDER: Record<MonitorStatus, number> = { down: 0, pending: 1, up: 2, paused: 3 };

/** Цвет доли успешных проверок: зелёный / жёлтый / красный / пусто. */
export function ratioColor(total: number, up: number): string {
  if (!total) return "var(--muted-strong)";
  const r = up / total;
  if (r >= 0.999) return "var(--success)";
  if (r >= 0.95) return "var(--warning)";
  return "var(--danger)";
}

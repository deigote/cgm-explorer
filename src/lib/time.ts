import type { DateOrder } from "../types";
export const MINUTE = 60000;
export const DAY = 24 * 60 * MINUTE;
// A wall-clock coordinate, NOT a UTC instant. UTC getters/formatting are used
// consistently to preserve device clock fields in every browser timezone.
export function parseTimestamp(
  input: string,
  order: DateOrder = "DMY",
): number | null {
  const text = input.trim();
  let y: number, m: number, d: number, h: number, mi: number, s: number;
  const iso = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i,
  );
  const local = text.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
  );
  if (iso) [, y, m, d, h, mi, s] = iso.map(Number);
  else if (local) {
    y = +local[3];
    m = +local[order === "MDY" ? 1 : 2];
    d = +local[order === "MDY" ? 2 : 1];
    h = +local[4];
    mi = +local[5];
    s = +(local[6] || 0);
    if (local[7]) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (local[7].toUpperCase() === "PM" ? 12 : 0);
    }
  } else return null;
  s ||= 0;
  if (
    y < 1900 ||
    y > 2200 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    return null;
  const t = Date.UTC(y, m - 1, d, h, mi, s),
    check = new Date(t);
  return check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
    ? t
    : null;
}
export const dayStart = (t: number) => Math.floor(t / DAY) * DAY;
export const dateKey = (t: number) => new Date(t).toISOString().slice(0, 10);
export const timeLabel = (t: number) => new Date(t).toISOString().slice(11, 16);
export const minuteOfDay = (t: number) => (t - dayStart(t)) / MINUTE;
export const dateLabel = (t: number, year = false) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
  }).format(t);
export const stampLabel = (t: number) =>
  `${dateLabel(t, true)} · ${timeLabel(t)}`;
export function dayKeys(start: number, end: number): string[] {
  const keys: string[] = [];
  for (let t = dayStart(start); t < end; t += DAY) keys.push(dateKey(t));
  return keys;
}
export const dateBoundary = (key: string) =>
  parseTimestamp(`${key}T00:00`) ?? 0;

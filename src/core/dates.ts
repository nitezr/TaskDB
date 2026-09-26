/**
 * Due dates are strings: "YYYY-MM-DD" for all-day, or a local ISO timestamp
 * with offset ("2026-09-27T17:00:00+05:30") when a time is set. Notion accepts both.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function hasTime(due: string): boolean {
  return due.length > 10;
}

/** Parses a due string into a local Date (midnight for all-day). */
export function parseDue(due: string): Date {
  if (!hasTime(due)) {
    const [y, m, d] = due.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  }
  return new Date(due);
}

/** Local calendar day of a due string. */
export function dueDay(due: string): string {
  return hasTime(due) ? toDateStr(new Date(due)) : due;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Formats `d` the same way as `like`: all-day stays all-day, timed keeps the time. */
export function formatDue(d: Date, timed: boolean): string {
  return timed ? toLocalIso(d) : toDateStr(d);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short human label: "Today", "Tomorrow", "Fri", "3 Oct", plus time if set. */
export function dueLabel(due: string, now: Date = new Date()): string {
  const d = parseDue(due);
  const today = startOfDay(now);
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  let label: string;
  if (diff === 0) label = "Today";
  else if (diff === 1) label = "Tomorrow";
  else if (diff === -1) label = "Yesterday";
  else if (diff > 1 && diff < 7) label = DAY_NAMES[d.getDay()]!;
  else label = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  if (hasTime(due)) {
    const h = d.getHours();
    const m = d.getMinutes();
    label += ` ${h % 12 || 12}${m ? `:${pad(m)}` : ""}${h < 12 ? "am" : "pm"}`;
  }
  return label;
}

export function dayHeading(day: string, now: Date = new Date()): string {
  const d = parseDue(day);
  const base = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} · ${DAY_NAMES[d.getDay()]}`;
  const rel = dueLabel(day, now);
  return rel === "Today" || rel === "Tomorrow" ? `${base} · ${rel}` : base;
}

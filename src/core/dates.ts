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

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Short human label: "Today", "Tomorrow", "Friday", "3 Oct", plus a time if set.
 * Midnight counts as no time (Remit): "12:00 AM" on a date-only task is noise.
 */
export function dueLabel(due: string, now: Date = new Date()): string {
  const d = parseDue(due);
  const today = startOfDay(now);
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  let label: string;
  if (diff === 0) label = "Today";
  else if (diff === 1) label = "Tomorrow";
  else if (diff === -1) label = "Yesterday";
  else if (diff > 1 && diff < 7) label = FULL_DAYS[d.getDay()]!;
  else label = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  if (hasTime(due) && (d.getHours() || d.getMinutes())) {
    const h = d.getHours();
    label += ` ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
  }
  return label;
}

export function dayHeading(day: string, now: Date = new Date()): string {
  const d = parseDue(day);
  const rel = dueLabel(day, now);
  // "29 Sep · Today", "1 Oct · Thursday": the relative word replaces the weekday.
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} · ${rel === "Today" || rel === "Tomorrow" ? rel : FULL_DAYS[d.getDay()]}`;
}

/** 45 → "45m", 90 → "1h 30m", 120 → "2h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/**
 * Things-style deadline countdown: "5 days left", "Due today", "2d ago".
 * `tone` is "late" once due or overdue, "soon" within two days.
 */
export function deadlineLabel(deadline: string, now: Date = new Date()): { text: string; tone: "late" | "soon" | "" } {
  const diff = Math.round((startOfDay(parseDue(deadline)).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diff < 0) return { text: `${-diff}d ago`, tone: "late" };
  if (diff === 0) return { text: "Due today", tone: "late" };
  if (diff <= 14) return { text: `${diff} day${diff === 1 ? "" : "s"} left`, tone: diff <= 2 ? "soon" : "" };
  const d = parseDue(deadline);
  return { text: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`, tone: "" };
}

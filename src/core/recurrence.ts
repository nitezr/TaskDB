import { addDays, addMonths, formatDue, hasTime, parseDue, startOfDay, toDateStr } from "./dates";

/**
 * Supported rules (stored in Notion as text, normalised), following Todoist's syntax:
 *   every day | every 3 days | every week | every 2 weeks | every month | every year
 *   every weekday | every mon,wed,fri
 *   every 15th | every last day                   (day of the month)
 *   every 1st mon | every 3rd fri | every last fri (nth weekday of the month)
 *   every jan 15                                  (a date each year)
 * Modifiers:
 *   every! 3 days      counts from when you complete it, not from the due date
 *   ... until 31 Dec 2026   stops repeating after that date (also "ending")
 */
export type Pattern =
  | { unit: "day" | "week" | "month" | "year"; n: number }
  | { unit: "weekday" }
  | { unit: "days"; days: number[] }
  | { unit: "monthDay"; day: number } // -1 = last day
  | { unit: "nthWeekday"; nth: number; dow: number } // nth -1 = last
  | { unit: "yearDate"; month: number; day: number };

export type Rule = Pattern & { fromCompletion?: boolean; until?: string };

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DOW_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NTH: Record<string, number> = { "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4, last: -1 };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "2026-12-31", "dec 31", "31 dec 2026" → "2026-12-31". Years default to the next occurrence. */
function parseEndDate(s: string, now = new Date()): string | null {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/) ?? null;
  let month: number | undefined;
  let day: number | undefined;
  let year: number | undefined;
  if (m && m[1]! in MONTHS) [month, day, year] = [MONTHS[m[1]!], Number(m[2]), m[3] ? Number(m[3]) : undefined];
  else {
    m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:,?\s+(\d{4}))?$/);
    if (m && m[2]! in MONTHS) [month, day, year] = [MONTHS[m[2]!], Number(m[1]), m[3] ? Number(m[3]) : undefined];
  }
  if (month === undefined || !day) return null;
  let d = new Date(year ?? now.getFullYear(), month, day);
  if (year === undefined && d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, day);
  return toDateStr(d);
}

function parsePattern(s: string): Pattern | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(?:(\d+)\s+)?(day|week|month|year)s?$/))) return { unit: m[2] as "day", n: Number(m[1] ?? 1) };
  if (s === "daily") return { unit: "day", n: 1 };
  if (s === "weekly") return { unit: "week", n: 1 };
  if (s === "monthly") return { unit: "month", n: 1 };
  if (s === "yearly" || s === "annually") return { unit: "year", n: 1 };
  if (s === "weekday" || s === "workday") return { unit: "weekday" };
  if (s === "other day") return { unit: "day", n: 2 };
  if (s === "other week") return { unit: "week", n: 2 };
  if (s === "other month") return { unit: "month", n: 2 };
  if (s === "last day" || s === "last day of the month") return { unit: "monthDay", day: -1 };
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)(?: day)?$/)) && Number(m[1]) >= 1 && Number(m[1]) <= 31) return { unit: "monthDay", day: Number(m[1]) };
  if ((m = s.match(/^(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)$/)) && m[2]! in DOW) return { unit: "nthWeekday", nth: NTH[m[1]!]!, dow: DOW[m[2]!]! };
  if ((m = s.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/)) && m[1]! in MONTHS) return { unit: "yearDate", month: MONTHS[m[1]!]!, day: Number(m[2]) };
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/)) && m[2]! in MONTHS) return { unit: "yearDate", month: MONTHS[m[2]!]!, day: Number(m[1]) };
  const parts = s.split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
  if (parts.length && parts.every((p) => p in DOW)) return { unit: "days", days: [...new Set(parts.map((p) => DOW[p]!))].sort() };
  return null;
}

export function parseRule(text: string): Rule | null {
  let s = text.trim().toLowerCase().replace(/\s+/g, " ");
  const fromCompletion = /^every!/.test(s) || /^after\b/.test(s);
  s = s.replace(/^every!?\s*/, "").replace(/^after\s+/, "");
  let until: string | undefined;
  const cut = s.match(/\s+(?:until|ending|ending on|end)\s+(.+)$/);
  if (cut) {
    const d = parseEndDate(cut[1]!);
    if (!d) return null;
    until = d;
    s = s.slice(0, cut.index);
  }
  const pattern = parsePattern(s);
  if (!pattern) return null;
  return { ...pattern, ...(fromCompletion ? { fromCompletion } : {}), ...(until ? { until } : {}) };
}

export function formatRule(rule: Rule): string {
  const every = rule.fromCompletion ? "every!" : "every";
  let body: string;
  switch (rule.unit) {
    case "weekday":
      body = "weekday";
      break;
    case "days":
      body = rule.days.map((d) => DOW_SHORT[d]).join(",");
      break;
    case "monthDay":
      body = rule.day === -1 ? "last day" : ordinal(rule.day);
      break;
    case "nthWeekday":
      body = `${rule.nth === -1 ? "last" : ordinal(rule.nth)} ${DOW_SHORT[rule.dow]}`;
      break;
    case "yearDate":
      body = `${MONTH_SHORT[rule.month]} ${rule.day}`;
      break;
    default:
      body = rule.n === 1 ? rule.unit : `${rule.n} ${rule.unit}s`;
  }
  if (rule.until) {
    const d = parseDue(rule.until);
    body += ` until ${d.getDate()} ${MONTH_SHORT[d.getMonth()]![0]!.toUpperCase()}${MONTH_SHORT[d.getMonth()]!.slice(1)} ${d.getFullYear()}`;
  }
  return `${every} ${body}`;
}

const lastOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Whether `d` is a date the pattern lands on (for patterns defined by the calendar). */
export function matches(p: Pattern, d: Date): boolean {
  switch (p.unit) {
    case "weekday":
      return d.getDay() !== 0 && d.getDay() !== 6;
    case "days":
      return p.days.includes(d.getDay());
    case "monthDay":
      // "every 31st" lands on the last day of shorter months.
      return p.day === -1 ? d.getDate() === lastOfMonth(d) : d.getDate() === Math.min(p.day, lastOfMonth(d));
    case "nthWeekday":
      if (d.getDay() !== p.dow) return false;
      return p.nth === -1 ? d.getDate() + 7 > lastOfMonth(d) : Math.ceil(d.getDate() / 7) === p.nth;
    case "yearDate":
      return d.getMonth() === p.month && d.getDate() === p.day;
    default:
      return true;
  }
}

function step(d: Date, p: Pattern): Date {
  switch (p.unit) {
    case "day":
      return addDays(d, p.n);
    case "week":
      return addDays(d, 7 * p.n);
    case "month":
      return addMonths(d, p.n);
    case "year":
      return addMonths(d, 12 * p.n);
    default: {
      // Calendar patterns: the next matching day, at most a leap year away.
      let r = addDays(d, 1);
      for (let i = 0; i < 400 && !matches(p, r); i++) r = addDays(r, 1);
      return r;
    }
  }
}

/** First date on or after `from` that the rule lands on (quick add with no date). */
export function firstOccurrence(rule: Rule, from: Date): Date {
  const d = startOfDay(from);
  if (rule.unit === "day" || rule.unit === "week" || rule.unit === "month" || rule.unit === "year") return d;
  return matches(rule, d) ? d : step(d, rule);
}

/**
 * Next due date after completing a recurring task. Steps from the current due date and skips
 * past days, so an overdue daily task lands on tomorrow. "every!" rules count from `now`.
 * Returns null once the rule's "until" date has passed, so the task completes for good.
 */
export function nextDue(ruleText: string, due: string | null, now: Date = new Date()): string | null {
  const rule = parseRule(ruleText);
  if (!rule) return null;
  const timed = due ? hasTime(due) : false;
  const today = startOfDay(now);
  let d: Date;
  if (rule.fromCompletion) {
    d = step(today, rule);
    if (timed) {
      const t = parseDue(due!);
      d.setHours(t.getHours(), t.getMinutes(), 0, 0);
    }
  } else {
    d = due ? parseDue(due) : today;
    do {
      d = step(d, rule);
    } while (startOfDay(d) <= today);
  }
  if (rule.until && toDateStr(d) > rule.until) return null;
  return formatDue(d, timed);
}

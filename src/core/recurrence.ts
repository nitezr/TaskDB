import { addDays, addMonths, formatDue, hasTime, parseDue, startOfDay } from "./dates";

/**
 * Supported rules (stored in Notion as text, normalised):
 *   every day | every 3 days | every week | every 2 weeks | every month
 *   every 3 months | every year | every weekday | every mon,wed,fri
 */
export type Rule =
  | { unit: "day" | "week" | "month" | "year"; n: number }
  | { unit: "weekday" }
  | { unit: "days"; days: number[] };

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DOW_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseRule(text: string): Rule | null {
  const s = text.trim().toLowerCase().replace(/^every\s+/, "");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(?:(\d+)\s+)?(day|week|month|year)s?$/))) {
    return { unit: m[2] as "day", n: Number(m[1] ?? 1) };
  }
  if (s === "weekday" || s === "workday") return { unit: "weekday" };
  if (s === "other day") return { unit: "day", n: 2 };
  if (s === "other week") return { unit: "week", n: 2 };
  const parts = s.split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
  if (parts.length && parts.every((p) => p in DOW)) {
    return { unit: "days", days: [...new Set(parts.map((p) => DOW[p]!))].sort() };
  }
  return null;
}

export function formatRule(rule: Rule): string {
  switch (rule.unit) {
    case "weekday":
      return "every weekday";
    case "days":
      return `every ${rule.days.map((d) => DOW_SHORT[d]).join(",")}`;
    default:
      return rule.n === 1 ? `every ${rule.unit}` : `every ${rule.n} ${rule.unit}s`;
  }
}

function step(d: Date, rule: Rule): Date {
  switch (rule.unit) {
    case "day":
      return addDays(d, rule.n);
    case "week":
      return addDays(d, 7 * rule.n);
    case "month":
      return addMonths(d, rule.n);
    case "year":
      return addMonths(d, 12 * rule.n);
    case "weekday": {
      let r = addDays(d, 1);
      while (r.getDay() === 0 || r.getDay() === 6) r = addDays(r, 1);
      return r;
    }
    case "days": {
      let r = addDays(d, 1);
      while (!rule.days.includes(r.getDay())) r = addDays(r, 1);
      return r;
    }
  }
}

/**
 * Next due date after completing a recurring task. Steps from the current
 * due date and skips past days, so an overdue daily task lands on tomorrow.
 */
export function nextDue(ruleText: string, due: string | null, now: Date = new Date()): string | null {
  const rule = parseRule(ruleText);
  if (!rule) return null;
  const timed = due ? hasTime(due) : false;
  let d = due ? parseDue(due) : startOfDay(now);
  const today = startOfDay(now);
  do {
    d = step(d, rule);
  } while (startOfDay(d) <= today);
  return formatDue(d, timed);
}

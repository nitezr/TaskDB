import { addDays, addMonths, formatDue, startOfDay } from "./dates";
import { firstOccurrence, formatRule, parseRule } from "./recurrence";
import type { Priority } from "../types";

export interface QuickAddResult {
  title: string;
  due: string | null;
  priority: Priority;
  /** Project name as typed or matched against `projects`. */
  project: string | null;
  labels: string[];
  person: string | null;
  recurrence: string | null;
  /** From Todoist's "/Section" syntax. */
  section: string | null;
  /** From Todoist's "{friday}" syntax. */
  deadline: string | null;
  /** Minutes, from "for 30 min" / "for 1.5h". */
  duration: number | null;
  /** Character ranges recognised as tokens, for highlighting in the input. */
  tokens: { start: number; end: number; kind: TokenKind }[];
}

export type TokenKind = "date" | "priority" | "project" | "section" | "label" | "person" | "recurrence" | "deadline" | "duration";

export interface QuickAddContext {
  now?: Date;
  projects?: string[];
  people?: string[];
  labels?: string[];
  sections?: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const DOW: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const MONTH_RE = Object.keys(MONTHS).join("|");
const DOW_RE = Object.keys(DOW).join("|");
const TIME_RE = String.raw`(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`;

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

function matchKnown(typed: string, known: string[] | undefined): string {
  return known?.find((k) => norm(k) === norm(typed)) ?? typed.replace(/_/g, " ");
}

function applyTime(d: Date, h: string | undefined, m: string | undefined, ampm: string | undefined): Date | null {
  if (h === undefined) return null;
  let hour = Number(h);
  const min = Number(m ?? 0);
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;
  const r = new Date(d);
  r.setHours(hour, min, 0, 0);
  return r;
}

/**
 * Parses Todoist-style quick add:
 *   "Call Ravi tomorrow 5pm #Sales +Ravi @urgent p1 every mon"
 */
export function parseQuickAdd(input: string, ctx: QuickAddContext = {}): QuickAddResult {
  const now = ctx.now ?? new Date();
  const today = startOfDay(now);
  const out: QuickAddResult = {
    title: "",
    due: null,
    priority: 4,
    project: null,
    labels: [],
    person: null,
    recurrence: null,
    section: null,
    deadline: null,
    duration: null,
    tokens: [],
  };
  const taken: [number, number][] = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && e > a);
  const take = (s: number, e: number, kind: TokenKind) => {
    taken.push([s, e]);
    out.tokens.push({ start: s, end: e, kind });
  };

  const scan = (re: RegExp, kind: TokenKind, fn: (m: RegExpExecArray) => boolean | void) => {
    for (const m of input.matchAll(re)) {
      const e = m as RegExpExecArray;
      const start = e.index + (e[0].length - e[0].trimStart().length);
      const end = e.index + e[0].trimEnd().length;
      if (!free(start, end)) continue;
      if (fn(e) === false) continue;
      take(start, end, kind);
    }
  };

  const B = String.raw`(?<=^|\s)`;
  const E = String.raw`(?=$|\s)`;

  // Deadline in braces, parsed as a date on its own: "{fri}", "{oct 5}", "{in 2 weeks}".
  scan(/\{([^}]+)\}/g, "deadline", (m) => {
    const inner = parseQuickAdd(m[1]!, { now });
    if (!inner.due || inner.title) return false;
    out.deadline = inner.due.slice(0, 10);
  });
  scan(new RegExp(`${B}for\\s+(\\d+(?:\\.\\d+)?)\\s*(m|mins?|minutes?|h|hrs?|hours?)${E}`, "gi"), "duration", (m) => {
    const n = Number(m[1]);
    const minutes = Math.round(/^h/i.test(m[2]!) ? n * 60 : n);
    if (!minutes || minutes > 24 * 60) return false;
    out.duration = minutes;
  });
  scan(new RegExp(`${B}p([1-4])${E}`, "gi"), "priority", (m) => {
    out.priority = Number(m[1]) as Priority;
  });
  scan(new RegExp(`${B}#([^\\s#@+]+)`, "g"), "project", (m) => {
    out.project = matchKnown(m[1]!, ctx.projects);
  });
  scan(new RegExp(`${B}/([^\\s#@+/]+)`, "g"), "section", (m) => {
    out.section = matchKnown(m[1]!, ctx.sections);
  });
  scan(new RegExp(`${B}@([^\\s#@+]+)`, "g"), "label", (m) => {
    const label = matchKnown(m[1]!, ctx.labels);
    if (!out.labels.includes(label)) out.labels.push(label);
  });
  scan(new RegExp(`${B}\\+([^\\s#@+]+)`, "g"), "person", (m) => {
    out.person = matchKnown(m[1]!, ctx.people);
  });

  // Recurrence: "every ..." up to the next token or a time.
  let recurTime: [string | undefined, string | undefined, string | undefined] | null = null;
  const ORD = String.raw`\d{1,2}(?:st|nd|rd|th)`;
  const PATTERN = [
    String.raw`(?:\d+\s+)?(?:days?|weeks?|months?|years?)`,
    String.raw`weekday|workday|other\s+(?:day|week|month)`,
    String.raw`last\s+day`,
    String.raw`(?:1st|2nd|3rd|4th|first|second|third|fourth|last)\s+(?:${DOW_RE})`,
    String.raw`(?:${MONTH_RE})\s+${ORD}|(?:${MONTH_RE})\s+\d{1,2}`,
    ORD,
    String.raw`(?:(?:${DOW_RE})(?:\s*(?:,|and)\s*)?)+`,
  ].join("|");
  const END_DATE = String.raw`\d{4}-\d{2}-\d{2}|(?:${MONTH_RE})\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTH_RE})(?:\s+\d{4})?`;
  scan(
    new RegExp(String.raw`${B}every(!)?\s+(${PATTERN})(?:\s+(?:until|ending)\s+(${END_DATE}))?(?:\s+${TIME_RE})?${E}`, "gi"),
    "recurrence",
    (m) => {
      const rule = parseRule(`every${m[1] ?? ""} ${m[2]}${m[3] ? ` until ${m[3]}` : ""}`);
      if (!rule) return false;
      out.recurrence = formatRule(rule);
      if (m[4]) recurTime = [m[4], m[5], m[6]?.toLowerCase()];
    },
  );

  // Dates, most specific first.
  let base: Date | null = null;
  let timeParts: [string | undefined, string | undefined, string | undefined] | null = recurTime;
  const dateToken = (re: string, resolve: (m: RegExpExecArray) => Date | null) =>
    scan(new RegExp(`${B}(?:${re})(?:\\s+${TIME_RE})?${E}`, "gi"), "date", (m) => {
      if (base) return false;
      const d = resolve(m);
      if (!d) return false;
      base = d;
      const g = m.length - 3;
      if (m[g]) timeParts = [m[g], m[g + 1], m[g + 2]?.toLowerCase()];
    });

  dateToken(String.raw`(\d{4})-(\d{2})-(\d{2})`, (m) => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const monthDay = (monthIdx: number, day: number) => {
    let d = new Date(today.getFullYear(), monthIdx, day);
    if (d < today) d = new Date(today.getFullYear() + 1, monthIdx, day);
    return d.getMonth() === monthIdx ? d : null;
  };
  dateToken(String.raw`(${MONTH_RE})\s+(\d{1,2})(?:st|nd|rd|th)?`, (m) => monthDay(MONTHS[m[1]!.toLowerCase()]!, Number(m[2])));
  dateToken(String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_RE})`, (m) => monthDay(MONTHS[m[2]!.toLowerCase()]!, Number(m[1])));
  dateToken(String.raw`today|tod|tonight`, (m) =>
    m[0].toLowerCase().startsWith("tonight") ? applyTime(today, "20", "00", undefined) : today,
  );
  dateToken(String.raw`tomorrow|tmr`, () => addDays(today, 1));
  dateToken(String.raw`next\s+week`, () => addDays(today, ((8 - today.getDay()) % 7) || 7));
  dateToken(String.raw`next\s+month`, () => addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1));
  dateToken(String.raw`in\s+(\d+)\s+(days?|weeks?|months?)`, (m) => {
    const n = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    return unit.startsWith("day") ? addDays(today, n) : unit.startsWith("week") ? addDays(today, 7 * n) : addMonths(today, n);
  });
  dateToken(String.raw`(?:(next|this)\s+)?(${DOW_RE})`, (m) => {
    const target = DOW[m[2]!.toLowerCase()]!;
    let diff = (target - today.getDay() + 7) % 7 || 7;
    if (m[1]?.toLowerCase() === "next" && diff < 7) diff += 7;
    return addDays(today, diff);
  });
  // Bare time ("5pm", "at 17:00") means today, or tomorrow if already past.
  if (!base) {
    scan(new RegExp(`${B}(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)${E}|${B}at\\s+(\\d{1,2}):(\\d{2})${E}`, "gi"), "date", (m) => {
      if (base) return false;
      const t = m[1] !== undefined ? applyTime(today, m[1], m[2], m[3]?.toLowerCase()) : applyTime(today, m[4], m[5], undefined);
      if (!t) return false;
      base = t <= now ? addDays(t, 1) : t;
      timeParts = null;
    });
  }

  if (base) {
    const d = base as Date;
    const tp = timeParts as [string | undefined, string | undefined, string | undefined] | null;
    const timed = tp ? applyTime(d, ...tp) : null;
    const hasClock = timed !== null || d.getHours() !== 0 || d.getMinutes() !== 0;
    out.due = formatDue(timed ?? d, hasClock);
  } else if (out.recurrence) {
    // "every mon" with no date: first occurrence from today.
    const d = firstOccurrence(parseRule(out.recurrence)!, today);
    const rt = recurTime as [string | undefined, string | undefined, string | undefined] | null;
    const timed = rt ? applyTime(d, ...rt) : null;
    out.due = formatDue(timed ?? d, timed !== null);
  }

  out.tokens.sort((a, b) => a.start - b.start);
  let title = "";
  let pos = 0;
  for (const t of out.tokens) {
    title += input.slice(pos, t.start);
    pos = t.end;
  }
  title += input.slice(pos);
  out.title = title.replace(/\s+/g, " ").trim();
  return out;
}

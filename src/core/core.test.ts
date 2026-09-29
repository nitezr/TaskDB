import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS, type Task } from "../types";
import { applyFilter, FilterSyntaxError } from "./filters";
import { parseQuickAdd } from "./quickAdd";
import { dayHeading, dueLabel } from "./dates";
import { nextDue, parseRule } from "./recurrence";

// Saturday 26 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 26, 10, 0);
const qa = (s: string, ctx = {}) => parseQuickAdd(s, { now: NOW, ...ctx });

describe("quick add", () => {
  it("parses the full example", () => {
    const r = qa("Call Ravi tomorrow 5pm #Sales +Ravi @urgent p1 every mon");
    expect(r.title).toBe("Call Ravi");
    expect(r.priority).toBe(1);
    expect(r.project).toBe("Sales");
    expect(r.person).toBe("Ravi");
    expect(r.labels).toEqual(["urgent"]);
    expect(r.recurrence).toBe("every mon");
    expect(r.due?.startsWith("2026-09-27T17:00:00")).toBe(true);
  });

  it("matches known project names with spaces", () => {
    expect(qa("Plan #side_project", { projects: ["Side Project"] }).project).toBe("Side Project");
  });

  it("handles all-day dates", () => {
    expect(qa("Pay rent today").due).toBe("2026-09-26");
    expect(qa("Pay rent oct 5").due).toBe("2026-10-05");
    expect(qa("Pay rent 5 Oct").due).toBe("2026-10-05");
    expect(qa("Trip 2027-01-15").due).toBe("2027-01-15");
    expect(qa("Review in 3 days").due).toBe("2026-09-29");
    expect(qa("Gym mon").due).toBe("2026-09-28");
    expect(qa("Gym next mon").due).toBe("2026-10-05");
    expect(qa("Plan next week").due).toBe("2026-09-28");
  });

  it("rolls past month-days into next year", () => {
    expect(qa("Taxes jan 10").due).toBe("2027-01-10");
  });

  it("treats a past bare time as tomorrow", () => {
    expect(qa("Standup 9am").due?.startsWith("2026-09-27T09:00")).toBe(true);
    expect(qa("Call 3pm").due?.startsWith("2026-09-26T15:00")).toBe(true);
  });

  it("starts recurring tasks on the first matching day", () => {
    const r = qa("Water plants every weekday");
    expect(r.recurrence).toBe("every weekday");
    expect(r.due).toBe("2026-09-28");
    expect(qa("Stretch every day at 7am").due?.startsWith("2026-09-26T07:00")).toBe(true);
  });

  it("leaves plain text alone", () => {
    const r = qa("Email tom about p5 budget");
    expect(r.title).toBe("Email tom about p5 budget");
    expect(r.due).toBeNull();
    expect(r.priority).toBe(4);
  });
});

describe("recurrence", () => {
  it("parses rules", () => {
    expect(parseRule("every 2 weeks")).toEqual({ unit: "week", n: 2 });
    expect(parseRule("every mon, wed and fri")).toEqual({ unit: "days", days: [1, 3, 5] });
    expect(parseRule("every blue moon")).toBeNull();
  });

  it("moves an overdue daily task to tomorrow", () => {
    expect(nextDue("every day", "2026-09-20", NOW)).toBe("2026-09-27");
  });

  it("keeps the time of day", () => {
    expect(nextDue("every week", "2026-09-26T08:00:00+00:00", NOW)).toMatch(/^2026-10-03T/);
  });

  it("clamps month-end dates", () => {
    expect(nextDue("every month", "2027-01-31", new Date(2027, 0, 31))).toBe("2027-02-28");
  });

  it("skips weekends for weekday rules", () => {
    expect(nextDue("every weekday", "2026-09-25", NOW)).toBe("2026-09-28");
  });
});

describe("filters", () => {
  const task = (f: Partial<Task>): Task => ({
    ...DEFAULT_FIELDS,
    id: f.title!,
    notionId: null,
    remoteEditedAt: null,
    syncError: null,
    ...f,
  });
  const tasks = [
    task({ title: "A", priority: 1, due: "2026-09-26", labels: ["waiting"], person: "Ravi" }),
    task({ title: "B", priority: 1, due: "2026-09-20", projectId: "p-sales" }),
    task({ title: "C", due: "2026-09-30" }),
    task({ title: "D" }),
    task({ title: "E", priority: 1, due: "2026-09-26", done: true }),
  ];
  const ctx = { now: NOW, projectName: (id: string | null) => (id === "p-sales" ? "Sales" : null) };
  const run = (q: string) => applyFilter(q, tasks, ctx).map((t) => t.title);

  it("combines terms", () => {
    expect(run("p1 & today")).toEqual(["A"]);
    expect(run("today | overdue")).toEqual(["A", "B"]);
    expect(run("@waiting & +Ravi")).toEqual(["A"]);
    expect(run("#Sales")).toEqual(["B"]);
    expect(run("no date")).toEqual(["D"]);
    expect(run("7 days & !today")).toEqual(["C"]);
    expect(run("(p1 | p4) & !overdue")).toEqual(["A", "C", "D"]);
  });

  it("reports syntax errors", () => {
    expect(() => run("p1 &")).toThrow(FilterSyntaxError);
    expect(() => run("(p1")).toThrow(FilterSyntaxError);
  });
});

describe("date labels", () => {
  // NOW is Saturday 26 Sep 2026.
  it("uses full weekday names and drops a midnight time", () => {
    expect(dueLabel("2026-09-29", NOW)).toBe("Tuesday");
    expect(dueLabel("2026-09-27T00:00:00", NOW)).toBe("Tomorrow");
    expect(dueLabel("2026-09-26T17:00:00", NOW)).toBe("Today 5:00 PM");
    expect(dueLabel("2026-09-25", NOW)).toBe("Yesterday");
  });
  it("lets Today and Tomorrow replace the weekday in headings", () => {
    expect(dayHeading("2026-09-26", NOW)).toBe("26 Sep · Today");
    expect(dayHeading("2026-10-01", NOW)).toBe("1 Oct · Thursday");
  });
});

describe("quick add deadlines and durations", () => {
  const qa = (t: string) => parseQuickAdd(t, { now: NOW });
  it("reads a {deadline} and a duration", () => {
    const r = qa("Draft report tomorrow 9am for 45 min {oct 5}");
    expect(r.title).toBe("Draft report");
    expect(r.deadline).toBe("2026-10-05");
    expect(r.duration).toBe(45);
    expect(r.due?.startsWith("2026-09-27T09:00")).toBe(true);
    expect(qa("Deep work for 1.5h").duration).toBe(90);
  });
  it("leaves braces alone when they aren't a date", () => {
    expect(qa("Fix {config} parsing").title).toBe("Fix {config} parsing");
  });
});

describe("Todoist-style repeat rules", () => {
  // NOW is Saturday 26 Sep 2026, 10:00.
  it("parses and normalises the extended forms", () => {
    expect(parseQuickAdd("Rent every 1st", { now: NOW }).recurrence).toBe("every 1st");
    expect(parseQuickAdd("Invoice every last day", { now: NOW }).recurrence).toBe("every last day");
    expect(parseQuickAdd("Book club every last fri", { now: NOW }).recurrence).toBe("every last fri");
    expect(parseQuickAdd("Anniversary every jan 15", { now: NOW }).recurrence).toBe("every jan 15");
    expect(parseQuickAdd("Water plants every! 3 days", { now: NOW }).recurrence).toBe("every! 3 days");
    expect(parseQuickAdd("Standup every weekday until oct 30", { now: NOW }).recurrence).toBe("every weekday until 30 Oct 2026");
  });
  it("starts on the first matching date", () => {
    expect(parseQuickAdd("Rent every 1st", { now: NOW }).due).toBe("2026-10-01");
    expect(parseQuickAdd("Review every last fri", { now: NOW }).due).toBe("2026-10-30");
    expect(parseQuickAdd("Pay every 26th", { now: NOW }).due).toBe("2026-09-26");
  });
  it("steps calendar rules and completion-based rules", () => {
    expect(nextDue("every last day", "2026-09-30", NOW)).toBe("2026-10-31");
    expect(nextDue("every 31st", "2026-10-31", new Date(2026, 9, 31))).toBe("2026-11-30");
    expect(nextDue("every 2nd tue", "2026-10-13", new Date(2026, 9, 13))).toBe("2026-11-10");
    expect(nextDue("every jan 15", "2026-01-15", NOW)).toBe("2027-01-15");
    // every! counts from today (26 Sep), not from the old due date.
    expect(nextDue("every! 3 days", "2026-09-01", NOW)).toBe("2026-09-29");
  });
  it("stops after the until date", () => {
    expect(nextDue("every week until 30 Sep 2026", "2026-09-26", NOW)).toBeNull();
    expect(nextDue("every week until 30 Oct 2026", "2026-09-26", NOW)).toBe("2026-10-03");
  });
});

describe("deadline filters", () => {
  const task = (deadline: string | null): Task => ({ ...DEFAULT_FIELDS, id: "x", notionId: null, remoteEditedAt: null, syncError: null, title: "T", deadline });
  const ctx = { now: NOW, projectName: () => null };
  it("matches deadline terms", () => {
    const tasks = [task("2026-09-25"), task("2026-09-26"), task("2026-09-30"), task(null)];
    expect(applyFilter("deadline", tasks, ctx).length).toBe(3);
    expect(applyFilter("no deadline", tasks, ctx).length).toBe(1);
    expect(applyFilter("deadline today", tasks, ctx).length).toBe(1);
    expect(applyFilter("missed deadline", tasks, ctx).length).toBe(1);
    expect(applyFilter("deadline 7 days", tasks, ctx).length).toBe(2);
  });
});

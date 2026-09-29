import { addDays, dayHeading, dueDay, parseDue, startOfDay, toDateStr } from "../core/dates";
import { applyFilter, FilterSyntaxError } from "../core/filters";
import { nextDue } from "../core/recurrence";
import type { Priority, Task, TaskFields } from "../types";
import type { AppController } from "./controller";

// ---- Views ----

export type View =
  | { kind: "inbox" }
  | { kind: "today" }
  | { kind: "upcoming" }
  | { kind: "project"; id: string }
  | { kind: "label"; name: string }
  | { kind: "person"; name: string }
  | { kind: "filter"; id: string }
  | { kind: "search"; query: string }
  | { kind: "completed" }
  | { kind: "browse" };

export const viewKey = (v: View): string =>
  v.kind === "project" ? `project:${v.id}` : v.kind === "filter" ? `filter:${v.id}` : v.kind === "label" ? `label:${v.name}` : v.kind;
export const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

// ---- Display options (Remit's Display menu), remembered per view ----

export type Layout = "list" | "board" | "calendar";
export type GroupBy = "default" | "none" | "dueDate" | "priority" | "label" | "project" | "section";
export type Sorting = "smart" | "manual" | "dueDate" | "deadline" | "priority" | "alphabetical" | "added";
export type Deadline = "all" | "overdue" | "today" | "thisWeek" | "noDate";
export type CalendarRange = "day" | "threeDays" | "week" | "month";

export interface DisplayPrefs {
  layout: Layout;
  groupBy: GroupBy;
  sorting: Sorting;
  showCompleted: boolean;
  deadline: Deadline;
  priority: "all" | Priority;
  label: string; // "all" or a label name
  calendarRange: CalendarRange;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  layout: "list",
  groupBy: "default",
  sorting: "smart",
  showCompleted: false,
  deadline: "all",
  priority: "all",
  label: "all",
  calendarRange: "month",
};

export const GROUP_LABELS: Record<GroupBy, string> = {
  default: "Default",
  none: "None",
  dueDate: "Due date",
  priority: "Priority",
  label: "Tag",
  project: "Project",
  section: "Section",
};
export const SORT_LABELS: Record<Sorting, string> = {
  smart: "Smart",
  manual: "Manual (drag to order)",
  dueDate: "Due date",
  deadline: "Deadline",
  priority: "Priority",
  alphabetical: "Alphabetical",
  added: "Date added",
};
export const DEADLINE_LABELS: Record<Deadline, string> = {
  all: "All",
  overdue: "Overdue",
  today: "Today",
  thisWeek: "Next 7 days",
  noDate: "No date",
};

// ---- Groups ----

export interface Group {
  key: string;
  title: string;
  tone?: "overdue" | "today";
  tasks: Task[];
  /** Applied to a task created in, or dropped onto, this group. Null = drop not allowed. */
  patch: Partial<TaskFields> | null;
  /** The overdue group offers "Reschedule all". */
  overdue?: boolean;
  /** Project sections can be renamed and reordered. */
  section?: { projectId: string; name: string | null };
  /** Upcoming only: future rounds of repeating tasks that land on this day (Things), read-only. */
  repeats?: Task[];
  /** Slim "Nothing until 12 Oct" line shown above a day that follows empty days (Upcoming). */
  gap?: string;
}

export interface ViewModel {
  title: string;
  subtitle?: string;
  groups: Group[];
  /** Defaults for new tasks created in this view. */
  addDefaults: Partial<TaskFields>;
  error?: string;
  /** Number of open tasks shown (for the title bar). */
  count: number;
  /** Whether rows nest sub-tasks under their parents. */
  tree: boolean;
}

const cmpDue = (a: Task, b: Task) =>
  (a.due ? parseDue(a.due).getTime() : Infinity) - (b.due ? parseDue(b.due).getTime() : Infinity);
const cmpOrder = (a: Task, b: Task) => a.order - b.order || a.title.localeCompare(b.title);

export function sortTasks(tasks: Task[], sorting: Sorting): Task[] {
  const by: Record<Sorting, (a: Task, b: Task) => number> = {
    // Dated first by date, then by priority, then the user's own order.
    smart: (a, b) => cmpDue(a, b) || a.priority - b.priority || cmpOrder(a, b),
    manual: cmpOrder,
    dueDate: (a, b) => cmpDue(a, b) || cmpOrder(a, b),
    deadline: (a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || cmpDue(a, b) || cmpOrder(a, b),
    priority: (a, b) => a.priority - b.priority || cmpDue(a, b) || cmpOrder(a, b),
    alphabetical: (a, b) => a.title.localeCompare(b.title),
    added: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || cmpOrder(a, b),
  };
  return [...tasks].sort(by[sorting]);
}

function matchesDeadline(t: Task, d: Deadline, today: string, weekEnd: string): boolean {
  const day = t.due ? dueDay(t.due) : null;
  switch (d) {
    case "all":
      return true;
    case "overdue":
      return day !== null && day < today;
    case "today":
      return day !== null && day <= today;
    case "thisWeek":
      return day !== null && day <= weekEnd;
    case "noDate":
      return day === null;
  }
}

/** The tasks a view shows before grouping (quick filters and completed applied). */
export function viewTasks(view: View, app: AppController, prefs: DisplayPrefs, now = new Date()): { tasks: Task[]; error?: string } {
  const today = toDateStr(now);
  const weekEnd = toDateStr(addDays(startOfDay(now), 7));
  const all = app.tasks();
  const visible = (t: Task) => prefs.showCompleted || !t.done;
  let base: Task[];
  let error: string | undefined;

  switch (view.kind) {
    case "inbox":
      base = all.filter((t) => !t.projectId || !app.project(t.projectId));
      break;
    case "today":
      // Deadlines arriving today (or missed) pull a task into Today, as in Things.
      base = all.filter(
        (t) => (t.due && dueDay(t.due) <= today && (!t.done || dueDay(t.due) === today)) || (!t.done && t.deadline && dueDay(t.deadline) <= today),
      );
      break;
    case "upcoming":
      base = all.filter((t) => t.due);
      break;
    case "project": {
      const ids = new Set([view.id, ...descendants(app, view.id)]);
      base = all.filter((t) => t.projectId && ids.has(t.projectId));
      break;
    }
    case "label":
      base = all.filter((t) => t.labels.includes(view.name));
      break;
    case "person":
      base = all.filter((t) => t.person === view.name);
      break;
    case "filter": {
      const f = app.filters().find((x) => x.id === view.id);
      try {
        base = f ? applyFilter(f.query, all, { now, projectName: app.projectName, includeDone: true }) : [];
      } catch (e) {
        base = [];
        error = e instanceof FilterSyntaxError ? `Filter error: ${e.message}` : String(e);
      }
      break;
    }
    case "search": {
      const q = view.query.trim().toLowerCase();
      base = q ? all.filter((t) => t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q)) : [];
      break;
    }
    case "completed":
      return { tasks: all.filter((t) => t.done) };
    case "browse":
      return { tasks: [] };
  }
  const tasks = base.filter(
    (t) =>
      visible(t) &&
      matchesDeadline(t, prefs.deadline, today, weekEnd) &&
      (prefs.priority === "all" || t.priority === prefs.priority) &&
      (prefs.label === "all" || t.labels.includes(prefs.label)),
  );
  return { tasks, error };
}

function descendants(app: AppController, id: string): string[] {
  const kids = app.projects.filter((p) => p.parentId === id).map((p) => p.id);
  return kids.flatMap((k) => [k, ...descendants(app, k)]);
}

export interface BuildOptions {
  now?: Date;
  /** First day shown by Upcoming (week navigation). */
  upcomingStart?: Date;
  upcomingDays?: number;
  /** List Upcoming: after the fixed days, keep going with every later day that has tasks. */
  upcomingOpenEnded?: boolean;
}

export function buildViewModel(view: View, app: AppController, prefs: DisplayPrefs, opts: BuildOptions = {}): ViewModel {
  const now = opts.now ?? new Date();
  const today = toDateStr(now);
  const { tasks, error } = viewTasks(view, app, prefs, now);
  const sorted = sortTasks(tasks, prefs.sorting);
  const title = viewTitle(view, app);
  const addDefaults = viewDefaults(view, today);
  const tree = view.kind === "project" || view.kind === "inbox";
  const count = tasks.filter((t) => !t.done).length;

  const groupBy: GroupBy =
    prefs.groupBy !== "default"
      ? prefs.groupBy
      : view.kind === "project"
        ? "section"
        : view.kind === "today" || view.kind === "upcoming"
          ? "dueDate"
          : view.kind === "completed"
            ? "dueDate"
            : "none";

  let groups: Group[];
  if (view.kind === "completed") {
    groups = groupByCompletion(sorted, now);
  } else if (groupBy === "none") {
    groups = [{ key: "all", title: "", tasks: sorted, patch: {} }];
  } else if (groupBy === "dueDate") {
    groups = groupByDate(sorted, now, view.kind === "upcoming" ? opts : { upcomingDays: 0 }, view.kind === "upcoming");
  } else if (groupBy === "priority") {
    // Empty groups are dropped (Remit): a "Priority 3" header with nothing under it is noise.
    groups = ([1, 2, 3, 4] as Priority[])
      .map((p) => ({
        key: `p${p}`,
        title: `Priority ${p}`,
        tasks: sorted.filter((t) => t.priority === p),
        patch: { priority: p },
      }))
      .filter((g) => g.tasks.length);
  } else if (groupBy === "label") {
    const labels = [...new Set(sorted.flatMap((t) => t.labels))].sort((a, b) => a.localeCompare(b));
    groups = [
      ...labels.map((l) => ({ key: `l:${l}`, title: l, tasks: sorted.filter((t) => t.labels.includes(l)), patch: { labels: [l] } })),
      { key: "l:none", title: "No tag", tasks: sorted.filter((t) => !t.labels.length), patch: { labels: [] } },
    ].filter((g) => g.tasks.length);
  } else if (groupBy === "project") {
    groups = [
      { key: "inbox", title: "Inbox", tasks: sorted.filter((t) => !app.project(t.projectId)), patch: { projectId: null, section: null } },
      ...app.projectTree().map(({ project }) => ({
        key: project.id,
        title: `${project.emoji ? `${project.emoji} ` : ""}${project.name}`,
        tasks: sorted.filter((t) => t.projectId === project.id),
        patch: { projectId: project.id, section: null },
      })),
    ].filter((g) => g.tasks.length || view.kind === "project");
  } else {
    // Sections: only meaningful inside one project.
    const projectId = view.kind === "project" ? view.id : null;
    const names = projectId ? app.sections(projectId) : [...new Set(sorted.map((t) => t.section).filter(Boolean) as string[])];
    groups = [
      {
        key: "s:none",
        // Without sections a project reads as a plain list, so no header at all.
        title: names.length ? "(No section)" : "",
        tasks: sorted.filter((t) => !t.section || !names.includes(t.section)),
        patch: { section: null },
        section: projectId ? { projectId, name: null } : undefined,
      },
      ...names.map((n) => ({
        key: `s:${n}`,
        title: n,
        tasks: sorted.filter((t) => t.section === n),
        patch: { section: n, ...(projectId ? { projectId } : {}) },
        section: projectId ? { projectId, name: n } : undefined,
      })),
    ].filter((g) => g.key !== "s:none" || g.tasks.length || !names.length);
  }

  return {
    title,
    subtitle: view.kind === "upcoming" ? monthLabel(opts.upcomingStart ?? now) : undefined,
    groups,
    addDefaults,
    error,
    count,
    tree,
  };
}

function groupByDate(tasks: Task[], now: Date, opts: BuildOptions, upcoming: boolean): Group[] {
  const today = toDateStr(now);
  const groups: Group[] = [];
  const overdue = tasks.filter((t) => t.due && dueDay(t.due) < today && !t.done);
  if (overdue.length) groups.push({ key: "overdue", title: "Overdue", tone: "overdue", tasks: overdue, patch: null, overdue: true });

  if (upcoming) {
    const start = startOfDay(opts.upcomingStart ?? now);
    const days = opts.upcomingDays ?? 7;
    const shown: string[] = [];
    for (let i = 0; i < days; i++) {
      const day = toDateStr(addDays(start, i));
      if (day >= today) shown.push(day);
    }
    if (opts.upcomingOpenEnded) {
      // Every later day that has something, however far out, so nothing counted is unreachable.
      const last = shown[shown.length - 1] ?? today;
      const later = [...new Set(tasks.filter((t) => t.due && dueDay(t.due) > last).map((t) => dueDay(t.due!)))].sort();
      shown.push(...later);
    }
    // Where each repeating task will land next within the fixed days ("every!" can't be known).
    const windowEnd = toDateStr(addDays(start, days - 1));
    const repeatsOn = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.recurrence || !t.due || t.done || t.recurrence.startsWith("every!")) continue;
      let cur: string | null = t.due;
      for (let n = 0; n < 60 && cur; n++) {
        cur = nextDue(t.recurrence, cur, parseDue(cur));
        if (!cur || dueDay(cur) > windowEnd) break;
        if (dueDay(cur) >= today) repeatsOn.set(dueDay(cur), [...(repeatsOn.get(dueDay(cur)) ?? []), t]);
      }
    }
    shown.forEach((day, i) => {
      const prev = shown[i - 1];
      const d = parseDue(day);
      const gap = prev && toDateStr(addDays(parseDue(prev), 1)) !== day ? `Nothing until ${d.getDate()} ${d.toLocaleDateString(undefined, { month: "short" })}` : undefined;
      groups.push({
        key: day,
        title: dayHeading(day, now),
        tone: day === today ? "today" : undefined,
        tasks: tasks.filter((t) => t.due && dueDay(t.due) === day),
        patch: { due: day },
        gap,
        repeats: repeatsOn.get(day),
      });
    });
    return groups;
  }

  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (overdue.includes(t)) continue;
    const deadlineDue = !t.done && t.deadline && dueDay(t.deadline) <= today;
    const key = t.due && !(deadlineDue && dueDay(t.due) > today) ? dueDay(t.due) : deadlineDue ? today : t.due ? dueDay(t.due) : "none";
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const keys = [...byDay.keys()].sort((a, b) => (a === "none" ? 1 : b === "none" ? -1 : a.localeCompare(b)));
  if (!keys.includes(today) && groups.length) keys.unshift(today);
  for (const k of keys) {
    groups.push({
      key: k,
      title: k === "none" ? "No date" : k === today ? "Today" : dayHeading(k, now),
      tone: k === today ? "today" : undefined,
      tasks: byDay.get(k) ?? [],
      patch: { due: k === "none" ? null : k },
    });
  }
  if (!groups.length) groups.push({ key: today, title: "Today", tone: "today", tasks: [], patch: { due: today } });
  return groups;
}

function groupByCompletion(tasks: Task[], now: Date): Group[] {
  const sorted = [...tasks].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const byDay = new Map<string, Task[]>();
  for (const t of sorted) {
    const k = t.completedAt ? dueDay(t.completedAt) : "Earlier";
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  return [...byDay].map(([k, ts]) => ({ key: k, title: k === "Earlier" ? k : dayHeading(k, now), tasks: ts, patch: null }));
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function viewTitle(view: View, app: AppController): string {
  switch (view.kind) {
    case "inbox":
      return "Inbox";
    case "today":
      return "Today";
    case "upcoming":
      return "Upcoming";
    case "project": {
      const p = app.project(view.id);
      return p ? `${p.emoji ? `${p.emoji} ` : ""}${p.name}` : "Project";
    }
    case "label":
      return view.name;
    case "person":
      return view.name;
    case "filter":
      return app.filters().find((f) => f.id === view.id)?.name ?? "Filter";
    case "search":
      return `Search: ${view.query}`;
    case "completed":
      return "Completed";
    case "browse":
      return "Filters & Tags";
  }
}

function viewDefaults(view: View, today: string): Partial<TaskFields> {
  switch (view.kind) {
    case "today":
      return { due: today };
    case "project":
      return { projectId: view.id };
    case "label":
      return { labels: [view.name] };
    case "person":
      return { person: view.name };
    default:
      return {};
  }
}

/** Count for the sidebar: open tasks the view would show with default display options. */
export function countFor(view: View, app: AppController, now = new Date()): number {
  return viewTasks(view, app, DEFAULT_PREFS, now).tasks.filter((t) => !t.done).length;
}

/** Nests tasks under parents present in the same list (for list layout). */
export interface TaskNode {
  task: Task;
  children: TaskNode[];
}
export function nest(tasks: Task[]): TaskNode[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string, Task[]>();
  for (const t of tasks) if (t.parentId && ids.has(t.parentId)) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  const node = (t: Task): TaskNode => ({ task: t, children: (kids.get(t.id) ?? []).map(node) });
  return tasks.filter((t) => !t.parentId || !ids.has(t.parentId)).map(node);
}

/** Flattened visible order across groups, for J/K navigation. */
export function visibleOrder(vm: ViewModel, collapsed: Set<string>, layout: Layout): string[] {
  const out: string[] = [];
  const walk = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      out.push(n.task.id);
      if (!collapsed.has(n.task.id)) walk(n.children);
    }
  };
  for (const g of vm.groups) {
    if (layout === "list" && vm.tree) walk(nest(g.tasks));
    else out.push(...g.tasks.map((t) => t.id));
  }
  return out;
}

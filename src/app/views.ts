import { addDays, dayHeading, dueDay, parseDue, startOfDay, toDateStr } from "../core/dates";
import { applyFilter, FilterSyntaxError } from "../core/filters";
import type { Task, TaskFields } from "../types";
import type { AppController } from "./controller";

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

export interface TaskNode {
  task: Task;
  children: TaskNode[];
}

export interface Section {
  title?: string;
  tone?: "overdue";
  nodes: TaskNode[];
  /** Defaults applied to tasks added inline in this section. */
  addDefaults?: Partial<TaskFields>;
  /** Hide the inline "Add task" button. */
  noAdd?: boolean;
}

export interface ViewModel {
  title: string;
  sections: Section[];
  addDefaults: Partial<TaskFields>;
  error?: string;
  /** Show sub-tasks nested under parents (project-like views). */
  tree: boolean;
}

const byOrder = (a: Task, b: Task) => a.order - b.order || a.title.localeCompare(b.title);
const byDue = (a: Task, b: Task) =>
  (a.due ? parseDue(a.due).getTime() : Infinity) - (b.due ? parseDue(b.due).getTime() : Infinity) ||
  a.priority - b.priority ||
  byOrder(a, b);

/** Nests open tasks under their parents; orphans (parent not in list) stay top-level. */
export function buildTree(tasks: Task[]): TaskNode[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  }
  const node = (t: Task): TaskNode => ({ task: t, children: (kids.get(t.id) ?? []).sort(byOrder).map(node) });
  return tasks.filter((t) => !t.parentId || !ids.has(t.parentId)).sort(byOrder).map(node);
}

const flat = (tasks: Task[]): TaskNode[] => tasks.map((task) => ({ task, children: [] }));

export function buildView(view: View, app: AppController, now = new Date()): ViewModel {
  const open = app.tasks().filter((t) => !t.done);
  const today = toDateStr(now);

  switch (view.kind) {
    case "inbox":
      return { title: "Inbox", tree: true, addDefaults: {}, sections: [{ nodes: buildTree(open.filter((t) => !t.projectId)) }] };

    case "today": {
      const overdue = open.filter((t) => t.due && dueDay(t.due) < today).sort(byDue);
      const todays = open.filter((t) => t.due && dueDay(t.due) === today).sort(byDue);
      const sections: Section[] = [];
      if (overdue.length) sections.push({ title: "Overdue", tone: "overdue", noAdd: true, nodes: flat(overdue) });
      sections.push({ title: overdue.length ? dayHeading(today, now) : undefined, nodes: flat(todays) });
      return { title: "Today", tree: false, addDefaults: { due: today }, sections };
    }

    case "upcoming": {
      const sections: Section[] = [];
      const start = startOfDay(now);
      const overdue = open.filter((t) => t.due && dueDay(t.due) < today).sort(byDue);
      if (overdue.length) sections.push({ title: "Overdue", tone: "overdue", noAdd: true, nodes: flat(overdue) });
      for (let i = 0; i < 14; i++) {
        const day = toDateStr(addDays(start, i));
        sections.push({
          title: dayHeading(day, now),
          nodes: flat(open.filter((t) => t.due && dueDay(t.due) === day).sort(byDue)),
          addDefaults: { due: day },
        });
      }
      const horizon = toDateStr(addDays(start, 14));
      const later = open.filter((t) => t.due && dueDay(t.due) >= horizon).sort(byDue);
      if (later.length) sections.push({ title: "Later", noAdd: true, nodes: flat(later) });
      return { title: "Upcoming", tree: false, addDefaults: { due: today }, sections };
    }

    case "project": {
      const name = app.projectName(view.id) ?? "Project";
      return {
        title: name,
        tree: true,
        addDefaults: { projectId: view.id },
        sections: [{ nodes: buildTree(open.filter((t) => t.projectId === view.id)) }],
      };
    }

    case "label":
      return {
        title: `@${view.name}`,
        tree: false,
        addDefaults: { labels: [view.name] },
        sections: [{ nodes: flat(open.filter((t) => t.labels.includes(view.name)).sort(byDue)) }],
      };

    case "person":
      return {
        title: view.name,
        tree: false,
        addDefaults: { person: view.name },
        sections: [{ nodes: flat(open.filter((t) => t.person === view.name).sort(byDue)) }],
      };

    case "filter": {
      const f = app.filters().find((x) => x.id === view.id);
      if (!f) return { title: "Filter", tree: false, addDefaults: {}, sections: [] };
      try {
        const tasks = applyFilter(f.query, open, { now, projectName: app.projectName });
        return { title: f.name, tree: false, addDefaults: {}, sections: [{ nodes: flat(tasks.sort(byDue)) }] };
      } catch (e) {
        const msg = e instanceof FilterSyntaxError ? e.message : String(e);
        return { title: f.name, tree: false, addDefaults: {}, sections: [], error: `Filter error: ${msg}` };
      }
    }

    case "search": {
      const q = view.query.trim().toLowerCase();
      const hits = q ? open.filter((t) => t.title.toLowerCase().includes(q)).sort(byDue) : [];
      return { title: `Search: ${view.query}`, tree: false, addDefaults: {}, sections: [{ nodes: flat(hits) }] };
    }

    case "completed": {
      const done = app
        .tasks()
        .filter((t) => t.done)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || byOrder(a, b));
      const byDay = new Map<string, Task[]>();
      for (const t of done) {
        const day = t.completedAt ? dueDay(t.completedAt) : "Earlier";
        byDay.set(day, [...(byDay.get(day) ?? []), t]);
      }
      const sections: Section[] = [...byDay].map(([day, tasks]) => ({
        title: day === "Earlier" ? day : dayHeading(day, now),
        noAdd: true,
        nodes: flat(tasks),
      }));
      return { title: "Completed", tree: false, addDefaults: {}, sections };
    }

    case "browse":
      return { title: "Filters & Labels", tree: false, addDefaults: {}, sections: [] };
  }
}

export function countFor(view: View, app: AppController, now = new Date()): number {
  const vm = buildView(view, app, now);
  const count = (nodes: TaskNode[]): number => nodes.reduce((n, x) => n + 1 + count(x.children), 0);
  return vm.sections.reduce((n, s) => n + count(s.nodes), 0);
}

/** Flattened visible order, for j/k keyboard navigation. */
export function visibleIds(vm: ViewModel, collapsed: Set<string>): string[] {
  const out: string[] = [];
  const walk = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      out.push(n.task.id);
      if (!collapsed.has(n.task.id)) walk(n.children);
    }
  };
  vm.sections.forEach((s) => walk(s.nodes));
  return out;
}

export const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

import { parseQuickAdd } from "./quickAdd";
import type { Priority } from "../types";

/** One task from a Todoist project export, ready to create. */
export interface ImportedTask {
  title: string;
  notes: string | null;
  priority: Priority;
  labels: string[];
  due: string | null;
  recurrence: string | null;
  deadline: string | null;
  duration: number | null;
  section: string | null;
  /** Index of the parent task in the same list (from INDENT), or null. */
  parent: number | null;
}

export interface ImportedProject {
  name: string;
  sections: string[];
  tasks: ImportedTask[];
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** "Work [2203306141].csv" → "Work". */
export function projectNameFromFile(file: string): string {
  return file.replace(/\.csv$/i, "").replace(/\s*\[\d+\]\s*$/, "").trim() || "Imported";
}

/**
 * Reads a Todoist project CSV (TYPE, CONTENT, DESCRIPTION, PRIORITY, INDENT, DATE, DURATION,
 * DURATION_UNIT, DEADLINE …). Todoist's current exports use PRIORITY 1 = p1; older API-style
 * exports used 4 = p1, which `apiPriorities` flips.
 */
export function parseTodoistCsv(text: string, name: string, opts: { apiPriorities?: boolean; now?: Date } = {}): ImportedProject {
  const rows = parseCsv(text);
  const head = (rows.shift() ?? []).map((h) => h.trim().toUpperCase());
  const col = (r: string[], key: string) => {
    const i = head.indexOf(key);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  const project: ImportedProject = { name, sections: [], tasks: [] };
  let section: string | null = null;
  // Most recent task at each indent level, to resolve sub-task parents.
  const stack: number[] = [];

  for (const r of rows) {
    const type = col(r, "TYPE").toLowerCase();
    if (type === "section") {
      section = col(r, "CONTENT") || null;
      if (section && !project.sections.includes(section)) project.sections.push(section);
      stack.length = 0;
      continue;
    }
    if (type === "note") {
      const last = project.tasks[project.tasks.length - 1];
      const note = col(r, "CONTENT");
      if (last && note) last.notes = last.notes ? `${last.notes}\n\n${note}` : note;
      continue;
    }
    if (type !== "task") continue;

    const content = col(r, "CONTENT");
    // Labels live inside the content as @words; nothing else in it is parsed.
    const labels = [...content.matchAll(/(?:^|\s)@([^\s@#]+)/g)].map((m) => m[1]!.replace(/_/g, " "));
    const title = content.replace(/(?:^|\s)@[^\s@#]+/g, " ").replace(/\s+/g, " ").trim();
    if (!title) continue;

    let p = Number(col(r, "PRIORITY")) || 4;
    if (opts.apiPriorities) p = 5 - p;
    const priority = Math.min(4, Math.max(1, p)) as Priority;

    const dateText = col(r, "DATE");
    const when = dateText ? parseQuickAdd(`x ${dateText}`, { now: opts.now }) : null;
    const deadlineText = col(r, "DEADLINE");
    const deadline = deadlineText ? (parseQuickAdd(`x ${deadlineText}`, { now: opts.now }).due?.slice(0, 10) ?? null) : null;

    const amount = Number(col(r, "DURATION"));
    const unit = col(r, "DURATION_UNIT").toLowerCase();
    const duration = amount > 0 ? Math.round(unit.startsWith("day") ? amount * 1440 : unit.startsWith("hour") ? amount * 60 : amount) : null;

    const indent = Math.max(1, Number(col(r, "INDENT")) || 1);
    const parent = indent > 1 ? (stack[indent - 2] ?? null) : null;
    const index = project.tasks.length;
    stack[indent - 1] = index;
    stack.length = indent;

    project.tasks.push({
      title,
      notes: col(r, "DESCRIPTION") || null,
      priority,
      labels,
      due: when?.due ?? null,
      recurrence: when?.recurrence ?? null,
      deadline,
      duration,
      section,
      parent,
    });
  }
  return project;
}

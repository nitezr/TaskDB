import { addDays, dueDay, startOfDay, toDateStr } from "./dates";
import type { Task } from "../types";

/**
 * Todoist-style filter queries:
 *   today | tomorrow | overdue | no date | recurring | 7 days
 *   p1..p4 | #Project | @label | no label | +Person | "search text"
 * combined with & (and), | (or), ! (not) and parentheses.
 */

type Node =
  | { op: "and" | "or"; a: Node; b: Node }
  | { op: "not"; a: Node }
  | { op: "atom"; text: string };

export interface FilterContext {
  now?: Date;
  /** Keep completed tasks (the view's own "show completed" decides). */
  includeDone?: boolean;
  projectName: (projectId: string | null) => string | null;
}

export class FilterSyntaxError extends Error {}

function tokenize(q: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) tokens.push(buf.trim());
    buf = "";
  };
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    if (c === '"') {
      const end = q.indexOf('"', i + 1);
      if (end < 0) throw new FilterSyntaxError("Unclosed quote");
      flush();
      tokens.push(q.slice(i, end + 1));
      i = end;
    } else if ("&|!()".includes(c)) {
      flush();
      tokens.push(c);
    } else {
      buf += c;
    }
  }
  flush();
  return tokens;
}

export function parseFilter(q: string): Node {
  const tokens = tokenize(q);
  let i = 0;
  const peek = () => tokens[i];
  const expr = (): Node => {
    let a = term();
    while (peek() === "|") {
      i++;
      a = { op: "or", a, b: term() };
    }
    return a;
  };
  const term = (): Node => {
    let a = factor();
    while (peek() === "&") {
      i++;
      a = { op: "and", a, b: factor() };
    }
    return a;
  };
  const factor = (): Node => {
    const t = tokens[i++];
    if (t === undefined) throw new FilterSyntaxError("Unexpected end of filter");
    if (t === "!") return { op: "not", a: factor() };
    if (t === "(") {
      const e = expr();
      if (tokens[i++] !== ")") throw new FilterSyntaxError("Missing )");
      return e;
    }
    if ("&|)".includes(t)) throw new FilterSyntaxError(`Unexpected "${t}"`);
    return { op: "atom", text: t };
  };
  const node = expr();
  if (i < tokens.length) throw new FilterSyntaxError(`Unexpected "${tokens[i]}"`);
  return node;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

function matchAtom(text: string, task: Task, ctx: FilterContext): boolean {
  const now = ctx.now ?? new Date();
  const today = toDateStr(now);
  const day = task.due ? dueDay(task.due) : null;
  const t = text.toLowerCase();

  if (t.startsWith('"')) return task.title.toLowerCase().includes(t.slice(1, -1));
  if (t === "today") return day === today;
  if (t === "tomorrow") return day === toDateStr(addDays(now, 1));
  if (t === "overdue") return day !== null && day < today;
  if (t === "no date") return day === null;
  if (t === "recurring") return Boolean(task.recurrence);
  if (t === "no label" || t === "no labels") return task.labels.length === 0;
  if (t === "no person") return !task.person;
  if (t === "sub-task" || t === "subtask") return task.parentId !== null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:next\s+)?(\d+)\s+days?$/))) {
    const end = toDateStr(addDays(startOfDay(now), Number(m[1])));
    return day !== null && day >= today && day <= end;
  }
  if ((m = t.match(/^p([1-4])$/))) return task.priority === Number(m[1]);
  if (t.startsWith("#")) return norm(ctx.projectName(task.projectId) ?? "") === norm(t.slice(1));
  if (t.startsWith("@")) return task.labels.some((l) => norm(l) === norm(t.slice(1)));
  if (t.startsWith("+")) return norm(task.person ?? "") === norm(t.slice(1));
  // Anything else: title search.
  return task.title.toLowerCase().includes(t);
}

function evaluate(node: Node, task: Task, ctx: FilterContext): boolean {
  switch (node.op) {
    case "and":
      return evaluate(node.a, task, ctx) && evaluate(node.b, task, ctx);
    case "or":
      return evaluate(node.a, task, ctx) || evaluate(node.b, task, ctx);
    case "not":
      return !evaluate(node.a, task, ctx);
    case "atom":
      return matchAtom(node.text, task, ctx);
  }
}

/** Open tasks matching `query`. Throws FilterSyntaxError on bad input. */
export function applyFilter(query: string, tasks: Task[], ctx: FilterContext): Task[] {
  const node = parseFilter(query);
  return tasks.filter((t) => (ctx.includeDone || !t.done) && evaluate(node, t, ctx));
}

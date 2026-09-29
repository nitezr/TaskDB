import type { NotionPage } from "./client";
import type { Priority, TaskFields } from "../types";

/** Property names of the auto-created Tasks data source. */
export const P = {
  title: "Name",
  done: "Done",
  due: "Due",
  priority: "Priority",
  projectId: "Project",
  labels: "Labels",
  person: "Person",
  recurrence: "Recurrence",
  parentId: "Parent item",
  reminder: "Reminder",
  order: "Order",
  completedAt: "Completed at",
  notes: "Notes",
  section: "Section",
  deadline: "Deadline",
  duration: "Duration (min)",
} as const satisfies Record<keyof TaskFields, string>;

const text = (s: string) => [{ type: "text", text: { content: s } }];
/** Notion caps each rich-text item at 2,000 characters. */
const longText = (s: string) => {
  const out = [];
  for (let i = 0; i < s.length; i += 2000) out.push({ type: "text", text: { content: s.slice(i, i + 2000) } });
  return out;
};
const date = (d: string | null) => (d ? { start: d } : null);
const select = (name: string | null) => (name ? { name } : null);

/**
 * Converts changed fields to a Notion properties payload.
 * `resolveTask` maps a local task id to its Notion page id (null if not pushed yet).
 */
export function toProperties(
  fields: Partial<TaskFields>,
  resolveTask: (localId: string) => string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields) as [keyof TaskFields, any][]) {
    const name = P[key];
    switch (key) {
      case "title":
        out[name] = { title: text(value) };
        break;
      case "done":
        out[name] = { checkbox: value };
        break;
      case "due":
      case "reminder":
      case "completedAt":
      case "deadline":
        out[name] = { date: date(value) };
        break;
      case "priority":
        out[name] = { select: select(`p${value}`) };
        break;
      case "person":
        out[name] = { select: select(value) };
        break;
      case "labels":
        out[name] = { multi_select: (value as string[]).map((n) => ({ name: n })) };
        break;
      case "recurrence":
        out[name] = { rich_text: value ? text(value) : [] };
        break;
      case "notes":
        out[name] = { rich_text: value ? longText(value) : [] };
        break;
      case "section":
        out[name] = { select: select(value) };
        break;
      case "order":
      case "duration":
        out[name] = { number: value };
        break;
      case "projectId":
        out[name] = { relation: value ? [{ id: value }] : [] };
        break;
      case "parentId": {
        const notionId = value ? resolveTask(value) : null;
        if (value && !notionId) throw new UnresolvedRelation(value);
        out[name] = { relation: notionId ? [{ id: notionId }] : [] };
        break;
      }
    }
  }
  return out;
}

export class UnresolvedRelation extends Error {
  constructor(readonly localId: string) {
    super(`Relation target ${localId} has not been pushed yet`);
  }
}

const plain = (rich: any[] | undefined) => (rich ?? []).map((r) => r.plain_text ?? r.text?.content ?? "").join("");

/**
 * Reads a page into task fields. Relation values are Notion page ids;
 * the engine maps parent ids back to local ids.
 */
export function fromPage(page: NotionPage): TaskFields {
  const p = page.properties;
  const prio = Number(String(p[P.priority]?.select?.name ?? "p4").replace("p", ""));
  return {
    title: plain(p[P.title]?.title),
    done: Boolean(p[P.done]?.checkbox),
    due: p[P.due]?.date?.start ?? null,
    priority: ([1, 2, 3, 4].includes(prio) ? prio : 4) as Priority,
    projectId: p[P.projectId]?.relation?.[0]?.id ?? null,
    labels: (p[P.labels]?.multi_select ?? []).map((o: any) => o.name),
    person: p[P.person]?.select?.name ?? null,
    recurrence: plain(p[P.recurrence]?.rich_text) || null,
    parentId: p[P.parentId]?.relation?.[0]?.id ?? null,
    reminder: p[P.reminder]?.date?.start ?? null,
    order: p[P.order]?.number ?? 0,
    completedAt: p[P.completedAt]?.date?.start ?? null,
    notes: plain(p[P.notes]?.rich_text) || null,
    section: p[P.section]?.select?.name ?? null,
    deadline: p[P.deadline]?.date?.start ?? null,
    duration: p[P.duration]?.number ?? null,
  };
}

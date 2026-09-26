export type Priority = 1 | 2 | 3 | 4;

/** Fields the user can edit. Relation fields hold local task ids / Notion project ids. */
export interface TaskFields {
  title: string;
  done: boolean;
  due: string | null;
  priority: Priority;
  projectId: string | null;
  labels: string[];
  person: string | null;
  recurrence: string | null;
  parentId: string | null;
  reminder: string | null;
  order: number;
  completedAt: string | null;
}

export interface Task extends TaskFields {
  /** Stable local id. Equals notionId for tasks that were first seen in Notion. */
  id: string;
  /** Null until the create has been pushed. */
  notionId: string | null;
  /** Notion last_edited_time of the version we hold (minute precision). */
  remoteEditedAt: string | null;
  /** Set when Notion rejected a write that won't succeed on retry. */
  syncError: string | null;
}

export const DEFAULT_FIELDS: TaskFields = {
  title: "",
  done: false,
  due: null,
  priority: 4,
  projectId: null,
  labels: [],
  person: null,
  recurrence: null,
  parentId: null,
  reminder: null,
  order: 0,
  completedAt: null,
};

export type OutboxOp =
  | { seq: number; kind: "create"; taskId: string; fields: Partial<TaskFields> }
  | { seq: number; kind: "update"; taskId: string; fields: Partial<TaskFields> }
  | { seq: number; kind: "delete"; taskId: string };

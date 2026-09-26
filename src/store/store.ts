import type { OutboxOp, Task } from "../types";

/**
 * Local copy of the user's tasks. The UI reads only from here.
 * Production: SQLite via tauri-plugin-sql. Tests: MemoryStore.
 */
export interface Store {
  getTask(id: string): Task | undefined;
  getTaskByNotionId(notionId: string): Task | undefined;
  putTask(task: Task): void;
  removeTask(id: string): void;
  allTasks(): Task[];

  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;

  loadOutbox(): OutboxOp[];
  saveOutbox(ops: OutboxOp[]): void;
}

export class MemoryStore implements Store {
  private tasks = new Map<string, Task>();
  private meta = new Map<string, string>();
  private outbox: OutboxOp[] = [];

  getTask(id: string) {
    return this.tasks.get(id);
  }
  getTaskByNotionId(notionId: string) {
    for (const t of this.tasks.values()) if (t.notionId === notionId) return t;
    return undefined;
  }
  putTask(task: Task) {
    this.tasks.set(task.id, structuredClone(task));
  }
  removeTask(id: string) {
    this.tasks.delete(id);
  }
  allTasks() {
    return [...this.tasks.values()];
  }
  getMeta(key: string) {
    return this.meta.get(key);
  }
  setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }
  loadOutbox() {
    return structuredClone(this.outbox);
  }
  saveOutbox(ops: OutboxOp[]) {
    this.outbox = structuredClone(ops);
  }
}

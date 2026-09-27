import { NotionClient, NotionError, type NotionPage } from "../notion/client";
import { fromPage, toProperties, UnresolvedRelation } from "../notion/mapping";
import type { Store } from "../store/store";
import { DEFAULT_FIELDS, type Task, type TaskFields } from "../types";
import { Outbox } from "./outbox";

/**
 * Notion stores last_edited_time rounded to the minute, so a delta query
 * must look back a little to avoid missing edits made in the same minute.
 */
const CURSOR_OVERLAP_MS = 2 * 60_000;
const PAGE_SIZE = 100;

export interface SyncEngineOptions {
  client: NotionClient;
  store: Store;
  tasksDataSourceId: string;
  newId?: () => string;
  onChange?: () => void;
}

/**
 * Local-first sync. The UI writes to the store and returns instantly;
 * push() drains queued changes to Notion and pull() fetches only what changed.
 */
export class SyncEngine {
  readonly outbox: Outbox;
  private pushing: Promise<void> | null = null;
  private pulling: Promise<void> | null = null;
  /**
   * Push and pull never overlap: a pull racing an in-flight create would
   * see the new page before we know its id and import it as a duplicate.
   */
  private lock: Promise<unknown> = Promise.resolve();
  private readonly newId: () => string;

  constructor(private readonly opts: SyncEngineOptions) {
    this.outbox = new Outbox(opts.store.loadOutbox(), (ops) => opts.store.saveOutbox(ops));
    this.newId = opts.newId ?? (() => `local-${crypto.randomUUID()}`);
  }

  // ---- Local writes (instant, optimistic) ----

  createTask(fields: Partial<TaskFields>): Task {
    const task: Task = {
      ...DEFAULT_FIELDS,
      ...fields,
      id: this.newId(),
      notionId: null,
      remoteEditedAt: null,
      syncError: null,
      createdAt: new Date().toISOString(),
    };
    this.opts.store.putTask(task);
    this.outbox.enqueue({ kind: "create", taskId: task.id, fields: pickFields(task) });
    this.changed();
    return task;
  }

  updateTask(id: string, fields: Partial<TaskFields>): void {
    const task = this.opts.store.getTask(id);
    if (!task) return;
    this.opts.store.putTask({ ...task, ...fields, syncError: null });
    this.outbox.enqueue({ kind: "update", taskId: id, fields });
    this.changed();
  }

  deleteTask(id: string): void {
    const task = this.opts.store.getTask(id);
    if (!task) return;
    if (task.notionId) this.opts.store.setMeta(`deleted:${id}`, task.notionId);
    this.opts.store.removeTask(id);
    this.outbox.enqueue({ kind: "delete", taskId: id });
    this.changed();
  }

  /** Re-sends a task that Notion rejected earlier (after the user fixed it). */
  retry(id: string): void {
    const task = this.opts.store.getTask(id);
    if (!task) return;
    this.opts.store.putTask({ ...task, syncError: null });
    this.outbox.enqueue({ kind: task.notionId ? "update" : "create", taskId: id, fields: pickFields(task) });
    this.changed();
  }

  // ---- Push ----

  /** Sends queued changes one at a time through the shared rate limiter. */
  push(): Promise<void> {
    this.pushing ??= this.exclusive(() => this.drain()).finally(() => (this.pushing = null));
    return this.pushing;
  }

  private async drain(): Promise<void> {
    const { store, client, tasksDataSourceId } = this.opts;
    // Tasks whose ops must wait for another task's create to land first.
    const blocked = new Set<string>();

    for (let op = this.outbox.next(blocked); op; op = this.outbox.next(blocked)) {
      const task = store.getTask(op.taskId);
      try {
        if (op.kind === "delete") {
          const notionId = store.getMeta(`deleted:${op.taskId}`) || null;
          if (notionId) await client.trashPage(notionId);
          store.setMeta(`deleted:${op.taskId}`, "");
        } else if (op.kind === "create") {
          const page = await client.createPage(tasksDataSourceId, toProperties(op.fields, this.resolveTask));
          this.applyPushed(op.taskId, page);
        } else if (task?.notionId) {
          const page = await client.updatePage(task.notionId, toProperties(op.fields, this.resolveTask));
          this.applyPushed(op.taskId, page);
        }
        this.outbox.complete(op.seq);
      } catch (e) {
        if (e instanceof UnresolvedRelation && this.outbox.hasPending(e.localId)) {
          blocked.add(op.taskId);
          this.outbox.release();
          continue;
        }
        if (e instanceof NotionError && e.retryable) {
          // Offline or Notion is struggling: keep the queue, try again next cycle.
          this.outbox.release();
          return;
        }
        // Permanent rejection (validation, permissions): drop the op, flag the task.
        this.outbox.complete(op.seq);
        if (task) store.putTask({ ...task, syncError: e instanceof Error ? e.message : String(e) });
        this.changed();
      }
    }
  }

  private resolveTask = (localId: string): string | null => this.opts.store.getTask(localId)?.notionId ?? null;

  private applyPushed(taskId: string, page: NotionPage): void {
    const current = this.opts.store.getTask(taskId);
    if (!current) {
      // Deleted locally while the create was in flight: remember the page so the delete can trash it.
      this.opts.store.setMeta(`deleted:${taskId}`, page.id);
      return;
    }
    this.opts.store.putTask({ ...current, notionId: page.id, remoteEditedAt: page.last_edited_time });
  }

  // ---- Pull ----

  /**
   * Delta pull: one query for everything edited since the last cursor.
   * An idle workspace costs one request per poll, whatever its size.
   */
  pull(): Promise<void> {
    this.pulling ??= this.exclusive(() => this.fetchChanges()).finally(() => (this.pulling = null));
    return this.pulling;
  }

  private async fetchChanges(): Promise<void> {
    const { store } = this.opts;
    const cursor = store.getMeta("pullCursor");
    const filter = cursor
      ? {
          timestamp: "last_edited_time",
          last_edited_time: { on_or_after: new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() },
        }
      : undefined;

    let maxSeen = cursor ?? "";
    let anyChange = false;
    for await (const page of this.queryAll(filter)) {
      if (page.last_edited_time > maxSeen) maxSeen = page.last_edited_time;
      anyChange = this.applyRemote(page) || anyChange;
    }
    if (maxSeen) store.setMeta("pullCursor", maxSeen);
    if (anyChange) this.changed();
  }

  /**
   * Full pass over the data source. Deletions don't show up in delta queries,
   * so run this on launch and every ~30 minutes.
   */
  reconcile(): Promise<void> {
    return this.exclusive(() => this.fullPass());
  }

  private async fullPass(): Promise<void> {
    const { store } = this.opts;
    const seen = new Set<string>();
    let maxSeen = store.getMeta("pullCursor") ?? "";
    let anyChange = false;
    for await (const page of this.queryAll(undefined)) {
      seen.add(page.id);
      if (page.last_edited_time > maxSeen) maxSeen = page.last_edited_time;
      anyChange = this.applyRemote(page) || anyChange;
    }
    const pending = this.outbox.pendingIds();
    for (const task of store.allTasks()) {
      if (task.notionId && !seen.has(task.notionId) && !pending.has(task.id)) {
        store.removeTask(task.id);
        anyChange = true;
      }
    }
    if (maxSeen) store.setMeta("pullCursor", maxSeen);
    if (anyChange) this.changed();
  }

  private async *queryAll(filter: unknown): AsyncGenerator<NotionPage> {
    let startCursor: string | undefined;
    do {
      const res = await this.opts.client.queryDataSource(this.opts.tasksDataSourceId, {
        page_size: PAGE_SIZE,
        sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
        ...(filter ? { filter } : {}),
        ...(startCursor ? { start_cursor: startCursor } : {}),
      });
      yield* res.results;
      startCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (startCursor);
  }

  /** Returns true if the local copy changed. */
  private applyRemote(page: NotionPage): boolean {
    const { store } = this.opts;
    const local = store.getTaskByNotionId(page.id);

    if (page.in_trash || page.archived) {
      if (local && !this.outbox.hasPending(local.id)) {
        store.removeTask(local.id);
        return true;
      }
      return false;
    }
    // Local edits not yet pushed win; the next pull after the push brings the merged state.
    if (local && this.outbox.hasPending(local.id)) return false;
    if (local?.remoteEditedAt && page.last_edited_time < local.remoteEditedAt) return false;

    const remote = fromPage(page);
    // Remote-origin tasks use the Notion id as their local id, so unknown parents resolve later.
    if (remote.parentId) remote.parentId = store.getTaskByNotionId(remote.parentId)?.id ?? remote.parentId;

    if (local && sameFields(pickFields(local), remote)) {
      if (local.remoteEditedAt !== page.last_edited_time) {
        store.putTask({ ...local, remoteEditedAt: page.last_edited_time });
      }
      return false;
    }
    store.putTask({
      ...remote,
      id: local?.id ?? page.id,
      notionId: page.id,
      remoteEditedAt: page.last_edited_time,
      syncError: null,
      createdAt: page.created_time ?? local?.createdAt ?? null,
    });
    return true;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => {});
    return run;
  }

  private changed(): void {
    this.opts.onChange?.();
  }
}

function pickFields(t: TaskFields): TaskFields {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_FIELDS)) out[k] = (t as any)[k];
  return out as unknown as TaskFields;
}

function sameFields(a: TaskFields, b: TaskFields): boolean {
  return JSON.stringify(a) === JSON.stringify(pickFields(b));
}

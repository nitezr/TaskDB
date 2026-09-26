import Database from "@tauri-apps/plugin-sql";
import type { OutboxOp, Task } from "../types";
import { MemoryStore } from "./store";

/**
 * Memory-first store persisted to SQLite. Reads stay synchronous (the UI and
 * sync engine never wait on disk); writes are queued and flushed in order.
 */
export class SqliteStore extends MemoryStore {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly db: Database) {
    super();
  }

  static async open(path = "sqlite:taskdb.db"): Promise<SqliteStore> {
    const db = await Database.load(path);
    await db.execute("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
    await db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const store = new SqliteStore(db);

    const tasks = await db.select<{ data: string }[]>("SELECT data FROM tasks");
    for (const row of tasks) MemoryStore.prototype.putTask.call(store, JSON.parse(row.data));
    const meta = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM meta");
    for (const row of meta) MemoryStore.prototype.setMeta.call(store, row.key, row.value);
    const outbox = store.getMeta("outbox");
    if (outbox) MemoryStore.prototype.saveOutbox.call(store, JSON.parse(outbox));
    return store;
  }

  /** Resolves once every queued write has hit disk. */
  flushed(): Promise<unknown> {
    return this.queue;
  }

  private write(sql: string, args: unknown[]): void {
    this.queue = this.queue.then(() => this.db.execute(sql, args)).catch((e) => console.error("SQLite write failed", e));
  }

  override putTask(task: Task): void {
    super.putTask(task);
    this.write("INSERT OR REPLACE INTO tasks (id, data) VALUES ($1, $2)", [task.id, JSON.stringify(task)]);
  }

  override removeTask(id: string): void {
    super.removeTask(id);
    this.write("DELETE FROM tasks WHERE id = $1", [id]);
  }

  override setMeta(key: string, value: string): void {
    super.setMeta(key, value);
    this.write("INSERT OR REPLACE INTO meta (key, value) VALUES ($1, $2)", [key, value]);
  }

  override saveOutbox(ops: OutboxOp[]): void {
    super.saveOutbox(ops);
    this.setMeta("outbox", JSON.stringify(ops));
  }

  /** Wipes local data (used on disconnect). Notion is untouched. */
  async clear(): Promise<void> {
    await this.queue;
    await this.db.execute("DELETE FROM tasks");
    await this.db.execute("DELETE FROM meta");
    for (const t of this.allTasks()) super.removeTask(t.id);
  }
}

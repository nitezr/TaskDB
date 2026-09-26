import type { OutboxOp, TaskFields } from "../types";

type NewOp =
  | { kind: "create" | "update"; taskId: string; fields: Partial<TaskFields> }
  | { kind: "delete"; taskId: string };

/**
 * Persistent queue of local changes waiting to reach Notion.
 * Changes to the same task are merged so ten quick edits cost one request,
 * and a task created then deleted offline never costs any.
 */
export class Outbox {
  private ops: OutboxOp[];
  private nextSeq: number;
  /** Seq of the op currently being sent; it must not be merged into. */
  private inFlight: number | null = null;

  constructor(
    initial: OutboxOp[],
    private readonly persist: (ops: OutboxOp[]) => void,
  ) {
    this.ops = initial;
    this.nextSeq = initial.reduce((m, o) => Math.max(m, o.seq), 0) + 1;
  }

  get size(): number {
    return this.ops.length;
  }

  hasPending(taskId: string): boolean {
    return this.ops.some((o) => o.taskId === taskId);
  }

  pendingIds(): Set<string> {
    return new Set(this.ops.map((o) => o.taskId));
  }

  enqueue(op: NewOp): void {
    const idx = this.ops.findIndex((o) => o.taskId === op.taskId && o.seq !== this.inFlight);
    const prev = idx >= 0 ? this.ops[idx] : undefined;

    if (!prev) {
      this.ops.push({ ...op, seq: this.nextSeq++ } as OutboxOp);
    } else if (op.kind === "delete") {
      if (prev.kind === "create") {
        // Never reached Notion, so nothing to trash.
        this.ops.splice(idx, 1);
      } else {
        this.ops[idx] = { seq: prev.seq, kind: "delete", taskId: op.taskId };
      }
    } else if (prev.kind !== "delete") {
      prev.fields = { ...prev.fields, ...op.fields };
    }
    this.persist(this.ops);
  }

  /** Oldest op whose task is not in `skip`, marked in flight so later edits queue behind it. */
  next(skip: Set<string> = new Set()): OutboxOp | undefined {
    const op = this.ops.find((o) => !skip.has(o.taskId));
    this.inFlight = op?.seq ?? null;
    return op;
  }

  complete(seq: number): void {
    this.ops = this.ops.filter((o) => o.seq !== seq);
    if (this.inFlight === seq) this.inFlight = null;
    this.persist(this.ops);
  }

  release(): void {
    this.inFlight = null;
  }
}

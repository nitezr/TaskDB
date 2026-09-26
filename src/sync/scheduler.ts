import type { SyncEngine } from "./engine";

export type Activity = "focused" | "background" | "idle";

/** How often to check Notion for remote edits, by what the user is doing. */
export const PULL_INTERVAL_MS: Record<Activity, number> = {
  focused: 15_000,
  background: 120_000,
  idle: 300_000,
};
export const PUSH_DEBOUNCE_MS = 400;
export const PUSH_RETRY_MS = 30_000;
export const RECONCILE_MS = 30 * 60_000;
const FOCUS_PULL_MIN_GAP_MS = 5_000;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Decides when the engine talks to Notion. Local edits push after a short
 * debounce; pulls slow down when the window is hidden or the user is away.
 */
export class SyncScheduler {
  private activity: Activity = "focused";
  private pullTimer: Timer | null = null;
  private pushTimer: Timer | null = null;
  private reconcileTimer: Timer | null = null;
  private lastPull = 0;

  constructor(
    private readonly engine: SyncEngine,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    void this.run(() => this.engine.reconcile());
    this.lastPull = this.now();
    this.reconcileTimer = setInterval(() => void this.run(() => this.engine.reconcile()), RECONCILE_MS);
    this.schedulePull();
  }

  stop(): void {
    for (const t of [this.pullTimer, this.pushTimer]) if (t) clearTimeout(t);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  /** Call after every local edit. Bursts of edits become one push. */
  localChange(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.flush(), PUSH_DEBOUNCE_MS);
  }

  setActivity(next: Activity): void {
    const wasFocused = this.activity === "focused";
    this.activity = next;
    if (next === "focused" && !wasFocused && this.now() - this.lastPull > FOCUS_PULL_MIN_GAP_MS) {
      void this.pullNow();
    }
    this.schedulePull();
  }

  private async flush(): Promise<void> {
    this.pushTimer = null;
    await this.run(() => this.engine.push());
    if (this.engine.outbox.size > 0 && !this.pushTimer) {
      this.pushTimer = setTimeout(() => void this.flush(), PUSH_RETRY_MS);
    }
  }

  private async pullNow(): Promise<void> {
    this.lastPull = this.now();
    await this.run(() => this.engine.pull());
  }

  private schedulePull(): void {
    if (this.pullTimer) clearTimeout(this.pullTimer);
    this.pullTimer = setTimeout(async () => {
      await this.pullNow();
      this.schedulePull();
    }, PULL_INTERVAL_MS[this.activity]);
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch {
      // Retryable failures leave state intact; the next tick tries again.
    }
  }
}

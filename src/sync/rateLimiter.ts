import { type Clock, realClock } from "./clock";

export interface RateLimiterOptions {
  /** Sustained requests per second. Notion allows ~3 on average; stay under it. */
  ratePerSec?: number;
  /** Max requests that can go out back-to-back after an idle period. */
  burst?: number;
  clock?: Clock;
}

/**
 * Token bucket shared by every Notion call the app makes.
 * Callers are served strictly in arrival order, and a 429 pauses everyone.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private blockedUntil = 0;
  private chain: Promise<void> = Promise.resolve();
  private readonly rate: number;
  private readonly burst: number;
  private readonly clock: Clock;

  constructor(opts: RateLimiterOptions = {}) {
    this.rate = opts.ratePerSec ?? 2.5;
    this.burst = opts.burst ?? 3;
    this.clock = opts.clock ?? realClock;
    this.tokens = this.burst;
    this.lastRefill = this.clock.now();
  }

  /** Resolves when the caller may send one request. */
  acquire(): Promise<void> {
    const turn = this.chain.then(() => this.waitForToken());
    this.chain = turn.catch(() => {});
    return turn;
  }

  /** Called on 429: nobody sends until the Retry-After window has passed. */
  pauseFor(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.clock.now() + ms);
    this.tokens = 0;
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      if (now < this.blockedUntil) {
        await this.clock.sleep(this.blockedUntil - now);
        continue;
      }
      this.refill(now);
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await this.clock.sleep(Math.ceil(((1 - this.tokens) / this.rate) * 1000));
    }
  }

  private refill(now: number): void {
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
  }
}

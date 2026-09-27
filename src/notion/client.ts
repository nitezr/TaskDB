import { type Clock, realClock } from "../sync/clock";
import { RateLimiter } from "../sync/rateLimiter";

export const NOTION_VERSION = "2025-09-03";
const BASE_URL = "https://api.notion.com/v1";

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    /** True when retrying later may succeed (network, 429, 5xx). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface NotionClientOptions {
  token: string;
  /** In Tauri, pass the HTTP plugin's fetch (no CORS). */
  fetch?: FetchLike;
  limiter?: RateLimiter;
  clock?: Clock;
  maxAttempts?: number;
}

export interface NotionPage {
  id: string;
  last_edited_time: string;
  created_time?: string;
  icon?: { type: string; emoji?: string } | null;
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, any>;
}

export interface QueryResult {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export class NotionClient {
  private readonly fetchFn: FetchLike;
  private readonly limiter: RateLimiter;
  private readonly clock: Clock;
  private readonly maxAttempts: number;
  /** Total requests sent; surfaced in diagnostics to watch the budget. */
  requestCount = 0;

  constructor(private readonly opts: NotionClientOptions) {
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.clock = opts.clock ?? realClock;
    this.limiter = opts.limiter ?? new RateLimiter({ clock: this.clock });
    this.maxAttempts = opts.maxAttempts ?? 5;
  }

  createPage(dataSourceId: string, properties: Record<string, unknown>): Promise<NotionPage> {
    return this.request("POST", "/pages", {
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    });
  }

  updatePage(pageId: string, properties: Record<string, unknown>): Promise<NotionPage> {
    return this.request("PATCH", `/pages/${pageId}`, { properties });
  }

  trashPage(pageId: string): Promise<NotionPage> {
    return this.request("PATCH", `/pages/${pageId}`, { in_trash: true });
  }

  queryDataSource(dataSourceId: string, body: Record<string, unknown>): Promise<QueryResult> {
    return this.request("POST", `/data_sources/${dataSourceId}/query`, body);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: NotionError | null = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      await this.limiter.acquire();
      this.requestCount++;
      let res: Response;
      try {
        res = await this.fetchFn(BASE_URL + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.opts.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        lastError = new NotionError(`Network error: ${String(e)}`, 0, null, true);
        await this.clock.sleep(backoff(attempt));
        continue;
      }

      if (res.ok) return (await res.json()) as T;

      const payload = await res.json().catch(() => ({}) as any);
      const code: string | null = payload?.code ?? null;
      const message: string = payload?.message ?? `HTTP ${res.status}`;

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
        this.limiter.pauseFor(waitMs);
        lastError = new NotionError(message, 429, code, true);
        continue;
      }
      if (res.status >= 500 || code === "conflict_error") {
        lastError = new NotionError(message, res.status, code, true);
        await this.clock.sleep(backoff(attempt));
        continue;
      }
      throw new NotionError(message, res.status, code, false);
    }
    throw lastError ?? new NotionError("Request failed", 0, null, true);
  }
}

function backoff(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt);
}

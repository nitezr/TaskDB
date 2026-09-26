import type { FetchLike, NotionPage } from "../notion/client";

/** In-memory Notion API for tests. Records every request. */
export class FakeNotion {
  pages = new Map<string, NotionPage>();
  requests: { method: string; path: string; body: any }[] = [];
  /** Responses to return before normal handling (e.g. 429s, 500s). */
  failures: { status: number; headers?: Record<string, string>; body?: any }[] = [];
  private seq = 0;
  /** Minute-rounded timestamps, like Notion. */
  minute = Date.parse("2026-09-26T10:00:00.000Z");

  editedAt(): string {
    return new Date(this.minute).toISOString();
  }

  addPage(properties: Record<string, any>): NotionPage {
    const page: NotionPage = { id: `page-${++this.seq}`, last_edited_time: this.editedAt(), properties };
    this.pages.set(page.id, page);
    return page;
  }

  editPage(id: string, properties: Record<string, any>): void {
    const page = this.pages.get(id)!;
    page.properties = { ...page.properties, ...properties };
    page.last_edited_time = this.editedAt();
  }

  fetch: FetchLike = async (url, init) => {
    const path = url.replace("https://api.notion.com/v1", "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.requests.push({ method: String(init.method), path, body });

    const failure = this.failures.shift();
    if (failure) {
      return new Response(JSON.stringify(failure.body ?? { code: "err", message: "fail" }), {
        status: failure.status,
        headers: failure.headers,
      });
    }

    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

    if (init.method === "POST" && path === "/pages") {
      return json(this.addPage(body.properties));
    }
    const pageMatch = path.match(/^\/pages\/(.+)$/);
    if (init.method === "PATCH" && pageMatch) {
      const page = this.pages.get(pageMatch[1]!);
      if (!page) return new Response(JSON.stringify({ code: "object_not_found" }), { status: 404 });
      if (body.in_trash) {
        page.in_trash = true;
        page.last_edited_time = this.editedAt();
      } else {
        this.editPage(page.id, body.properties);
      }
      return json(page);
    }
    if (init.method === "POST" && path.endsWith("/query")) {
      const since = body.filter?.last_edited_time?.on_or_after;
      const all = [...this.pages.values()]
        .filter((p) => !p.in_trash)
        .filter((p) => !since || p.last_edited_time >= since)
        .sort((a, b) => a.last_edited_time.localeCompare(b.last_edited_time));
      const start = Number(body.start_cursor ?? 0);
      const slice = all.slice(start, start + body.page_size);
      const more = start + body.page_size < all.length;
      return json({ results: slice, has_more: more, next_cursor: more ? String(start + body.page_size) : null });
    }
    return new Response("{}", { status: 404 });
  };
}

import type { NotionClient, NotionPage } from "./client";

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  order: number;
}

function fromPage(page: NotionPage): Project {
  const p = page.properties;
  return {
    id: page.id,
    name: (p.Name?.title ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("") || "Untitled",
    color: p.Color?.select?.name ?? "gray",
    archived: Boolean(p.Archived?.checkbox),
    order: p.Order?.number ?? 0,
  };
}

/**
 * Projects change rarely, so they skip the outbox: the list is re-read on
 * reconcile (a handful of requests) and edits go straight to Notion.
 */
export class ProjectsApi {
  constructor(
    private readonly client: NotionClient,
    private readonly dataSourceId: string,
  ) {}

  async list(): Promise<Project[]> {
    const out: Project[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.queryDataSource(this.dataSourceId, {
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      out.push(...res.results.filter((p) => !p.in_trash).map(fromPage));
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async create(name: string, color: string, order: number): Promise<Project> {
    const page = await this.client.createPage(this.dataSourceId, {
      Name: { title: [{ type: "text", text: { content: name } }] },
      Color: { select: { name: color } },
      Order: { number: order },
    });
    return fromPage(page);
  }

  async update(id: string, fields: Partial<Pick<Project, "name" | "color" | "archived">>): Promise<void> {
    const props: Record<string, unknown> = {};
    if (fields.name !== undefined) props.Name = { title: [{ type: "text", text: { content: fields.name } }] };
    if (fields.color !== undefined) props.Color = { select: { name: fields.color } };
    if (fields.archived !== undefined) props.Archived = { checkbox: fields.archived };
    await this.client.updatePage(id, props);
  }
}

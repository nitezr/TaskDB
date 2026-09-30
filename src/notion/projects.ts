import type { NotionClient, NotionPage } from "./client";

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  order: number;
  /** Shown before the name; stored as the Notion page icon. */
  emoji: string | null;
  favorite: boolean;
  /** Parent project for nesting (e.g. "Work" → "Acme Launch"). */
  parentId: string | null;
  /** Section names in display order. Tasks reference them by name. */
  sections: string[];
  /** Things-style project notes: what this project is and what "done" means. */
  notes: string | null;
}

/** Property names of the auto-created Projects data source. */
export const PP = {
  name: "Name",
  color: "Color",
  archived: "Archived",
  order: "Order",
  favorite: "Favorite",
  parentId: "Parent project",
  sections: "Sections",
  notes: "Notes",
} as const;

const plain = (rich: any[] | undefined) =>
  (rich ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("");

export function projectFromPage(page: NotionPage): Project {
  const p = page.properties;
  return {
    id: page.id,
    name: plain(p[PP.name]?.title) || "Untitled",
    color: p[PP.color]?.select?.name ?? "gray",
    archived: Boolean(p[PP.archived]?.checkbox),
    order: p[PP.order]?.number ?? 0,
    emoji: page.icon?.type === "emoji" ? (page.icon.emoji ?? null) : null,
    favorite: Boolean(p[PP.favorite]?.checkbox),
    parentId: p[PP.parentId]?.relation?.[0]?.id ?? null,
    sections: plain(p[PP.sections]?.rich_text)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    notes: plain(p[PP.notes]?.rich_text) || null,
  };
}

type Editable = Partial<Omit<Project, "id">>;

function toProperties(fields: Editable): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const text = (s: string) => [{ type: "text", text: { content: s } }];
  if (fields.name !== undefined) props[PP.name] = { title: text(fields.name) };
  if (fields.color !== undefined) props[PP.color] = { select: { name: fields.color } };
  if (fields.archived !== undefined) props[PP.archived] = { checkbox: fields.archived };
  if (fields.order !== undefined) props[PP.order] = { number: fields.order };
  if (fields.favorite !== undefined) props[PP.favorite] = { checkbox: fields.favorite };
  if (fields.parentId !== undefined) props[PP.parentId] = { relation: fields.parentId ? [{ id: fields.parentId }] : [] };
  if (fields.notes !== undefined) {
    const chunks = (fields.notes ?? "").match(/[\s\S]{1,2000}/g) ?? [];
    props[PP.notes] = { rich_text: chunks.map((c) => ({ type: "text", text: { content: c } })) };
  }
  if (fields.sections !== undefined) props[PP.sections] = { rich_text: fields.sections.length ? text(fields.sections.join("\n")) : [] };
  return props;
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
      out.push(...res.results.filter((p) => !p.in_trash).map(projectFromPage));
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async create(fields: Editable & { name: string }): Promise<Project> {
    const page = await this.client.request<NotionPage>("POST", "/pages", {
      parent: { type: "data_source_id", data_source_id: this.dataSourceId },
      properties: toProperties({ color: "gray", ...fields }),
      ...(fields.emoji ? { icon: { type: "emoji", emoji: fields.emoji } } : {}),
    });
    return projectFromPage(page);
  }

  async update(id: string, fields: Editable): Promise<void> {
    const body: Record<string, unknown> = { properties: toProperties(fields) };
    if (fields.emoji !== undefined) body.icon = fields.emoji ? { type: "emoji", emoji: fields.emoji } : null;
    await this.client.request("PATCH", `/pages/${id}`, body);
  }

  /** Moves the project page to the trash. Its tasks keep a dangling relation and show in Inbox. */
  async trash(id: string): Promise<void> {
    await this.client.trashPage(id);
  }
}

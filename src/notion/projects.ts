import type { NotionClient, NotionPage } from "./client";
import { type Columns, describeColumn, titleOfPage, titlePropertyOf } from "./columns";

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  order: number;
  /** Shown before the name; stored as the Notion page icon for linked projects. */
  emoji: string | null;
  /** A linked page's image icon (custom emoji, upload or link), when it has no plain emoji. */
  iconUrl?: string | null;
  favorite: boolean;
  /** Parent project for nesting (e.g. "Work" → "Acme Launch"). */
  parentId: string | null;
  /** Section names in display order. Tasks reference them by name. */
  sections: string[];
  /** Things-style project notes: what this project is and what "done" means. */
  notes: string | null;
}

/**
 * Project details TaskDB can keep in a linked Projects database, when it has a property with
 * this name and type (the database earlier TaskDB versions created has them all; a user's own
 * database often has Notes). Anything else is kept on this Mac.
 */
export const PP = {
  color: ["Color", "select"],
  archived: ["Archived", "checkbox"],
  order: ["Order", "number"],
  favorite: ["Favorite", "checkbox"],
  parentId: ["Parent project", "relation"],
  sections: ["Sections", "rich_text"],
  notes: ["Notes", "rich_text"],
} as const;

type Detail = keyof typeof PP;
type Editable = Partial<Omit<Project, "id">>;
type LocalMeta = Record<string, Editable & { hidden?: boolean }>;

const plain = (rich: any[] | undefined) => (rich ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("");
const text = (s: string) => [{ type: "text", text: { content: s } }];

export function projectFromPage(page: NotionPage): Project {
  const p = page.properties;
  return {
    id: page.id,
    name: titleOfPage(page) || "Untitled",
    color: p[PP.color[0]]?.select?.name ?? "gray",
    archived: Boolean(p[PP.archived[0]]?.checkbox),
    order: p[PP.order[0]]?.number ?? 0,
    emoji: page.icon?.type === "emoji" ? (page.icon.emoji ?? null) : null,
    iconUrl: iconUrlOf(page),
    favorite: Boolean(p[PP.favorite[0]]?.checkbox),
    parentId: p[PP.parentId[0]]?.relation?.[0]?.id ?? null,
    sections: plain(p[PP.sections[0]]?.rich_text)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    notes: plain(p[PP.notes[0]]?.rich_text) || null,
  };
}

export function iconUrlOf(page: NotionPage): string | null {
  const icon: any = page.icon;
  if (!icon) return null;
  return icon.external?.url ?? icon.file?.url ?? icon.custom_emoji?.url ?? null;
}

/** Columns TaskDB adds to a linked Projects database so the sidebar's details live in Notion. */
export function projectDetailColumns(parentDataSourceId: string): Record<string, unknown> {
  return {
    [PP.color[0]]: { select: { options: ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"].map((c) => ({ name: c, color: c === "gray" ? "gray" : c })) } },
    [PP.archived[0]]: { checkbox: {} },
    [PP.order[0]]: { number: {} },
    [PP.favorite[0]]: { checkbox: {} },
    [PP.parentId[0]]: { relation: { data_source_id: parentDataSourceId, type: "single_property", single_property: {} } },
    [PP.sections[0]]: { rich_text: {} },
    [PP.notes[0]]: { rich_text: {} },
  };
}

function detailProperty(key: Detail, value: any): unknown {
  switch (key) {
    case "color":
      return { select: { name: value } };
    case "archived":
    case "favorite":
      return { checkbox: Boolean(value) };
    case "order":
      return { number: value };
    case "parentId":
      return { relation: value ? [{ id: value }] : [] };
    case "sections":
      return { rich_text: value.length ? text(value.join("\n")) : [] };
    case "notes": {
      const chunks: string[] = (value ?? "").match(/[\s\S]{1,2000}/g) ?? [];
      return { rich_text: chunks.map((c) => ({ type: "text", text: { content: c } })) };
    }
  }
}

const NOTION_COLORS: Record<string, string> = { default: "gray" };

/**
 * Projects are whatever the Tasks database's Project column offers: the pages of a linked
 * database, or the options of a select. There is no separate TaskDB Projects database.
 * Sidebar details Notion has no place for (order, nesting, colour, sections…) live on this Mac.
 */
export class ProjectSource {
  constructor(
    private readonly client: NotionClient,
    private readonly tasksDataSourceId: string,
    private readonly columns: Columns,
    private readonly meta: { get(): string | undefined; set(v: string): void },
  ) {}

  private local(): LocalMeta {
    try {
      return JSON.parse(this.meta.get() ?? "{}");
    } catch {
      return {};
    }
  }

  private saveLocal(id: string, fields: Editable & { hidden?: boolean }): void {
    const all = this.local();
    all[id] = { ...all[id], ...fields };
    this.meta.set(JSON.stringify(all));
  }

  /** Which details the linked database can hold. */
  private backed(key: Detail): boolean {
    if (this.columns.project.kind !== "relation") return false;
    return this.columns.linkedProjectProps[PP[key][0]] === PP[key][1];
  }

  /** Built from the last column refresh; costs no requests. */
  list(): Project[] {
    const col = this.columns.project;
    const local = this.local();
    let base: Project[] = [];
    if (col.kind === "relation") {
      const pages = this.columns.linkedProjectPages;
      base = pages.length
        ? pages.map(projectFromPage)
        : this.columns.linkedProjects.map((p) => ({ ...projectFromPage({ id: p.id, last_edited_time: "", properties: {} }), name: p.name, emoji: p.emoji, iconUrl: p.iconUrl ?? null }));
    } else if (col.kind === "select" || col.kind === "multi_select") {
      base = col.options.map((o, i) => ({
        id: o.id,
        name: o.name,
        color: NOTION_COLORS[o.color] ?? o.color,
        archived: false,
        order: i + 1,
        emoji: null,
        favorite: false,
        parentId: null,
        sections: [],
        notes: null,
      }));
    }
    return base
      .filter((p) => !local[p.id]?.hidden)
      .map((p) => {
        const mine = { ...local[p.id] };
        delete mine.hidden;
        // Details the linked database holds come from Notion; the rest from this Mac.
        for (const key of Object.keys(PP) as Detail[]) if (this.backed(key)) delete mine[key];
        if (col.kind === "relation") delete mine.emoji;
        delete mine.name;
        return { ...p, ...mine };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async create(fields: Editable & { name: string }): Promise<Project> {
    const col = this.columns.project;
    const name = fields.name.trim();
    let id: string;
    if (col.kind === "relation" && col.dataSourceId) {
      const titleProp = await titlePropertyOf(this.client, col.dataSourceId);
      const properties: Record<string, unknown> = { [titleProp]: { title: text(name) } };
      for (const key of Object.keys(PP) as Detail[]) {
        if (fields[key] !== undefined && this.backed(key)) properties[PP[key][0]] = detailProperty(key, fields[key]);
      }
      const page: NotionPage = await this.client.request("POST", "/pages", {
        parent: { type: "data_source_id", data_source_id: col.dataSourceId },
        properties,
        ...(fields.emoji ? { icon: { type: "emoji", emoji: fields.emoji } } : {}),
      });
      id = page.id;
      this.columns.linkedProjectPages = [...this.columns.linkedProjectPages, page];
      this.columns.linkedProjects = [...this.columns.linkedProjects, { id, name, emoji: fields.emoji ?? null }];
    } else if (col.kind === "select" || col.kind === "multi_select") {
      const options = [...col.options.map(({ id, name, color }) => ({ id, name, color })), { name, color: notionColor(fields.color) }];
      await this.patchOptions(options);
      id = this.columns.project.options.find((o) => o.name === name)?.id ?? name;
    } else {
      throw new Error(`TaskDB can't add projects: the Tasks database's “${col.name}” column is ${this.columns.describe("project").toLowerCase()}. Make it a select or link it to a Projects database.`);
    }
    const { name: _n, ...rest } = fields;
    this.saveLocal(id, this.onlyLocal(rest));
    return this.list().find((p) => p.id === id) ?? { ...projectFromPage({ id, last_edited_time: "", properties: {} }), ...fields, name };
  }

  async update(id: string, fields: Editable): Promise<void> {
    const col = this.columns.project;
    const { name, ...rest } = fields;
    this.saveLocal(id, this.onlyLocal(rest));
    if (col.kind === "relation") {
      const properties: Record<string, unknown> = {};
      if (name !== undefined) properties[await titlePropertyOf(this.client, col.dataSourceId!)] = { title: text(name) };
      for (const key of Object.keys(PP) as Detail[]) {
        if (rest[key] !== undefined && this.backed(key)) properties[PP[key][0]] = detailProperty(key, rest[key]);
      }
      const body: Record<string, unknown> = {};
      if (Object.keys(properties).length) body.properties = properties;
      if (rest.emoji !== undefined) body.icon = rest.emoji ? { type: "emoji", emoji: rest.emoji } : null;
      if (!Object.keys(body).length) return;
      const page: NotionPage = await this.client.request("PATCH", `/pages/${id}`, body);
      this.columns.linkedProjectPages = this.columns.linkedProjectPages.map((p) => (p.id === id ? page : p));
      this.columns.linkedProjects = this.columns.linkedProjects.map((p) =>
        p.id === id ? { ...p, name: name ?? p.name, emoji: rest.emoji !== undefined ? rest.emoji : p.emoji } : p,
      );
    } else if ((col.kind === "select" || col.kind === "multi_select") && name !== undefined) {
      await this.patchOptions(col.options.map((o) => ({ id: o.id, name: o.id === id ? name.trim() : o.name, color: o.color })));
    }
  }

  /**
   * A linked project page is the user's own data, so it only leaves TaskDB's list.
   * A select option is removed from the column (Notion clears it from tasks).
   */
  async remove(id: string): Promise<void> {
    const col = this.columns.project;
    if (col.kind === "select" || col.kind === "multi_select") {
      await this.patchOptions(col.options.filter((o) => o.id !== id).map(({ id, name, color }) => ({ id, name, color })));
    } else {
      this.saveLocal(id, { hidden: true });
    }
  }

  /**
   * Adds TaskDB's project columns (Color, Order, Parent project…) to a linked Projects
   * database that lacks them, then moves details kept on this Mac into them.
   * Existing columns are never changed. Returns the names added.
   */
  async ensureDetailColumns(): Promise<string[]> {
    const col = this.columns.project;
    if (col.kind !== "relation" || !col.dataSourceId) return [];
    const have = this.columns.linkedProjectProps;
    const wanted = projectDetailColumns(col.dataSourceId);
    const missing = Object.fromEntries(Object.entries(wanted).filter(([name]) => !(name in have)));
    if (!Object.keys(missing).length) return [];
    await this.client.request("PATCH", `/data_sources/${col.dataSourceId}`, { properties: missing });
    for (const [name, def] of Object.entries(missing)) this.columns.linkedProjectProps[name] = Object.keys(def as object)[0]!;
    // Details set on this Mac move into Notion, so every Mac sees the same sidebar.
    const local = this.local();
    for (const [id, meta] of Object.entries(local)) {
      if (!this.columns.linkedProjects.some((p) => p.id === id)) continue;
      const properties: Record<string, unknown> = {};
      for (const key of Object.keys(PP) as Detail[]) {
        if (meta[key] !== undefined && PP[key][0] in missing) properties[PP[key][0]] = detailProperty(key, meta[key]);
      }
      if (Object.keys(properties).length) {
        const page: NotionPage = await this.client.request("PATCH", `/pages/${id}`, { properties });
        this.columns.linkedProjectPages = this.columns.linkedProjectPages.map((p) => (p.id === id ? page : p));
      }
    }
    return Object.keys(missing);
  }

  /** Projects hidden with Delete; shown again by Settings › Notion. */
  hiddenCount(): number {
    return Object.values(this.local()).filter((m) => m.hidden).length;
  }

  unhideAll(): void {
    const all = this.local();
    for (const m of Object.values(all)) delete m.hidden;
    this.meta.set(JSON.stringify(all));
  }

  private onlyLocal(fields: Editable): Editable {
    const out: Editable = { ...fields };
    for (const key of Object.keys(PP) as Detail[]) if (this.backed(key)) delete out[key];
    if (this.columns.project.kind === "relation") delete out.emoji;
    return out;
  }

  private async patchOptions(options: { id?: string; name: string; color: string }[]): Promise<void> {
    const col = this.columns.project;
    const res: any = await this.client.request("PATCH", `/data_sources/${this.tasksDataSourceId}`, {
      properties: { [col.name]: { [col.kind]: { options } } },
    });
    const updated = res?.properties?.[col.name];
    this.columns.project = updated
      ? describeColumn(col.name, updated)
      : { ...col, options: options.map((o) => ({ id: o.id ?? o.name, name: o.name, color: o.color })) };
  }
}

function notionColor(c: string | undefined): string {
  return !c || c === "gray" ? "gray" : c;
}

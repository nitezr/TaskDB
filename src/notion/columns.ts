import type { NotionClient, NotionPage } from "./client";

/**
 * TaskDB keeps everything in one Notion database. The Project and Person columns can be
 * whatever the user likes: a select, a multi-select, a relation to their own Projects /
 * People database, or (Person only) Notion's People type. TaskDB reads the column type and
 * uses whatever the column shows.
 */
export type ColumnKind = "relation" | "select" | "multi_select" | "people" | "rich_text" | "missing" | "unsupported";

export interface ColumnOption {
  id: string;
  name: string;
  color: string;
}

export interface Column {
  /** Property name in the Tasks database ("Project", "Person"). */
  name: string;
  kind: ColumnKind;
  /** Notion's own type name, for messages when TaskDB can't use it. */
  type: string | null;
  /** Relation target. */
  dataSourceId: string | null;
  /** Select / multi-select options. */
  options: ColumnOption[];
}

export interface LinkedEntry {
  id: string;
  name: string;
  emoji: string | null;
}

export const PROJECT_COLUMN = "Project";
export const PERSON_COLUMN = "Person";

const plain = (rich: any[] | undefined) => (rich ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("");

export const titleOfPage = (page: NotionPage): string =>
  plain((Object.values(page.properties ?? {}) as any[]).find((p) => p?.type === "title" || Array.isArray(p?.title))?.title);

export function describeColumn(name: string, prop: any): Column {
  const base = { name, type: prop?.type ?? null, dataSourceId: null, options: [] as ColumnOption[] };
  if (!prop) return { ...base, kind: "missing" };
  const type: string = prop.type ?? Object.keys(prop).find((k) => ["relation", "select", "multi_select", "people", "rich_text"].includes(k)) ?? "";
  switch (type) {
    case "relation":
      return { ...base, type, kind: "relation", dataSourceId: prop.relation?.data_source_id ?? prop.relation?.database_id ?? null };
    case "select":
    case "multi_select":
      return {
        ...base,
        type,
        kind: type,
        options: (prop[type]?.options ?? []).map((o: any) => ({ id: o.id ?? o.name, name: o.name, color: o.color ?? "default" })),
      };
    case "people":
    case "rich_text":
      return { ...base, type, kind: type };
    default:
      return { ...base, kind: "unsupported" };
  }
}

/** A task's value in a column: ids for relations and people, option ids for selects, text otherwise. */
function readIds(col: Column, prop: any): string[] {
  if (!prop) return [];
  switch (col.kind) {
    case "relation":
      return (prop.relation ?? []).map((r: any) => r.id);
    case "select":
      return prop.select ? [prop.select.id ?? prop.select.name] : [];
    case "multi_select":
      return (prop.multi_select ?? []).map((o: any) => o.id ?? o.name);
    case "people":
      return (prop.people ?? []).map((u: any) => u.id);
    case "rich_text": {
      const s = plain(prop.rich_text).trim();
      return s ? [s] : [];
    }
    default:
      return [];
  }
}

export class UnknownPerson extends Error {
  constructor(readonly person: string) {
    super(`"${person}" isn't in the Person column's list in Notion.`);
  }
}

/**
 * The live shape of the Project and Person columns, plus the names behind relation and
 * people ids. Refreshed on launch, every half hour, and whenever a pulled task points at
 * something TaskDB hasn't seen.
 */
export class Columns {
  project: Column;
  person: Column;
  /** Pages of the linked Projects database. */
  linkedProjects: LinkedEntry[] = [];
  /** Titles of the linked databases, for Settings. */
  linkedTitles: { project: string | null; person: string | null } = { project: null, person: null };
  /** Why names couldn't be read (usually: the linked database isn't shared with TaskDB). */
  problems: { project: string | null; person: string | null } = { project: null, person: null };
  /** Properties of the linked Projects database, so TaskDB knows which project details it can keep there. */
  linkedProjectProps: Record<string, string> = {};
  /** Full pages of the linked Projects database from the last refresh (not cached to disk). */
  linkedProjectPages: NotionPage[] = [];
  private people = new Map<string, string>();
  private lastRefresh = 0;

  constructor(
    project: Column = { name: PROJECT_COLUMN, kind: "relation", type: "relation", dataSourceId: null, options: [] },
    person: Column = { name: PERSON_COLUMN, kind: "select", type: "select", dataSourceId: null, options: [] },
  ) {
    this.project = project;
    this.person = person;
  }

  /**
   * Reads the Tasks schema and the names behind linked ids. A few requests, so `throttle`
   * skips it when the last refresh was under a minute ago.
   */
  async refresh(client: NotionClient, tasksDataSourceId: string, throttle = false): Promise<boolean> {
    if (throttle && Date.now() - this.lastRefresh < 60_000) return false;
    this.lastRefresh = Date.now();
    const ds: any = await client.request("GET", `/data_sources/${tasksDataSourceId}`);
    const props = ds.properties ?? {};
    this.project = describeColumn(PROJECT_COLUMN, props[PROJECT_COLUMN]);
    // A project needs a list to pick from: text and people columns don't give one.
    if (this.project.kind === "rich_text" || this.project.kind === "people") this.project = { ...this.project, kind: "unsupported" };
    this.person = describeColumn(PERSON_COLUMN, props[PERSON_COLUMN]);
    await Promise.all([this.loadProjects(client), this.loadPeople(client)]);
    // Notion leaves a relation column out of the API entirely while the database it links to
    // isn't shared with TaskDB, so "missing" almost always means "not shared yet".
    if (this.project.kind === "missing") this.problems.project = hiddenHint("Project");
    if (this.person.kind === "missing") this.problems.person = hiddenHint("Person");
    return true;
  }

  private async loadProjects(client: NotionClient): Promise<void> {
    this.problems.project = null;
    this.linkedTitles.project = null;
    if (this.project.kind !== "relation" || !this.project.dataSourceId) return;
    try {
      const ds: any = await client.request("GET", `/data_sources/${this.project.dataSourceId}`);
      this.linkedTitles.project = plain(ds.title) || "Projects";
      this.linkedProjectProps = Object.fromEntries(Object.entries(ds.properties ?? {}).map(([k, v]: [string, any]) => [k, v?.type ?? ""]));
      this.linkedProjectPages = await queryAll(client, this.project.dataSourceId);
      this.linkedProjects = this.linkedProjectPages.map((p) => ({
        id: p.id,
        name: titleOfPage(p) || "Untitled",
        emoji: p.icon?.type === "emoji" ? (p.icon.emoji ?? null) : null,
      }));
    } catch (e) {
      this.problems.project = shareHint("Project", e);
    }
  }

  private async loadPeople(client: NotionClient): Promise<void> {
    this.problems.person = null;
    this.linkedTitles.person = null;
    try {
      if (this.person.kind === "relation" && this.person.dataSourceId) {
        const ds: any = await client.request("GET", `/data_sources/${this.person.dataSourceId}`);
        this.linkedTitles.person = plain(ds.title) || "People";
        this.people = new Map((await queryAll(client, this.person.dataSourceId)).map((p) => [p.id, titleOfPage(p) || "Untitled"]));
      } else if (this.person.kind === "people") {
        const users: any[] = [];
        let cursor: string | undefined;
        do {
          const res: any = await client.request("GET", `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
          users.push(...res.results);
          cursor = res.has_more ? res.next_cursor : undefined;
        } while (cursor);
        this.people = new Map(users.filter((u) => u.type === "person" && u.name).map((u) => [u.id, u.name]));
      }
    } catch (e) {
      this.problems.person = shareHint("Person", e);
    }
  }

  // ---- Projects ----

  /** Project id stored on a task: relation page id or select option id. */
  readProject(page: NotionPage): string | null {
    return readIds(this.project, page.properties[this.project.name])[0] ?? null;
  }

  writeProject(id: string | null): unknown {
    const col = this.project;
    switch (col.kind) {
      case "relation":
        return { relation: id ? [{ id }] : [] };
      case "select": {
        const name = id ? this.projectOption(id)?.name : null;
        return { select: name ? { name } : null };
      }
      case "multi_select": {
        const name = id ? this.projectOption(id)?.name : null;
        return { multi_select: name ? [{ name }] : [] };
      }
      case "rich_text":
        return { rich_text: id ? [{ type: "text", text: { content: id } }] : [] };
      default:
        return undefined;
    }
  }

  private projectOption(id: string): ColumnOption | undefined {
    return this.project.options.find((o) => o.id === id);
  }

  // ---- People ----

  readPerson(page: NotionPage): string | null {
    const prop = page.properties[this.person.name];
    // Selects are read by name, so a cached option list that is out of date never hides a person.
    if (this.person.kind === "select") return prop?.select?.name ?? null;
    if (this.person.kind === "multi_select") return prop?.multi_select?.[0]?.name ?? null;
    const ids = readIds(this.person, prop);
    for (const id of ids) {
      const name = this.personName(id);
      if (name) return name;
    }
    return null;
  }

  private personName(id: string): string | null {
    switch (this.person.kind) {
      case "relation":
      case "people":
        return this.people.get(id) ?? null;
      default:
        return id;
    }
  }

  personId(name: string): string | null {
    const want = name.trim().toLowerCase();
    for (const [id, n] of this.people) if (n.toLowerCase() === want) return id;
    return null;
  }

  writePerson(name: string | null): unknown {
    switch (this.person.kind) {
      case "relation":
      case "people": {
        if (!name) return { [this.person.kind]: [] };
        const id = this.personId(name);
        if (!id) throw new UnknownPerson(name);
        return { [this.person.kind]: [{ id }] };
      }
      case "select":
        return { select: name ? { name } : null };
      case "multi_select":
        return { multi_select: name ? [{ name }] : [] };
      case "rich_text":
        return { rich_text: name ? [{ type: "text", text: { content: name } }] : [] };
      default:
        return undefined;
    }
  }

  /** Names to offer for +person: the whole linked People list, or the select's options. */
  personNames(): string[] {
    if (this.person.kind === "relation" || this.person.kind === "people") return [...this.people.values()];
    return this.person.options.map((o) => o.name);
  }

  /** A linked People database gets a new page for a name it doesn't have yet. */
  async ensurePerson(client: NotionClient, name: string): Promise<void> {
    if (this.person.kind !== "relation" || !this.person.dataSourceId || this.personId(name)) return;
    const titleProp = await titlePropertyOf(client, this.person.dataSourceId);
    const page: NotionPage = await client.request("POST", "/pages", {
      parent: { type: "data_source_id", data_source_id: this.person.dataSourceId },
      properties: { [titleProp]: { title: [{ type: "text", text: { content: name.trim() } }] } },
    });
    this.people.set(page.id, name.trim());
  }

  async renamePerson(client: NotionClient, from: string, to: string): Promise<boolean> {
    if (this.person.kind !== "relation" || !this.person.dataSourceId) return false;
    const id = this.personId(from);
    if (!id) return false;
    const titleProp = await titlePropertyOf(client, this.person.dataSourceId);
    await client.updatePage(id, { [titleProp]: { title: [{ type: "text", text: { content: to } }] } });
    this.people.set(id, to);
    return true;
  }

  /** True when a pulled page points at a linked page or user TaskDB hasn't loaded yet. */
  hasUnknown(page: NotionPage): boolean {
    const projectIds = readIds(this.project, page.properties[this.project.name]);
    if (this.project.kind === "relation") {
      if (projectIds.some((id) => !this.linkedProjects.some((p) => p.id === id))) return !this.problems.project;
    } else if (this.project.kind === "select" || this.project.kind === "multi_select") {
      if (projectIds.some((id) => !this.project.options.some((o) => o.id === id))) return true;
    }
    const personIds =
      this.person.kind === "relation" || this.person.kind === "people" ? readIds(this.person, page.properties[this.person.name]) : [];
    return personIds.some((id) => !this.people.has(id)) && !this.problems.person;
  }

  /** Plain-English description for Settings. */
  describe(which: "project" | "person"): string {
    const col = this[which];
    const title = this.linkedTitles[which];
    switch (col.kind) {
      case "relation":
        return `Linked to ${title ? `“${title}”` : "another database"}`;
      case "select":
        return "Select";
      case "multi_select":
        return "Multi-select (TaskDB uses the first value)";
      case "people":
        return "Notion people";
      case "rich_text":
        return "Text";
      case "missing":
        return "Not visible to TaskDB yet";
      default:
        return `Not supported (${col.type})`;
    }
  }

  toJSON() {
    return { project: this.project, person: this.person, linkedProjects: this.linkedProjects, linkedTitles: this.linkedTitles, linkedProjectProps: this.linkedProjectProps, people: [...this.people] };
  }

  /** Cached copy, so names show before the first refresh finishes. */
  static fromJSON(raw: string | undefined): Columns {
    const c = new Columns();
    if (!raw) return c;
    try {
      const j = JSON.parse(raw);
      c.project = j.project ?? c.project;
      c.person = j.person ?? c.person;
      c.linkedProjects = j.linkedProjects ?? [];
      c.linkedTitles = j.linkedTitles ?? c.linkedTitles;
      c.linkedProjectProps = j.linkedProjectProps ?? {};
      c.people = new Map(j.people ?? []);
    } catch {
      /* start fresh */
    }
    return c;
  }
}

async function queryAll(client: NotionClient, dataSourceId: string): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.queryDataSource(dataSourceId, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...res.results.filter((p) => !p.in_trash && !p.archived));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

const titleProps = new Map<string, string>();
export async function titlePropertyOf(client: NotionClient, dataSourceId: string): Promise<string> {
  const known = titleProps.get(dataSourceId);
  if (known) return known;
  const ds: any = await client.request("GET", `/data_sources/${dataSourceId}`);
  const name = Object.entries(ds.properties ?? {}).find(([, v]: [string, any]) => v?.type === "title")?.[0] ?? "Name";
  titleProps.set(dataSourceId, name);
  return name;
}

function hiddenHint(column: string): string {
  return `Notion hides the ${column} column from TaskDB until TaskDB can open the database it links to. In Notion, open that database (e.g. your ${column === "Project" ? "Projects" : "People"} database) › ••• › Connections › add TaskDB, then click Refresh from Notion.`;
}

function shareHint(column: string, e: unknown): string {
  const status = (e as any)?.status;
  if (status === 404 || status === 403)
    return `TaskDB can't open the database your ${column} column links to. In Notion, open that database › ••• › Connections and add TaskDB.`;
  return e instanceof Error ? e.message : String(e);
}

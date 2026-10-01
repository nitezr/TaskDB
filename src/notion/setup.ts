import type { NotionClient } from "./client";
import { P } from "./mapping";

export interface WorkspaceIds {
  tasksDataSourceId: string;
  /** Only in workspaces made by earlier versions; no longer used. */
  projectsDataSourceId?: string;
}

export interface PageRef {
  id: string;
  title: string;
}

const TASKS_TITLE = "TaskDB Tasks";

const titleOf = (obj: any): string =>
  (obj.title ?? (Object.values(obj.properties ?? {}) as any[]).find((p) => p?.type === "title")?.title ?? [])
    .map((t: any) => t.plain_text ?? t.text?.content ?? "")
    .join("") || "Untitled";

/** Pages the integration can see (the buyer shared them via "Connections"). */
export async function listSharedPages(client: NotionClient): Promise<PageRef[]> {
  const res: any = await client.request("POST", "/search", {
    filter: { property: "object", value: "page" },
    page_size: 50,
  });
  return res.results.filter((p: any) => p.parent?.type !== "data_source_id").map((p: any) => ({ id: p.id, title: titleOf(p) }));
}

/** Finds databases created by an earlier install, so reinstalling reconnects instead of duplicating. */
export async function findExistingWorkspace(client: NotionClient): Promise<WorkspaceIds | null> {
  const res: any = await client.request("POST", "/search", {
    query: "TaskDB",
    filter: { property: "object", value: "data_source" },
    page_size: 50,
  });
  const tasks = res.results.find((d: any) => titleOf(d) === TASKS_TITLE && !d.in_trash)?.id;
  return tasks ? { tasksDataSourceId: tasks } : null;
}

const option = (name: string, color: string) => ({ name, color });
const relation = (dataSourceId: string, syncedName: string) => ({
  relation: { data_source_id: dataSourceId, type: "dual_property", dual_property: { synced_property_name: syncedName } },
});

/**
 * Project and Person start as selects. Either can later become a relation to the user's own
 * Projects / People database (in Notion, or Settings › Notion); TaskDB follows the column type.
 */
function taskProperties(): Record<string, unknown> {
  return {
    [P.title]: { title: {} },
    [P.done]: { checkbox: {} },
    [P.due]: { date: {} },
    [P.priority]: {
      select: { options: [option("p1", "red"), option("p2", "orange"), option("p3", "blue"), option("p4", "default")] },
    },
    [P.projectId]: { select: { options: [] } },
    [P.labels]: { multi_select: { options: [] } },
    [P.person]: { select: { options: [] } },
    [P.recurrence]: { rich_text: {} },
    [P.reminder]: { date: {} },
    [P.order]: { number: {} },
    [P.completedAt]: { date: {} },
    [P.notes]: { rich_text: {} },
    [P.section]: { select: { options: [] } },
    [P.deadline]: { date: {} },
    [P.duration]: { number: {} },
    [P.when]: { select: { options: [option("This Evening", "purple"), option("Someday", "brown")] } },
  };
}

/** Self-relations can only be added once the data source exists. */
const taskSelfRelations = (tasksDs: string) => ({ [P.parentId]: relation(tasksDs, "Sub-items") });

/** Creates the one TaskDB database under `parentPageId`. Costs 2 requests. */
export async function createWorkspace(client: NotionClient, parentPageId: string): Promise<WorkspaceIds> {
  const tasks: any = await client.request("POST", "/databases", {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: TASKS_TITLE } }],
    icon: { type: "emoji", emoji: "✅" },
    initial_data_source: { properties: taskProperties() },
  });
  const tasksDataSourceId: string = tasks.data_sources[0].id;
  await client.request("PATCH", `/data_sources/${tasksDataSourceId}`, { properties: taskSelfRelations(tasksDataSourceId) });
  return { tasksDataSourceId };
}

/**
 * Adds properties introduced by newer TaskDB versions to an existing workspace.
 * Costs 1 read, plus a write only when something is missing.
 */
export async function upgradeWorkspace(client: NotionClient, ids: WorkspaceIds): Promise<string[]> {
  const added: string[] = [];
  const ensure = async (dataSourceId: string, wanted: Record<string, unknown>) => {
    const ds: any = await client.request("GET", `/data_sources/${dataSourceId}`);
    const have = new Set(Object.keys(ds.properties ?? {}));
    const missing = Object.fromEntries(Object.entries(wanted).filter(([name]) => !have.has(name)));
    if (Object.keys(missing).length) {
      await client.request("PATCH", `/data_sources/${dataSourceId}`, { properties: missing });
      added.push(...Object.keys(missing));
    }
  };
  // Project and Person are never added here: Notion hides a linked column from TaskDB until its
  // database is shared, and adding one by the same name would shadow the user's own column.
  const { [P.projectId]: _project, [P.person]: _person, ...wanted } = taskProperties();
  await ensure(ids.tasksDataSourceId, { ...wanted, ...taskSelfRelations(ids.tasksDataSourceId) });
  return added;
}

export const PROJECT_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

/** Databases the integration can see, for linking the Project or Person column. */
export async function listDataSources(client: NotionClient, exceptId?: string): Promise<PageRef[]> {
  const res: any = await client.request("POST", "/search", {
    filter: { property: "object", value: "data_source" },
    page_size: 100,
  });
  return res.results
    .filter((d: any) => !d.in_trash && d.id !== exceptId)
    .map((d: any) => ({ id: d.id, title: titleOf(d) }))
    .sort((a: PageRef, b: PageRef) => a.title.localeCompare(b.title));
}

/**
 * Points the Project or Person column at another database, the way you'd do it by hand:
 * the current column is kept as "<name> (old)" and a new relation column takes its name.
 * Nothing is deleted. Costs 2–3 requests.
 */
export async function linkColumn(client: NotionClient, tasksDataSourceId: string, column: string, targetDataSourceId: string): Promise<void> {
  const ds: any = await client.request("GET", `/data_sources/${tasksDataSourceId}`);
  const props = ds.properties ?? {};
  const current = props[column];
  if (current?.type === "relation" && current.relation?.data_source_id === targetDataSourceId) return;
  if (current) {
    let backup = `${column} (old)`;
    for (let n = 2; props[backup]; n++) backup = `${column} (old ${n})`;
    await client.request("PATCH", `/data_sources/${tasksDataSourceId}`, { properties: { [column]: { name: backup } } });
  }
  await client.request("PATCH", `/data_sources/${tasksDataSourceId}`, {
    properties: { [column]: { relation: { data_source_id: targetDataSourceId, type: "single_property", single_property: {} } } },
  });
}

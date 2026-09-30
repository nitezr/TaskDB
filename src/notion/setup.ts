import type { NotionClient } from "./client";
import { P } from "./mapping";
import { PP } from "./projects";

export interface WorkspaceIds {
  tasksDataSourceId: string;
  projectsDataSourceId: string;
}

export interface PageRef {
  id: string;
  title: string;
}

const TASKS_TITLE = "TaskDB Tasks";
const PROJECTS_TITLE = "TaskDB Projects";

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
  const byTitle = (t: string) => res.results.find((d: any) => titleOf(d) === t && !d.in_trash)?.id;
  const tasks = byTitle(TASKS_TITLE);
  const projects = byTitle(PROJECTS_TITLE);
  return tasks && projects ? { tasksDataSourceId: tasks, projectsDataSourceId: projects } : null;
}

const option = (name: string, color: string) => ({ name, color });
const relation = (dataSourceId: string, syncedName: string) => ({
  relation: { data_source_id: dataSourceId, type: "dual_property", dual_property: { synced_property_name: syncedName } },
});

function projectProperties(): Record<string, unknown> {
  return {
    [PP.name]: { title: {} },
    [PP.color]: { select: { options: PROJECT_COLORS.map((c) => option(c, c)) } },
    [PP.archived]: { checkbox: {} },
    [PP.order]: { number: {} },
    [PP.favorite]: { checkbox: {} },
    [PP.sections]: { rich_text: {} },
  };
}

function taskProperties(projectsDataSourceId: string): Record<string, unknown> {
  return {
    [P.title]: { title: {} },
    [P.done]: { checkbox: {} },
    [P.due]: { date: {} },
    [P.priority]: {
      select: { options: [option("p1", "red"), option("p2", "orange"), option("p3", "blue"), option("p4", "default")] },
    },
    [P.projectId]: relation(projectsDataSourceId, "Tasks"),
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
const projectSelfRelations = (projectsDs: string) => ({ [PP.parentId]: relation(projectsDs, "Sub-projects") });

/** Creates the Projects and Tasks databases under `parentPageId`. Costs 4 requests. */
export async function createWorkspace(client: NotionClient, parentPageId: string): Promise<WorkspaceIds> {
  const projects: any = await client.request("POST", "/databases", {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: PROJECTS_TITLE } }],
    icon: { type: "emoji", emoji: "📁" },
    initial_data_source: { properties: projectProperties() },
  });
  const projectsDataSourceId: string = projects.data_sources[0].id;

  const tasks: any = await client.request("POST", "/databases", {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: TASKS_TITLE } }],
    icon: { type: "emoji", emoji: "✅" },
    initial_data_source: { properties: taskProperties(projectsDataSourceId) },
  });
  const tasksDataSourceId: string = tasks.data_sources[0].id;

  await client.request("PATCH", `/data_sources/${tasksDataSourceId}`, { properties: taskSelfRelations(tasksDataSourceId) });
  await client.request("PATCH", `/data_sources/${projectsDataSourceId}`, {
    properties: projectSelfRelations(projectsDataSourceId),
  });
  return { tasksDataSourceId, projectsDataSourceId };
}

/**
 * Adds properties introduced by newer TaskDB versions to an existing workspace.
 * Costs 2 reads, plus a write only when something is missing.
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
  await ensure(ids.projectsDataSourceId, { ...projectProperties(), ...projectSelfRelations(ids.projectsDataSourceId) });
  await ensure(ids.tasksDataSourceId, {
    ...taskProperties(ids.projectsDataSourceId),
    ...taskSelfRelations(ids.tasksDataSourceId),
  });
  return added;
}

export const PROJECT_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

import type { NotionClient } from "./client";
import { P } from "./mapping";

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

/** Creates the Projects and Tasks databases under `parentPageId`. Costs 3 requests. */
export async function createWorkspace(client: NotionClient, parentPageId: string): Promise<WorkspaceIds> {
  const projects: any = await client.request("POST", "/databases", {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: PROJECTS_TITLE } }],
    icon: { type: "emoji", emoji: "📁" },
    initial_data_source: {
      properties: {
        Name: { title: {} },
        Color: { select: { options: PROJECT_COLORS.map((c) => option(c, c)) } },
        Archived: { checkbox: {} },
        Order: { number: {} },
      },
    },
  });
  const projectsDataSourceId: string = projects.data_sources[0].id;

  const tasks: any = await client.request("POST", "/databases", {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: TASKS_TITLE } }],
    icon: { type: "emoji", emoji: "✅" },
    initial_data_source: {
      properties: {
        [P.title]: { title: {} },
        [P.done]: { checkbox: {} },
        [P.due]: { date: {} },
        [P.priority]: {
          select: { options: [option("p1", "red"), option("p2", "orange"), option("p3", "blue"), option("p4", "default")] },
        },
        [P.projectId]: {
          relation: {
            data_source_id: projectsDataSourceId,
            type: "dual_property",
            dual_property: { synced_property_name: "Tasks" },
          },
        },
        [P.labels]: { multi_select: { options: [] } },
        [P.person]: { select: { options: [] } },
        [P.recurrence]: { rich_text: {} },
        [P.reminder]: { date: {} },
        [P.order]: { number: {} },
        [P.completedAt]: { date: {} },
      },
    },
  });
  const tasksDataSourceId: string = tasks.data_sources[0].id;

  // A self-relation needs the data source to exist first.
  await client.request("PATCH", `/data_sources/${tasksDataSourceId}`, {
    properties: {
      [P.parentId]: {
        relation: {
          data_source_id: tasksDataSourceId,
          type: "dual_property",
          dual_property: { synced_property_name: "Sub-items" },
        },
      },
    },
  });

  return { tasksDataSourceId, projectsDataSourceId };
}

export const PROJECT_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

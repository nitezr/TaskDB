import { dueDay, hasTime, parseDue, toDateStr, toLocalIso } from "../core/dates";
import { parseQuickAdd } from "../core/quickAdd";
import { nextDue } from "../core/recurrence";
import { NotionClient } from "../notion/client";
import { type Project, ProjectsApi } from "../notion/projects";
import { createWorkspace, findExistingWorkspace, listSharedPages, type PageRef, type WorkspaceIds } from "../notion/setup";
import type { Store } from "../store/store";
import { SyncEngine } from "../sync/engine";
import { SyncScheduler } from "../sync/scheduler";
import type { Task, TaskFields } from "../types";
import type { Platform } from "./platform";

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  accent: string;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system", accent: "#dc4c3e" };
const IDLE_AFTER_MS = 10 * 60_000;
const PROJECT_REFRESH_MS = 30 * 60_000;

type Phase = "loading" | "connect" | "ready";

/**
 * Single object the UI talks to. Every mutation updates local state first,
 * then the scheduler pushes it to Notion in the background.
 */
export class AppController {
  phase: Phase = "loading";
  projects: Project[] = [];
  lastSyncAt: number | null = null;
  lastError: string | null = null;

  private store!: Store & { clear?(): Promise<void> };
  private client: NotionClient | null = null;
  private engine: SyncEngine | null = null;
  private scheduler: SyncScheduler | null = null;
  private projectsApi: ProjectsApi | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private notified = new Set<string>();
  private lastInput = Date.now();
  private focused = true;
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Open quick add; set by the UI. */
  onQuickAdd: () => void = () => {};

  constructor(readonly platform: Platform) {}

  // ---- Lifecycle ----

  async boot(): Promise<void> {
    this.store = await this.platform.openStore();
    const token = await this.platform.getToken();
    const ids = this.workspaceIds();
    if (token && ids) this.start(token, ids);
    else this.setPhase("connect");
    await this.platform.onQuickAdd(() => this.onQuickAdd());
    this.platform.onFocusChange((f) => {
      this.focused = f;
      this.updateActivity();
    });
    const touch = () => {
      const wasIdle = Date.now() - this.lastInput > IDLE_AFTER_MS;
      this.lastInput = Date.now();
      if (wasIdle) this.updateActivity();
    };
    window.addEventListener("keydown", touch);
    window.addEventListener("pointerdown", touch);
  }

  private start(token: string, ids: WorkspaceIds): void {
    this.client = new NotionClient({ token, fetch: this.platform.fetch });
    this.projectsApi = new ProjectsApi(this.client, ids.projectsDataSourceId);
    this.engine = new SyncEngine({
      client: this.client,
      store: this.store,
      tasksDataSourceId: ids.tasksDataSourceId,
      onChange: () => {
        this.lastSyncAt = Date.now();
        this.emit();
      },
    });
    this.scheduler = new SyncScheduler(this.engine);
    this.projects = JSON.parse(this.store.getMeta("projects") ?? "[]");
    this.scheduler.start();
    void this.refreshProjects();
    this.timers.push(setInterval(() => void this.refreshProjects(), PROJECT_REFRESH_MS));
    this.timers.push(setInterval(() => this.checkReminders(), 30_000));
    this.timers.push(setInterval(() => this.updateActivity(), 60_000));
    this.setPhase("ready");
  }

  private workspaceIds(): WorkspaceIds | null {
    const raw = this.store.getMeta("workspace");
    return raw ? JSON.parse(raw) : null;
  }

  // ---- Onboarding ----

  /** Validates the token; returns shared pages and any earlier TaskDB install. */
  async connect(token: string): Promise<{ pages: PageRef[]; existing: WorkspaceIds | null }> {
    const client = new NotionClient({ token: token.trim(), fetch: this.platform.fetch });
    const [pages, existing] = await Promise.all([listSharedPages(client), findExistingWorkspace(client)]);
    return { pages, existing };
  }

  async finishSetup(token: string, target: { parentPageId: string } | { existing: WorkspaceIds }): Promise<void> {
    token = token.trim();
    const client = new NotionClient({ token, fetch: this.platform.fetch });
    const ids = "existing" in target ? target.existing : await createWorkspace(client, target.parentPageId);
    await this.platform.setToken(token);
    this.store.setMeta("workspace", JSON.stringify(ids));
    this.start(token, ids);
  }

  async disconnect(): Promise<void> {
    this.scheduler?.stop();
    this.timers.forEach(clearInterval);
    await this.platform.clearToken();
    await this.store.clear?.();
    window.location.reload();
  }

  // ---- Reads ----

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getVersion(): number {
    return this.version;
  }

  tasks(): Task[] {
    return this.store.allTasks();
  }

  task(id: string): Task | undefined {
    return this.store.getTask(id);
  }

  projectName = (id: string | null): string | null => this.projects.find((p) => p.id === id)?.name ?? null;

  labels(): string[] {
    return uniqueSorted(this.tasks().flatMap((t) => t.labels));
  }

  people(): string[] {
    return uniqueSorted([...this.tasks().map((t) => t.person ?? ""), ...this.extraPeople()].filter(Boolean));
  }

  private extraPeople(): string[] {
    return JSON.parse(this.store.getMeta("people") ?? "[]");
  }

  filters(): SavedFilter[] {
    return JSON.parse(this.store.getMeta("filters") ?? "null") ?? DEFAULT_FILTERS;
  }

  settings(): Settings {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(this.store.getMeta("settings") ?? "{}") };
  }

  syncStatus() {
    return {
      pending: this.engine?.outbox.size ?? 0,
      lastSyncAt: this.lastSyncAt,
      requests: this.client?.requestCount ?? 0,
      errors: this.tasks().filter((t) => t.syncError).length,
    };
  }

  // ---- Task writes ----

  /** Parses quick-add text and creates the task. Unknown #projects are created in Notion. */
  async quickAdd(text: string, defaults: Partial<TaskFields> = {}): Promise<Task | null> {
    const r = parseQuickAdd(text, { projects: this.projects.map((p) => p.name), people: this.people() });
    if (!r.title) return null;
    let projectId = defaults.projectId ?? null;
    if (r.project) {
      const found = this.projects.find((p) => p.name.toLowerCase() === r.project!.toLowerCase());
      projectId = found ? found.id : ((await this.addProject(r.project).catch(() => null))?.id ?? projectId);
    }
    return this.createTask({
      ...defaults,
      title: r.title,
      due: r.due ?? defaults.due ?? null,
      priority: r.priority !== 4 ? r.priority : (defaults.priority ?? 4),
      projectId,
      labels: [...new Set([...(defaults.labels ?? []), ...r.labels])],
      person: r.person ?? defaults.person ?? null,
      recurrence: r.recurrence,
    });
  }

  createTask(fields: Partial<TaskFields>): Task {
    const siblings = this.tasks().filter((t) => t.projectId === (fields.projectId ?? null) && t.parentId === (fields.parentId ?? null));
    const order = siblings.reduce((m, t) => Math.max(m, t.order), 0) + 1;
    const task = this.engine!.createTask({ order, ...fields });
    this.afterLocalWrite();
    return task;
  }

  updateTask(id: string, fields: Partial<TaskFields>): void {
    this.engine!.updateTask(id, fields);
    this.afterLocalWrite();
  }

  /** Recurring tasks move to their next date; others (and their sub-tasks) are marked done. */
  complete(id: string): void {
    const task = this.task(id);
    if (!task) return;
    if (task.recurrence && !task.parentId) {
      const due = nextDue(task.recurrence, task.due);
      if (due) {
        const shift = task.reminder && task.due ? parseDue(due).getTime() - parseDue(task.due).getTime() : 0;
        this.updateTask(id, {
          due,
          reminder: task.reminder ? toLocalIso(new Date(parseDue(task.reminder).getTime() + shift)) : null,
        });
        return;
      }
    }
    const completedAt = toDateStr(new Date());
    this.updateTask(id, { done: true, completedAt });
    for (const sub of this.tasks().filter((t) => t.parentId === id && !t.done)) {
      this.updateTask(sub.id, { done: true, completedAt });
    }
  }

  reopen(id: string): void {
    this.updateTask(id, { done: false, completedAt: null });
  }

  deleteTask(id: string): void {
    for (const sub of this.tasks().filter((t) => t.parentId === id)) this.deleteTask(sub.id);
    this.engine!.deleteTask(id);
    this.afterLocalWrite();
  }

  retrySync(id: string): void {
    this.engine!.retry(id);
    this.afterLocalWrite();
  }

  private afterLocalWrite(): void {
    this.scheduler?.localChange();
    this.emit();
  }

  // ---- Projects ----

  async refreshProjects(): Promise<void> {
    if (!this.projectsApi) return;
    try {
      this.projects = await this.projectsApi.list();
      this.store.setMeta("projects", JSON.stringify(this.projects));
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  async addProject(name: string, color = "gray"): Promise<Project> {
    const order = this.projects.reduce((m, p) => Math.max(m, p.order), 0) + 1;
    const project = await this.projectsApi!.create(name, color, order);
    this.projects = [...this.projects, project];
    this.store.setMeta("projects", JSON.stringify(this.projects));
    this.emit();
    return project;
  }

  async updateProject(id: string, fields: Partial<Pick<Project, "name" | "color" | "archived">>): Promise<void> {
    this.projects = this.projects.map((p) => (p.id === id ? { ...p, ...fields } : p));
    this.store.setMeta("projects", JSON.stringify(this.projects));
    this.emit();
    await this.projectsApi!.update(id, fields);
  }

  // ---- People, filters, settings ----

  addPerson(name: string): void {
    this.store.setMeta("people", JSON.stringify(uniqueSorted([...this.extraPeople(), name])));
    this.emit();
  }

  saveFilters(filters: SavedFilter[]): void {
    this.store.setMeta("filters", JSON.stringify(filters));
    this.emit();
  }

  saveSettings(settings: Settings): void {
    this.store.setMeta("settings", JSON.stringify(settings));
    this.emit();
  }

  // ---- Background ----

  private updateActivity(): void {
    const idle = Date.now() - this.lastInput > IDLE_AFTER_MS;
    this.scheduler?.setActivity(!this.focused ? "background" : idle ? "idle" : "focused");
  }

  /** Fires a notification at a task's reminder time, or its due time if it has one. */
  private checkReminders(): void {
    const now = Date.now();
    for (const t of this.tasks()) {
      if (t.done) continue;
      const at = t.reminder ?? (t.due && hasTime(t.due) ? t.due : null);
      if (!at) continue;
      const when = parseDue(at).getTime();
      const key = `${t.id}@${at}`;
      if (when <= now && now - when < 5 * 60_000 && !this.notified.has(key)) {
        this.notified.add(key);
        void this.platform.notify(t.title, t.due ? `Due ${dueDay(t.due) === toDateStr(new Date()) ? "now" : dueDay(t.due)}` : "Reminder");
      }
    }
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.emit();
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

const DEFAULT_FILTERS: SavedFilter[] = [
  { id: "f-urgent", name: "Urgent today", query: "p1 & (today | overdue)" },
  { id: "f-waiting", name: "Waiting on others", query: "@waiting" },
  { id: "f-nodate", name: "No due date", query: "no date" },
];

function uniqueSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

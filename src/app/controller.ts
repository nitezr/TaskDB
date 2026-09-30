import { dueDay, hasTime, parseDue, toDateStr, toLocalIso } from "../core/dates";
import { parseQuickAdd } from "../core/quickAdd";
import type { ImportedProject } from "../core/todoistCsv";
import { nextDue } from "../core/recurrence";
import { NotionClient } from "../notion/client";
import { type Project, ProjectsApi } from "../notion/projects";
import {
  createWorkspace,
  findExistingWorkspace,
  listSharedPages,
  type PageRef,
  PROJECT_COLORS,
  upgradeWorkspace,
  type WorkspaceIds,
} from "../notion/setup";
import type { Store } from "../store/store";
import { SyncEngine } from "../sync/engine";
import { SyncScheduler } from "../sync/scheduler";
import type { Task, TaskFields } from "../types";
import {
  canEdit,
  computeState,
  LemonSqueezy,
  LicenseError,
  type LicenseRecord,
  type LicenseState,
  VALIDATE_EVERY_MS,
} from "../license/license";
import type { Platform } from "./platform";
import { DEFAULT_PREFS, type DisplayPrefs } from "./display";

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
}

/** A saved project skeleton: section names only, never tasks. */
export interface ProjectTemplate {
  id: string;
  name: string;
  sections: string[];
  createdAt: string;
}

export interface Completion {
  id: string;
  title: string;
  projectId: string | null;
  /** Local ISO time (or a date for tasks completed before the log existed). */
  at: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  accent: string;
  font: "avenir" | "system";
  /** Set once the user picks a font, so a changed default still reaches everyone else. */
  fontPicked?: boolean;
  /** Calendar hour grids hide these hours (Remit's sleeping-hours toggle). */
  hideSleep: boolean;
  sleepStart: number;
  sleepEnd: number;
  completionSound: boolean;
  sidebarHidden: boolean;
  /** Collapsed sidebar sections and parent projects. */
  collapsed: string[];
  /** Remapped shortcuts: action id -> key combos. */
  shortcuts: Record<string, string[]>;
  tourDone: boolean;
  /** Colour theme id (themes.ts). */
  palette: string;
  density: "comfortable" | "compact";
  /** 0 = Sunday, 1 = Monday. Used by calendars and "next week". */
  weekStart: 0 | 1;
  /** The view TaskDB opens on. */
  startView: "inbox" | "today" | "upcoming";
  /** Tasks to complete per day for the productivity ring; 0 hides it. */
  dailyGoal: number;
  weeklyGoal: number;
  /** Days of the week (0 = Sunday) that don't break a streak. */
  daysOff: number[];
  /** Show the Today count on the Dock icon. */
  dockBadge: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "#dc4c3e",
  font: "system",
  hideSleep: true,
  sleepStart: 22,
  sleepEnd: 8,
  completionSound: true,
  sidebarHidden: false,
  collapsed: [],
  shortcuts: {},
  tourDone: false,
  palette: "classic",
  density: "comfortable",
  weekStart: 0,
  startView: "today",
  dailyGoal: 5,
  weeklyGoal: 25,
  daysOff: [0, 6],
  dockBadge: true,
};
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

  dismissError(): void {
    this.lastError = null;
    this.emit();
  }

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
  /** Show the buy/activate dialog; set by the UI. */
  onPaywall: () => void = () => {};

  private trialStartedAt = Date.now();
  private license: LicenseRecord | null = null;

  constructor(readonly platform: Platform) {}

  // ---- Lifecycle ----

  async boot(): Promise<void> {
    this.store = await this.platform.openStore();
    await this.loadLicense();
    const token = await this.platform.secureGet("notion-token");
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
    this.projects = (JSON.parse(this.store.getMeta("projects") ?? "[]") as Project[]).map(withProjectDefaults);
    // Older workspaces get the columns newer versions need before any change is pushed; then
    // syncing starts and projects load. Offline, syncing starts anyway and retries as usual.
    void upgradeWorkspace(this.client, ids)
      .catch((e) => (this.lastError = e instanceof Error ? e.message : String(e)))
      .finally(() => {
        this.scheduler?.start();
        void this.refreshProjects();
      });
    this.timers.push(setInterval(() => void this.refreshProjects(), PROJECT_REFRESH_MS));
    this.timers.push(setInterval(() => this.checkReminders(), 30_000));
    this.timers.push(setInterval(() => this.updateActivity(), 60_000));
    this.timers.push(setInterval(() => void this.revalidate(), VALIDATE_EVERY_MS / 4));
    void this.revalidate();
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

  /** One-click sign-in through the auth worker; no secret to copy. */
  async signInWithNotion(authUrl: string): Promise<{
    token: string;
    pages: PageRef[];
    existing: WorkspaceIds | null;
    templateId: string | null;
  }> {
    const params = await this.platform.notionSignIn(authUrl);
    const error = params.get("error");
    if (error) throw new Error(error === "access_denied" ? "Notion access was cancelled." : `Notion sign-in failed (${error}).`);
    const token = params.get("token");
    if (!token) throw new Error("Notion sign-in didn't return a token.");
    return { token, ...(await this.connect(token)), templateId: params.get("template") };
  }

  async finishSetup(token: string, target: { parentPageId: string } | { existing: WorkspaceIds }): Promise<void> {
    token = token.trim();
    const client = new NotionClient({ token, fetch: this.platform.fetch });
    const ids = "existing" in target ? target.existing : await createWorkspace(client, target.parentPageId);
    await this.platform.secureSet("notion-token", token);
    this.store.setMeta("workspace", JSON.stringify(ids));
    this.start(token, ids);
  }

  async disconnect(): Promise<void> {
    this.scheduler?.stop();
    this.timers.forEach(clearInterval);
    await this.platform.secureDelete("notion-token");
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
    // The UI renders before boot() has opened the store (SQLite takes a moment on disk).
    if (!this.store) return DEFAULT_SETTINGS;
    const saved = JSON.parse(this.store.getMeta("settings") ?? "{}");
    if (!saved.fontPicked) delete saved.font;
    return { ...DEFAULT_SETTINGS, ...saved };
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
    if (!this.guard()) return null;
    const r = parseQuickAdd(text, {
      projects: this.projects.map((p) => p.name),
      people: this.people(),
      labels: this.labels(),
      sections: [...new Set(this.projects.flatMap((p) => p.sections))],
    });
    if (!r.title) return null;
    let projectId = defaults.projectId ?? null;
    if (r.project) {
      const found = this.projects.find((p) => p.name.toLowerCase() === r.project!.toLowerCase());
      projectId = found ? found.id : ((await this.addProject({ name: r.project }).catch(() => null))?.id ?? projectId);
    }
    let section = defaults.section ?? null;
    if (r.section && projectId) {
      const known = this.sections(projectId).find((n) => n.toLowerCase() === r.section!.toLowerCase());
      section = known ?? r.section;
      if (!known) await this.addSection(projectId, r.section).catch(() => undefined);
    }
    return this.createTask({
      ...defaults,
      section,
      title: r.title,
      due: r.due ?? defaults.due ?? null,
      priority: r.priority !== 4 ? r.priority : (defaults.priority ?? 4),
      projectId,
      labels: [...new Set([...(defaults.labels ?? []), ...r.labels])],
      person: r.person ?? defaults.person ?? null,
      recurrence: r.recurrence,
      deadline: r.deadline ?? defaults.deadline ?? null,
      duration: r.duration ?? defaults.duration ?? null,
      when: r.when ?? defaults.when ?? null,
    });
  }

  createTask(fields: Partial<TaskFields>): Task | null {
    if (!this.guard()) return null;
    const siblings = this.tasks().filter((t) => t.projectId === (fields.projectId ?? null) && t.parentId === (fields.parentId ?? null));
    const order = siblings.reduce((m, t) => Math.max(m, t.order), 0) + 1;
    const task = this.engine!.createTask({ order, ...fields });
    this.record(`Added “${task.title}”`, (ids) => this.engine!.deleteTask(ids.get(task.id) ?? task.id));
    this.afterLocalWrite();
    return task;
  }

  updateTask(id: string, fields: Partial<TaskFields>): void {
    if (!this.guard()) return;
    const before = this.task(id);
    if (!before) return;
    // Giving a Someday task a date brings it back; moving an evening task off today ends "evening".
    if (fields.due !== undefined && fields.when === undefined && before.when) {
      const today = toDateStr(new Date());
      if ((before.when === "someday" && fields.due) || (before.when === "evening" && (!fields.due || dueDay(fields.due) !== today))) {
        fields = { ...fields, when: null };
      }
    }
    const prev = Object.fromEntries(Object.keys(fields).map((k) => [k, before[k as keyof TaskFields]])) as Partial<TaskFields>;
    this.engine!.updateTask(id, fields);
    this.record(`Edited “${before.title}”`, (ids) => this.engine!.updateTask(ids.get(id) ?? id, prev));
    this.afterLocalWrite();
  }

  /** Recurring tasks move to their next date; others (and their sub-tasks) are marked done. */
  complete(id: string): void {
    const task = this.task(id);
    if (!task) return;
    this.transaction(() => {
      this.logCompletion(task);
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
    }, `Completed “${task.title}”`);
  }

  /**
   * Creates a project (or reuses one with the same name) and every task from a Todoist export.
   * Tasks sync to Notion in the background at the usual pace; the UI has them at once.
   */
  async importProject(data: ImportedProject): Promise<number> {
    if (!this.guard()) return 0;
    let project = this.projects.find((p) => !p.archived && p.name.toLowerCase() === data.name.toLowerCase());
    if (!project) project = await this.addProject({ name: data.name, sections: data.sections });
    else {
      const missing = data.sections.filter((n) => !project!.sections.includes(n));
      if (missing.length) await this.updateProject(project.id, { sections: [...project.sections, ...missing] });
    }
    const ids: string[] = [];
    this.transaction(() => {
      data.tasks.forEach((t, i) => {
        const created = this.createTask({
          title: t.title,
          notes: t.notes,
          priority: t.priority,
          labels: t.labels,
          due: t.due,
          recurrence: t.recurrence,
          deadline: t.deadline,
          duration: t.duration,
          section: t.section,
          projectId: project!.id,
          parentId: t.parent !== null ? (ids[t.parent] ?? null) : null,
          order: i + 1,
        });
        ids.push(created?.id ?? "");
      });
    }, `Imported ${data.name}`);
    return ids.filter(Boolean).length;
  }

  /** Moves a repeating task to its next date without counting it as done. */
  skipOccurrence(id: string): void {
    const task = this.task(id);
    if (!task?.recurrence) return;
    const due = nextDue(task.recurrence, task.due);
    if (due) this.transaction(() => this.updateTask(id, { due }), `Skipped “${task.title}”`);
  }

  // ---- Productivity ----

  /** Every completion, including each round of a repeating task, which Notion can't keep. */
  completions(): Completion[] {
    return this.store ? JSON.parse(this.store.getMeta("completions") ?? "[]") : [];
  }

  private logCompletion(task: Task): void {
    const entry: Completion = { id: task.id, title: task.title, projectId: task.projectId, at: toLocalIso(new Date()) };
    const save = (list: Completion[]) => this.store.setMeta("completions", JSON.stringify(list.slice(-5000)));
    save([...this.completions(), entry]);
    this.record(`Completed “${task.title}”`, () => save(this.completions().filter((c) => !(c.id === entry.id && c.at === entry.at))));
  }

  /** Completions per local day, merging the log with done tasks from before it existed. */
  completedByDay(): Map<string, Completion[]> {
    const out = new Map<string, Completion[]>();
    const seen = new Set<string>();
    const add = (c: Completion) => {
      const day = c.at.slice(0, 10);
      const key = `${c.id}@${day}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.set(day, [...(out.get(day) ?? []), c]);
    };
    for (const c of this.completions()) add(c);
    for (const t of this.tasks()) if (t.done && t.completedAt) add({ id: t.id, title: t.title, projectId: t.projectId, at: t.completedAt });
    return out;
  }

  reopen(id: string): void {
    this.updateTask(id, { done: false, completedAt: null });
  }

  deleteTask(id: string): void {
    if (!this.guard()) return;
    const task = this.task(id);
    if (!task) return;
    this.transaction(() => {
      for (const sub of this.tasks().filter((t) => t.parentId === id)) this.deleteTask(sub.id);
      const { id: _i, notionId: _n, remoteEditedAt: _r, syncError: _e, createdAt: _c, ...fields } = task;
      this.engine!.deleteTask(id);
      // Undo re-creates it; sub-tasks restored after it are re-pointed at the new id.
      this.record(`Deleted “${task.title}”`, (ids) => {
        const parentId = fields.parentId ? (ids.get(fields.parentId) ?? fields.parentId) : null;
        ids.set(id, this.engine!.createTask({ ...fields, parentId }).id);
      });
      this.afterLocalWrite();
    }, `Deleted “${task.title}”`);
  }

  /** Moves due dates, keeping any time of day. */
  schedule(ids: string[], target: ScheduleTarget): void {
    this.transaction(() => {
      for (const id of ids) {
        const t = this.task(id);
        if (t) this.updateTask(id, { due: scheduleDue(t.due, target) });
      }
    }, ids.length === 1 ? `Rescheduled “${this.task(ids[0]!)?.title ?? ""}”` : `Rescheduled ${ids.length} tasks`);
  }

  // ---- Undo ----

  private undoStack: { label: string; steps: ((ids: Map<string, string>) => void)[] }[] = [];
  private openTx: { label: string; steps: ((ids: Map<string, string>) => void)[] } | null = null;
  private undoing = false;

  /** Groups every change made inside `fn` into one undo step. */
  transaction<T>(fn: () => T, label?: string): T {
    if (this.openTx || this.undoing) return fn();
    this.openTx = { label: label ?? "", steps: [] };
    try {
      return fn();
    } finally {
      const tx = this.openTx;
      this.openTx = null;
      if (tx.steps.length) {
        this.undoStack.push({ label: label ?? tx.label, steps: tx.steps });
        if (this.undoStack.length > 50) this.undoStack.shift();
      }
    }
  }

  private record(label: string, step: (ids: Map<string, string>) => void): void {
    if (this.undoing) return;
    if (this.openTx) {
      if (!this.openTx.label) this.openTx.label = label;
      this.openTx.steps.push(step);
    } else {
      this.undoStack.push({ label, steps: [step] });
      if (this.undoStack.length > 50) this.undoStack.shift();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Reverts the last change. Returns its label for the toast, or null if nothing to undo. */
  undo(): string | null {
    const entry = this.undoStack.pop();
    if (!entry || !this.guard()) return null;
    this.undoing = true;
    try {
      const ids = new Map<string, string>();
      for (const step of [...entry.steps].reverse()) step(ids);
    } finally {
      this.undoing = false;
    }
    this.afterLocalWrite();
    return entry.label;
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
      this.saveProjectsCache();
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  project(id: string | null): Project | undefined {
    return id ? this.projects.find((p) => p.id === id) : undefined;
  }

  /** Top-level projects first, each followed by its children, in sidebar order. */
  projectTree(includeArchived = false): { project: Project; depth: number }[] {
    const live = this.projects
      .filter((p) => includeArchived || !p.archived)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const ids = new Set(live.map((p) => p.id));
    const out: { project: Project; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const p of live.filter((x) => (x.parentId && ids.has(x.parentId) ? x.parentId : null) === parentId)) {
        out.push({ project: p, depth });
        if (depth < 3) walk(p.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  async addProject(fields: Partial<Omit<Project, "id">> & { name: string }): Promise<Project> {
    if (!this.guard()) throw new Error("TaskDB is read-only until you activate a license.");
    const order = this.projects.reduce((m, p) => Math.max(m, p.order), 0) + 1;
    const color = fields.color ?? PROJECT_COLORS[(this.projects.length + 5) % PROJECT_COLORS.length]!;
    const project = await this.projectsApi!.create({ order, color, sections: [], ...fields });
    this.projects = [...this.projects, project];
    this.saveProjectsCache();
    this.emit();
    return project;
  }

  async updateProject(id: string, fields: Partial<Omit<Project, "id">>): Promise<void> {
    if (!this.guard()) return;
    this.projects = this.projects.map((p) => (p.id === id ? { ...p, ...fields } : p));
    this.saveProjectsCache();
    this.emit();
    try {
      await this.projectsApi!.update(id, fields);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      void this.refreshProjects();
      throw e;
    }
  }

  /** True when `id` is `ancestorId` or sits somewhere beneath it. */
  isWithinProject(id: string | null, ancestorId: string): boolean {
    for (let p = id ? this.project(id) : undefined, n = 0; p && n < 50; p = p.parentId ? this.project(p.parentId) : undefined, n++) {
      if (p.id === ancestorId) return true;
    }
    return false;
  }

  /**
   * Sidebar drag: puts a project under `parentId` (null = top level), just before `beforeId`
   * or last. Costs one Notion request; the new order sits between its neighbours.
   */
  async moveProject(id: string, parentId: string | null, beforeId: string | null = null): Promise<void> {
    if (this.isWithinProject(parentId, id)) return; // can't nest a project inside itself
    const siblings = this.projects
      .filter((p) => !p.archived && p.id !== id && (p.parentId ?? null) === parentId)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const at = beforeId ? siblings.findIndex((p) => p.id === beforeId) : -1;
    const idx = at < 0 ? siblings.length : at;
    const prev = siblings[idx - 1]?.order;
    const next = siblings[idx]?.order;
    const order =
      prev === undefined && next === undefined ? 1 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    const current = this.project(id);
    if (!current || ((current.parentId ?? null) === parentId && current.order === order)) return;
    await this.updateProject(id, { parentId, order });
  }

  /** Deletes the project and its tasks (from Notion too). Sub-projects move up a level. */
  async deleteProject(id: string): Promise<void> {
    if (!this.guard()) return;
    const project = this.project(id);
    if (!project) return;
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.projectId === id && !t.parentId)) this.deleteTask(t.id);
    });
    for (const child of this.projects.filter((p) => p.parentId === id)) {
      await this.updateProject(child.id, { parentId: project.parentId });
    }
    this.projects = this.projects.filter((p) => p.id !== id);
    this.saveProjectsCache();
    this.emit();
    await this.projectsApi!.trash(id);
  }

  private saveProjectsCache(): void {
    this.store.setMeta("projects", JSON.stringify(this.projects));
  }

  // ---- Sections ----

  sections(projectId: string): string[] {
    const project = this.project(projectId);
    const declared = project?.sections ?? [];
    // Sections set from Notion that the project list doesn't know yet still show up.
    const used = this.tasks()
      .filter((t) => t.projectId === projectId && t.section && !declared.includes(t.section))
      .map((t) => t.section!);
    return [...declared, ...uniqueSorted(used)];
  }

  async addSection(projectId: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean || this.sections(projectId).includes(clean)) return;
    await this.updateProject(projectId, { sections: [...this.sections(projectId), clean] });
  }

  async renameSection(projectId: string, from: string, to: string): Promise<void> {
    const clean = to.trim();
    if (!clean || clean === from) return;
    const renamed = [...new Set(this.sections(projectId).map((s) => (s === from ? clean : s)))];
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.projectId === projectId && t.section === from)) {
        this.updateTask(t.id, { section: clean });
      }
    });
    await this.updateProject(projectId, { sections: renamed });
  }

  /** Removes a section; its tasks stay in the project without a section. */
  async deleteSection(projectId: string, name: string): Promise<void> {
    const remaining = this.sections(projectId).filter((s) => s !== name);
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.projectId === projectId && t.section === name)) {
        this.updateTask(t.id, { section: null });
      }
    });
    await this.updateProject(projectId, { sections: remaining });
  }

  async moveSection(projectId: string, name: string, delta: -1 | 1): Promise<void> {
    const list = [...this.sections(projectId)];
    const i = list.indexOf(name);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    await this.updateProject(projectId, { sections: list });
  }

  // ---- Templates ----

  templates(): ProjectTemplate[] {
    return JSON.parse(this.store.getMeta("templates") ?? "[]");
  }

  saveTemplate(projectId: string, name: string): void {
    const t: ProjectTemplate = {
      id: `tpl-${Date.now()}`,
      name: name.trim(),
      sections: this.sections(projectId),
      createdAt: new Date().toISOString(),
    };
    this.store.setMeta("templates", JSON.stringify([...this.templates(), t]));
    this.emit();
  }

  deleteTemplate(id: string): void {
    this.store.setMeta("templates", JSON.stringify(this.templates().filter((t) => t.id !== id)));
    this.emit();
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

  updateSettings(patch: Partial<Settings>): void {
    this.saveSettings({ ...this.settings(), ...patch });
  }

  toggleCollapsed(key: string): void {
    const c = new Set(this.settings().collapsed);
    c.has(key) ? c.delete(key) : c.add(key);
    this.updateSettings({ collapsed: [...c] });
  }

  displayPrefs(viewKey: string): DisplayPrefs {
    if (!this.store) return DEFAULT_PREFS;
    const all = JSON.parse(this.store.getMeta("displayPrefs") ?? "{}");
    return { ...DEFAULT_PREFS, ...(all[viewKey] ?? {}) };
  }

  setDisplayPrefs(viewKey: string, patch: Partial<DisplayPrefs> | null): void {
    const all = JSON.parse(this.store.getMeta("displayPrefs") ?? "{}");
    if (patch === null) delete all[viewKey];
    else all[viewKey] = { ...(all[viewKey] ?? {}), ...patch };
    this.store.setMeta("displayPrefs", JSON.stringify(all));
    this.emit();
  }

  // ---- Tags & people (rename or remove everywhere) ----

  renameLabel(from: string, to: string): void {
    const clean = to.trim().replace(/^@/, "");
    if (!clean || clean === from) return;
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.labels.includes(from))) {
        this.updateTask(t.id, { labels: [...new Set(t.labels.map((l) => (l === from ? clean : l)))] });
      }
    }, `Renamed tag ${from}`);
  }

  removeLabel(name: string): void {
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.labels.includes(name))) {
        this.updateTask(t.id, { labels: t.labels.filter((l) => l !== name) });
      }
    }, `Removed tag ${name}`);
  }

  renamePerson(from: string, to: string): void {
    const clean = to.trim();
    if (!clean || clean === from) return;
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.person === from)) this.updateTask(t.id, { person: clean });
    }, `Renamed ${from}`);
    this.store.setMeta("people", JSON.stringify(this.extraPeople().map((p) => (p === from ? clean : p))));
  }

  removePerson(name: string): void {
    this.transaction(() => {
      for (const t of this.tasks().filter((t) => t.person === name)) this.updateTask(t.id, { person: null });
    }, `Removed ${name}`);
    this.store.setMeta("people", JSON.stringify(this.extraPeople().filter((p) => p !== name)));
    this.emit();
  }

  // ---- License ----

  licenseState(): LicenseState {
    return computeState(this.trialStartedAt, this.license, Date.now());
  }

  licenseKey(): string | null {
    return this.license?.key ?? null;
  }

  /** Writes are blocked once the trial or license has ended; tasks stay readable. */
  private guard(): boolean {
    if (canEdit(this.licenseState())) return true;
    this.onPaywall();
    return false;
  }

  private async loadLicense(): Promise<void> {
    const started = await this.platform.secureGet("trial-start").catch(() => null);
    if (started && Number.isFinite(Number(started))) this.trialStartedAt = Number(started);
    else await this.platform.secureSet("trial-start", String(this.trialStartedAt)).catch(() => {});
    const raw = await this.platform.secureGet("license").catch(() => null);
    this.license = raw ? JSON.parse(raw) : null;
  }

  private async saveLicense(record: LicenseRecord | null): Promise<void> {
    this.license = record;
    if (record) await this.platform.secureSet("license", JSON.stringify(record));
    else await this.platform.secureDelete("license");
    this.emit();
  }

  async activateLicense(key: string): Promise<void> {
    const ls = new LemonSqueezy(this.platform.fetch);
    await this.saveLicense(await ls.activate(key, instanceName()));
  }

  async deactivateLicense(): Promise<void> {
    if (!this.license) return;
    await new LemonSqueezy(this.platform.fetch).deactivate(this.license);
    await this.saveLicense(null);
  }

  /** Daily check so renewals, refunds and lapsed subscriptions are picked up. */
  async revalidate(force = false): Promise<void> {
    if (!this.license) return;
    if (!force && Date.now() - this.license.lastValidatedAt < VALIDATE_EVERY_MS) return;
    try {
      await this.saveLicense(await new LemonSqueezy(this.platform.fetch).validate(this.license));
    } catch (e) {
      // Offline: keep the old record; the grace period counts down from lastValidatedAt.
      if (e instanceof LicenseError && e.definitive) await this.saveLicense({ ...this.license, status: "disabled" });
    }
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

function instanceName(): string {
  return `TaskDB on ${navigator.platform || "Mac"} (${new Date().toISOString().slice(0, 10)})`;
}

function withProjectDefaults(p: Project): Project {
  const defaults: Pick<Project, "emoji" | "favorite" | "parentId" | "sections"> = {
    emoji: null,
    favorite: false,
    parentId: null,
    sections: [],
  };
  return { ...defaults, ...p };
}

export type ScheduleTarget = "today" | "tomorrow" | "weekend" | "nextWeek" | "none";

/** New due value for a schedule key, keeping the existing time of day. */
export function scheduleDue(current: string | null, target: ScheduleTarget, now = new Date()): string | null {
  if (target === "none") return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = {
    today: 0,
    tomorrow: 1,
    // Next Saturday (a week out if today is Saturday).
    weekend: (6 - today.getDay() + 7) % 7 || 7,
    // Next Monday.
    nextWeek: (8 - today.getDay()) % 7 || 7,
  }[target];
  const day = new Date(today);
  day.setDate(day.getDate() + offset);
  if (current && hasTime(current)) {
    const t = parseDue(current);
    day.setHours(t.getHours(), t.getMinutes(), 0, 0);
    return toLocalIso(day);
  }
  return toDateStr(day);
}

function uniqueSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

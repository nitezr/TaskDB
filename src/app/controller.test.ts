// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDateStr } from "../core/dates";
import { P } from "../notion/mapping";
import { MemoryStore } from "../store/store";
import { FakeNotion } from "../sync/fakeNotion";
import { AppController } from "./controller";
import type { Platform, SecureItem } from "./platform";

const DAY = 86_400_000;
const title = (s: string) => ({ title: [{ plain_text: s }] });

function setup(opts: { trialStart?: number; lsResponse?: unknown; signIn?: Record<string, string> } = {}) {
  const notion = new FakeNotion();
  notion.minute = Date.now();
  const secure = new Map<string, string>();
  if (opts.trialStart !== undefined) secure.set("trial-start", String(opts.trialStart));
  const platform: Platform = {
    kind: "demo",
    fetch: async (url, init) => {
      if (url.includes("lemonsqueezy")) return new Response(JSON.stringify(opts.lsResponse ?? {}), { status: 200 });
      return notion.fetch(url, init);
    },
    openStore: async () => new MemoryStore(),
    secureGet: async (k: SecureItem) => secure.get(k) ?? null,
    secureSet: async (k: SecureItem, v: string) => void secure.set(k, v),
    secureDelete: async (k: SecureItem) => void secure.delete(k),
    openUrl: async () => {},
    notionSignIn: async () => new URLSearchParams(opts.signIn ?? {}),
    notify: async () => {},
    onQuickAdd: async () => {},
    onFocusChange: () => {},
  };
  const app = new AppController(platform);
  return { app, notion, secure };
}

async function ready(app: AppController) {
  await app.boot();
  await app.finishSetup("token", { existing: { tasksDataSourceId: "ds", projectsDataSourceId: "projects" } });
  await settle();
}

/** Lets debounced pushes, polls and rate-limited requests run. */
const settle = () => vi.advanceTimersByTimeAsync(5_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(2026, 8, 26, 10, 0));
});
afterEach(() => vi.useRealTimers());

describe("AppController", () => {
  it("loads existing Notion tasks after setup", async () => {
    const { app, notion } = setup();
    notion.addPage({ [P.title]: title("From Notion") });
    await ready(app);
    expect(app.phase).toBe("ready");
    expect(app.tasks().map((t) => t.title)).toEqual(["From Notion"]);
  });

  it("creates an unknown #project in Notion during quick add", async () => {
    const { app, notion } = setup();
    await ready(app);
    const task = await app.quickAdd("Pitch deck #Fundraising p1");
    await settle();
    const project = app.projects.find((p) => p.name === "Fundraising");
    expect(project).toBeDefined();
    expect(task?.projectId).toBe(project!.id);
    const page = notion.pages.get(app.task(task!.id)!.notionId!)!;
    expect(page.properties[P.projectId].relation).toEqual([{ id: project!.id }]);
  });

  it("moves a recurring task to its next date instead of completing it", async () => {
    const { app } = setup();
    await ready(app);
    const t = app.createTask({ title: "Standup", due: "2026-09-26", recurrence: "every weekday" })!;
    app.complete(t.id);
    expect(app.task(t.id)).toMatchObject({ done: false, due: "2026-09-28" });
  });

  it("completes sub-tasks with their parent", async () => {
    const { app } = setup();
    await ready(app);
    const parent = app.createTask({ title: "Launch" })!;
    const child = app.createTask({ title: "Write copy", parentId: parent.id })!;
    app.complete(parent.id);
    expect(app.task(child.id)).toMatchObject({ done: true, completedAt: toDateStr(new Date()) });
  });

  it("pushes local changes to Notion in the background", async () => {
    const { app, notion } = setup();
    await ready(app);
    const t = app.createTask({ title: "Sync me" })!;
    app.updateTask(t.id, { priority: 1 });
    expect(notion.pages.size).toBe(0);
    await settle();
    expect(notion.pages.size).toBe(1);
    expect(app.syncStatus().pending).toBe(0);
  });

  it("goes read-only and opens the paywall when the trial has ended", async () => {
    const { app } = setup({ trialStart: Date.now() - 15 * DAY });
    await ready(app);
    const paywall = vi.fn();
    app.onPaywall = paywall;
    expect(app.licenseState()).toEqual({ kind: "expired", reason: "trial" });
    expect(app.createTask({ title: "Blocked" })).toBeNull();
    expect(paywall).toHaveBeenCalled();
    expect(app.tasks()).toHaveLength(0);
  });

  it("unlocks editing after activating a license", async () => {
    const { app, secure } = setup({
      trialStart: Date.now() - 15 * DAY,
      lsResponse: {
        activated: true,
        license_key: { status: "active", expires_at: "2027-09-26T00:00:00Z" },
        instance: { id: "i-1" },
      },
    });
    await ready(app);
    await app.activateLicense("KEY");
    expect(app.licenseState().kind).toBe("licensed");
    expect(secure.get("license")).toContain("i-1");
    expect(app.createTask({ title: "Allowed" })).not.toBeNull();
  });

  it("can render settings before the store has opened", () => {
    const { app } = setup();
    expect(app.phase).toBe("loading");
    expect(app.settings().theme).toBe("system");
  });

  it("signs in with Notion and reports the duplicated template page", async () => {
    const { app } = setup({ signIn: { token: "ntn_x", template: "tpl-1", state: "s" } });
    await app.boot();
    const res = await app.signInWithNotion("https://auth.example.dev");
    expect(res).toMatchObject({ token: "ntn_x", templateId: "tpl-1" });
  });

  it("explains a cancelled Notion sign-in", async () => {
    const { app } = setup({ signIn: { error: "access_denied" } });
    await app.boot();
    await expect(app.signInWithNotion("https://auth.example.dev")).rejects.toThrow("Notion access was cancelled.");
  });

  it("starts the trial on first launch and keeps it across restarts", async () => {
    const first = setup();
    await first.app.boot();
    const saved = first.secure.get("trial-start");
    expect(Number(saved)).toBe(Date.now());
    expect(first.app.licenseState()).toEqual({ kind: "trial", daysLeft: 14 });
  });
});

import { describe, expect, it } from "vitest";
import { NotionClient } from "../notion/client";
import { P } from "../notion/mapping";
import { MemoryStore } from "../store/store";
import type { Clock } from "./clock";
import { SyncEngine } from "./engine";
import { FakeNotion } from "./fakeNotion";
import { RateLimiter } from "./rateLimiter";

function fakeClock(): Clock & { t: number; slept: number[] } {
  const c = {
    t: 0,
    slept: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.slept.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function setup() {
  const notion = new FakeNotion();
  const clock = fakeClock();
  const client = new NotionClient({
    token: "secret",
    fetch: notion.fetch,
    clock,
    limiter: new RateLimiter({ clock }),
  });
  const store = new MemoryStore();
  let n = 0;
  const engine = new SyncEngine({ client, store, tasksDataSourceId: "ds", newId: () => `local-${++n}` });
  return { notion, clock, client, store, engine };
}

const titleProp = (s: string) => ({ title: [{ plain_text: s }] });

describe("RateLimiter", () => {
  it("keeps sustained traffic under the configured rate", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ ratePerSec: 2.5, burst: 3, clock });
    for (let i = 0; i < 30; i++) await limiter.acquire();
    // 3 free (burst) + 27 at 2.5/s ≈ 10.8s
    expect(clock.t).toBeGreaterThanOrEqual(10_800);
  });

  it("pauses everyone after a 429", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ clock });
    await limiter.acquire();
    limiter.pauseFor(5_000);
    await limiter.acquire();
    expect(clock.t).toBeGreaterThanOrEqual(5_000);
  });
});

describe("NotionClient", () => {
  it("honours Retry-After on 429 and then succeeds", async () => {
    const { notion, client, clock } = setup();
    notion.failures.push({ status: 429, headers: { "Retry-After": "3" } });
    await client.createPage("ds", { [P.title]: { title: [] } });
    expect(notion.requests).toHaveLength(2);
    expect(clock.t).toBeGreaterThanOrEqual(3_000);
  });

  it("does not retry validation errors", async () => {
    const { notion, client } = setup();
    notion.failures.push({ status: 400, body: { code: "validation_error", message: "bad" } });
    await expect(client.createPage("ds", {})).rejects.toMatchObject({ retryable: false });
    expect(notion.requests).toHaveLength(1);
  });
});

describe("SyncEngine push", () => {
  it("updates the local copy instantly, before any request", () => {
    const { engine, store, notion } = setup();
    const t = engine.createTask({ title: "Buy milk" });
    expect(store.getTask(t.id)?.title).toBe("Buy milk");
    expect(notion.requests).toHaveLength(0);
  });

  it("merges rapid edits to one task into a single request", async () => {
    const { engine, notion } = setup();
    const t = engine.createTask({ title: "Draft" });
    engine.updateTask(t.id, { title: "Draft v2" });
    engine.updateTask(t.id, { priority: 1 });
    engine.updateTask(t.id, { done: true });
    await engine.push();
    expect(notion.requests).toHaveLength(1);
    const page = [...notion.pages.values()][0]!;
    expect(page.properties[P.title].title[0].text.content).toBe("Draft v2");
    expect(page.properties[P.done].checkbox).toBe(true);
  });

  it("sends nothing for a task created and deleted before sync", async () => {
    const { engine, notion } = setup();
    const t = engine.createTask({ title: "Oops" });
    engine.deleteTask(t.id);
    await engine.push();
    expect(notion.requests).toHaveLength(0);
  });

  it("trashes a synced task that is deleted locally", async () => {
    const { engine, notion } = setup();
    const t = engine.createTask({ title: "Old" });
    await engine.push();
    engine.deleteTask(t.id);
    await engine.push();
    expect([...notion.pages.values()][0]!.in_trash).toBe(true);
  });

  it("creates the parent before the sub-task and links them", async () => {
    const { engine, notion, store } = setup();
    const parent = engine.createTask({ title: "Parent" });
    const child = engine.createTask({ title: "Child", parentId: parent.id });
    await engine.push();
    const parentNotionId = store.getTask(parent.id)!.notionId;
    const childPage = notion.pages.get(store.getTask(child.id)!.notionId!)!;
    expect(childPage.properties[P.parentId].relation).toEqual([{ id: parentNotionId }]);
  });

  it("keeps the queue when offline and delivers later", async () => {
    const { engine, notion } = setup();
    engine.createTask({ title: "Offline" });
    for (let i = 0; i < 5; i++) notion.failures.push({ status: 503 });
    await engine.push();
    expect(engine.outbox.size).toBe(1);
    await engine.push();
    expect(engine.outbox.size).toBe(0);
    expect(notion.pages.size).toBe(1);
  });

  it("flags the task when Notion permanently rejects a write", async () => {
    const { engine, notion, store } = setup();
    const t = engine.createTask({ title: "Bad" });
    notion.failures.push({ status: 400, body: { code: "validation_error", message: "Invalid select" } });
    await engine.push();
    expect(engine.outbox.size).toBe(0);
    expect(store.getTask(t.id)?.syncError).toBe("Invalid select");
  });
});

describe("SyncEngine pull", () => {
  it("imports all tasks on first sync, paging 100 at a time", async () => {
    const { engine, notion, store } = setup();
    for (let i = 0; i < 250; i++) notion.addPage({ [P.title]: titleProp(`Task ${i}`) });
    await engine.pull();
    expect(store.allTasks()).toHaveLength(250);
    expect(notion.requests).toHaveLength(3);
  });

  it("fetches only recent changes once a cursor exists", async () => {
    const { engine, notion, store } = setup();
    for (let i = 0; i < 250; i++) notion.addPage({ [P.title]: titleProp(`Task ${i}`) });
    await engine.pull();
    notion.minute += 10 * 60_000;
    notion.editPage("page-3", { [P.title]: titleProp("Moves the cursor") });
    await engine.pull();
    notion.minute += 10 * 60_000;
    notion.editPage("page-7", { [P.title]: titleProp("Edited in Notion") });
    notion.requests = [];
    await engine.pull();
    expect(notion.requests).toHaveLength(1);
    expect(store.getTask("page-7")?.title).toBe("Edited in Notion");
  });

  it("catches edits made within the same minute as the cursor", async () => {
    const { engine, notion, store } = setup();
    notion.addPage({ [P.title]: titleProp("A") });
    await engine.pull();
    notion.editPage("page-1", { [P.title]: titleProp("A, same minute") });
    await engine.pull();
    expect(store.getTask("page-1")?.title).toBe("A, same minute");
  });

  it("does not overwrite local edits that have not been pushed", async () => {
    const { engine, notion, store } = setup();
    notion.addPage({ [P.title]: titleProp("Server") });
    await engine.pull();
    engine.updateTask("page-1", { title: "Mine" });
    notion.minute += 60_000;
    notion.editPage("page-1", { [P.title]: titleProp("Theirs") });
    await engine.pull();
    expect(store.getTask("page-1")?.title).toBe("Mine");
  });

  it("does not duplicate tasks it created itself", async () => {
    const { engine, store } = setup();
    engine.createTask({ title: "Mine" });
    await engine.push();
    await engine.pull();
    expect(store.allTasks()).toHaveLength(1);
  });

  it("removes tasks deleted in Notion on reconcile", async () => {
    const { engine, notion, store } = setup();
    notion.addPage({ [P.title]: titleProp("A") });
    notion.addPage({ [P.title]: titleProp("B") });
    await engine.pull();
    notion.pages.delete("page-1");
    await engine.reconcile();
    expect(store.allTasks().map((t) => t.title)).toEqual(["B"]);
  });
});

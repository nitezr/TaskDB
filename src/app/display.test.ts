// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/store";
import { FakeNotion } from "../sync/fakeNotion";
import type { Task } from "../types";
import { DEFAULT_FIELDS } from "../types";
import { AppController } from "./controller";
import { buildViewModel, DEFAULT_PREFS, sortTasks } from "./display";
import type { Platform } from "./platform";
import { actionForCombo, comboFromEvent, displayCombo } from "./shortcuts";

const NOW = new Date(2026, 8, 26, 10);

async function appWith(tasks: Partial<Task>[], projects: { id: string; name: string; sections?: string[] }[] = []) {
  const notion = new FakeNotion();
  const platform = {
    kind: "demo",
    fetch: notion.fetch,
    openStore: async () => new MemoryStore(),
    secureGet: async () => null,
    secureSet: async () => {},
    secureDelete: async () => {},
  } as unknown as Platform;
  const app = new AppController(platform);
  const store = new MemoryStore();
  (app as any).store = store;
  for (const [i, t] of tasks.entries()) {
    store.putTask({ ...DEFAULT_FIELDS, id: `t${i}`, notionId: null, remoteEditedAt: null, syncError: null, ...t } as Task);
  }
  app.projects = projects.map((p) => ({ color: "blue", archived: false, order: 0, emoji: null, favorite: false, parentId: null, sections: [], notes: null, ...p }));
  return app;
}

describe("buildViewModel", () => {
  it("groups Today into Overdue and Today", async () => {
    const app = await appWith([
      { title: "Late", due: "2026-09-20" },
      { title: "Now", due: "2026-09-26" },
      { title: "Later", due: "2026-09-30" },
    ]);
    const vm = buildViewModel({ kind: "today" }, app, DEFAULT_PREFS, { now: NOW });
    expect(vm.groups.map((g) => [g.title, g.tasks.map((t) => t.title)])).toEqual([
      ["Overdue", ["Late"]],
      ["Today", ["Now"]],
    ]);
    expect(vm.groups[0]!.overdue).toBe(true);
  });

  it("shows a project's sections with a (No section) group first", async () => {
    const app = await appWith(
      [
        { title: "Loose", projectId: "p1" },
        { title: "Spec", projectId: "p1", section: "Plan" },
      ],
      [{ id: "p1", name: "Acme", sections: ["Plan", "Build"] }],
    );
    const vm = buildViewModel({ kind: "project", id: "p1" }, app, DEFAULT_PREFS, { now: NOW });
    expect(vm.groups.map((g) => g.title)).toEqual(["(No section)", "Plan", "Build"]);
    expect(vm.groups[2]!.patch).toEqual({ section: "Build", projectId: "p1" });
  });

  it("lays Upcoming out as one group per day from the chosen start", async () => {
    const app = await appWith([{ title: "Mon", due: "2026-09-28" }]);
    const vm = buildViewModel({ kind: "upcoming" }, app, DEFAULT_PREFS, { now: NOW, upcomingDays: 7 });
    expect(vm.groups).toHaveLength(7);
    expect(vm.groups[2]!.tasks.map((t) => t.title)).toEqual(["Mon"]);
    expect(vm.groups[2]!.patch).toEqual({ due: "2026-09-28" });
  });

  it("applies the Display menu's priority filter and grouping", async () => {
    const app = await appWith([
      { title: "A", priority: 1 },
      { title: "B", priority: 4 },
    ]);
    const vm = buildViewModel({ kind: "inbox" }, app, { ...DEFAULT_PREFS, groupBy: "priority" }, { now: NOW });
    // Empty priority groups are dropped, like Remit.
    expect(vm.groups.map((g) => g.title)).toEqual(["Priority 1", "Priority 4"]);
    expect(vm.groups.map((g) => g.tasks.length)).toEqual([1, 1]);
    const only = buildViewModel({ kind: "inbox" }, app, { ...DEFAULT_PREFS, priority: 1 }, { now: NOW });
    expect(only.count).toBe(1);
  });
});

describe("sortTasks", () => {
  const t = (title: string, f: Partial<Task>) => ({ ...DEFAULT_FIELDS, id: title, notionId: null, remoteEditedAt: null, syncError: null, title, ...f }) as Task;
  it("smart sort puts dated tasks first, then priority", () => {
    const out = sortTasks([t("none", { priority: 1 }), t("later", { due: "2026-10-01" }), t("soon", { due: "2026-09-27" })], "smart");
    expect(out.map((x) => x.title)).toEqual(["soon", "later", "none"]);
  });
});

describe("shortcuts", () => {
  const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as KeyboardEvent;
  it("maps default keys to actions", () => {
    expect(actionForCombo(comboFromEvent(ev("e"))!, {})).toBe("completeTask");
    expect(actionForCombo(comboFromEvent(ev("T", { shiftKey: true }))!, {})).toBe("scheduleClear");
    expect(actionForCombo(comboFromEvent(ev("?", { shiftKey: true }))!, {})).toBe("shortcutsPanel");
  });
  it("respects remapping", () => {
    expect(actionForCombo("x", { completeTask: ["x"] })).toBe("completeTask");
    expect(actionForCombo("e", { completeTask: ["x"] })).toBeNull();
  });
  it("renders combos with Mac glyphs", () => {
    expect(displayCombo("shift+t")).toBe("⇧T");
    expect(displayCombo("meta+k")).toBe("⌘K");
  });

  it("shows a week of Upcoming, then later days with tasks behind a 'Nothing until' line", async () => {
    const app = await appWith([
      { title: "Soon", due: "2026-09-27" },
      { title: "Far", due: "2026-10-20" },
    ]);
    const vm = buildViewModel({ kind: "upcoming" }, app, DEFAULT_PREFS, { now: NOW, upcomingOpenEnded: true });
    expect(vm.groups.length).toBe(8);
    expect(vm.groups[7]!.title).toBe("20 Oct · Tuesday");
    expect(vm.groups[7]!.gap).toBe("Nothing until 20 Oct");
    expect(vm.groups[1]!.gap).toBeUndefined();
  });

  it("puts evening tasks in a This Evening group at the bottom of Today, and parks Someday tasks", async () => {
    const app = await appWith([
      { title: "Morning", due: "2026-09-26" },
      { title: "Evening", due: "2026-09-26", when: "evening" },
      { title: "Parked", when: "someday" },
    ]);
    const today = buildViewModel({ kind: "today" }, app, DEFAULT_PREFS, { now: NOW });
    expect(today.groups.map((g) => [g.title, g.tasks.map((t) => t.title)])).toEqual([
      ["Today", ["Morning"]],
      ["This Evening", ["Evening"]],
    ]);
    expect(buildViewModel({ kind: "inbox" }, app, DEFAULT_PREFS, { now: NOW }).count).toBe(2);
    expect(buildViewModel({ kind: "someday" }, app, DEFAULT_PREFS, { now: NOW }).count).toBe(1);
  });
});

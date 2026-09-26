import { addDays, formatDue, startOfDay, toDateStr } from "../core/dates";
import { MemoryStore } from "../store/store";
import { FakeNotion } from "../sync/fakeNotion";
import type { Platform } from "./platform";

/**
 * Browser demo: a fake Notion in memory, seeded with sample data.
 * Used for UI development, screenshots and a try-before-you-buy page.
 */
export function demoPlatform(): Platform {
  const notion = new FakeNotion();
  notion.minute = Date.now();
  seed(notion);
  return {
    kind: "demo",
    fetch: notion.fetch,
    openStore: async () => new MemoryStore(),
    secureGet: async (k) => localStorage.getItem(`demo-${k}`),
    secureSet: async (k, v) => localStorage.setItem(`demo-${k}`, v),
    secureDelete: async (k) => localStorage.removeItem(`demo-${k}`),
    openUrl: async (url) => void window.open(url, "_blank"),
    notify: async (title, body) => {
      if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    },
    onQuickAdd: async () => {},
    onFocusChange: (cb) => {
      window.addEventListener("focus", () => cb(true));
      window.addEventListener("blur", () => cb(false));
    },
  };
}

function seed(n: FakeNotion) {
  const title = (s: string) => ({ title: [{ plain_text: s }] });
  const sel = (s: string | null) => ({ select: s ? { name: s } : null });
  const date = (s: string | null) => ({ date: s ? { start: s } : null });
  const rel = (id: string | null) => ({ relation: id ? [{ id }] : [] });

  const work = n.addPage({ Name: title("Work"), Color: sel("blue"), Order: { number: 1 } }, "projects");
  const home = n.addPage({ Name: title("Home"), Color: sel("green"), Order: { number: 2 } }, "projects");
  const launch = n.addPage({ Name: title("TaskDB Launch"), Color: sel("purple"), Order: { number: 3 } }, "projects");

  const today = startOfDay(new Date());
  const d = (days: number) => toDateStr(addDays(today, days));
  const at = (days: number, h: number) => {
    const x = addDays(today, days);
    x.setHours(h, 0, 0, 0);
    return formatDue(x, true);
  };
  const task = (t: string, o: { due?: string; p?: number; project?: string; labels?: string[]; person?: string; rec?: string; parent?: string } = {}) =>
    n.addPage({
      Name: title(t),
      Done: { checkbox: false },
      Due: date(o.due ?? null),
      Priority: sel(`p${o.p ?? 4}`),
      Project: rel(o.project ?? null),
      Labels: { multi_select: (o.labels ?? []).map((name) => ({ name })) },
      Person: sel(o.person ?? null),
      Recurrence: { rich_text: o.rec ? [{ plain_text: o.rec }] : [] },
      "Parent item": rel(o.parent ?? null),
    });

  task("Send Q3 report to Ravi", { due: at(0, 17), p: 1, project: work.id, person: "Ravi", labels: ["email"] });
  const deck = task("Prepare board deck", { due: d(0), p: 2, project: work.id });
  task("Collect revenue numbers", { project: work.id, parent: deck.id, person: "Priya" });
  task("Draft product slides", { project: work.id, parent: deck.id });
  task("Renew car insurance", { due: d(-2), p: 1, project: home.id, labels: ["errand"] });
  task("Water plants", { due: d(0), project: home.id, rec: "every mon,thu" });
  task("Weekly review", { due: d(1), p: 3, rec: "every week" });
  task("Write landing page copy", { due: d(2), p: 2, project: launch.id, labels: ["writing"] });
  task("Set up Lemon Squeezy store", { due: d(3), project: launch.id, labels: ["waiting"], person: "Priya" });
  task("Record demo video", { due: d(5), project: launch.id });
  task("Book dentist appointment");
  task("Read 'Shape Up' chapter 3", { labels: ["reading"] });
}

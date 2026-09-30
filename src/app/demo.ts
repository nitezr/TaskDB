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
    notionSignIn: async () => {
      await new Promise((r) => setTimeout(r, 600));
      return new URLSearchParams({ token: "demo-token", workspace: "Demo" });
    },
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
  const text = (s: string | null | undefined) => ({ rich_text: s ? [{ plain_text: s }] : [] });
  const sel = (s: string | null | undefined) => ({ select: s ? { name: s } : null });
  const date = (s: string | null) => ({ date: s ? { start: s } : null });
  const rel = (id: string | null | undefined) => ({ relation: id ? [{ id }] : [] });

  // Mirrors Remit's demo workspace: two groups of projects, sections, favourites.
  let order = 0;
  const project = (name: string, o: { color: string; emoji?: string; parent?: string; sections?: string[]; favorite?: boolean; notes?: string }) => {
    const page = n.addPage(
      {
        Name: title(name),
        Color: sel(o.color),
        Order: { number: ++order },
        Favorite: { checkbox: Boolean(o.favorite) },
        "Parent project": rel(o.parent),
        Sections: text(o.sections?.join("\n")),
        Notes: text(o.notes),
      },
      "projects",
    );
    if (o.emoji) page.icon = { type: "emoji", emoji: o.emoji };
    return page.id;
  };
  const work = project("Work", { color: "gray" });
  const acme = project("Acme Launch", { color: "blue", emoji: "🚀", parent: work, sections: ["Planning", "Design", "Launch week"], favorite: true, notes: "Public launch of Acme on **14 Oct**. Done = press kit out, demo video live, first 100 sign-ups." });
  const orbit = project("Orbit App", { color: "purple", emoji: "🌟", parent: work, sections: ["Bugs", "Features"] });
  const personal = project("Personal", { color: "gray" });
  const home = project("Home", { color: "green", emoji: "🏠", parent: personal });
  const finance = project("Finance", { color: "orange", emoji: "💰", parent: personal });
  const reading = project("Reading", { color: "brown", emoji: "📚", parent: personal });
  project("Side Project", { color: "green", emoji: "🌱" });

  const today = startOfDay(new Date());
  const d = (days: number) => toDateStr(addDays(today, days));
  const at = (days: number, h: number, m = 0) => {
    const x = addDays(today, days);
    x.setHours(h, m, 0, 0);
    return formatDue(x, true);
  };
  const task = (
    t: string,
    o: { due?: string; p?: number; project?: string; section?: string; labels?: string[]; person?: string; rec?: string; parent?: string; notes?: string; deadline?: string; mins?: number; when?: string } = {},
  ) =>
    n.addPage({
      Name: title(t),
      Done: { checkbox: false },
      Due: date(o.due ?? null),
      Priority: sel(`p${o.p ?? 4}`),
      Project: rel(o.project),
      Section: sel(o.section),
      Notes: text(o.notes),
      Labels: { multi_select: (o.labels ?? []).map((name) => ({ name })) },
      Person: sel(o.person),
      Recurrence: text(o.rec),
      "Parent item": rel(o.parent),
      Deadline: date(o.deadline ?? null),
      "Duration (min)": { number: o.mins ?? null },
      When: sel(o.when),
    });

  task("Send Priya the signed contract", { due: d(-2), p: 2, project: acme, section: "Planning", person: "Priya", labels: ["waiting"] });
  task("Renew passport appointment", { due: d(-1), p: 3, project: home });
  task("Pay the credit card bill", { due: d(0), p: 1, project: finance, rec: "every month" });
  task("Decide on the launch venue", { due: d(0), p: 2, project: acme, section: "Planning", labels: ["decision"] });
  task("Check in with Sam about beta feedback", { due: d(0), p: 3, project: orbit, section: "Features", person: "Sam", labels: ["waiting"] });
  const copy = task("Finalize launch announcement copy", {
    due: at(0, 10),
    mins: 90,
    deadline: d(2),
    p: 1,
    project: acme,
    section: "Launch week",
    labels: ["discuss"],
    notes: "Keep it under **150 words** and lead with the problem.\n- [x] Draft headline\n- [ ] Pick hero screenshot\n- [ ] Legal review\nBrief: https://www.notion.so/acme/launch-brief",
  });
  task("Get legal sign-off", { project: acme, section: "Launch week", parent: copy.id });
  task("Review Orbit onboarding designs", { due: at(0, 14), mins: 45, p: 2, project: orbit, section: "Features", person: "Leo" });
  task("Water the plants", { due: at(0, 18), project: home, rec: "every mon,thu" });
  task("Grocery run", { due: d(1), project: home });
  task("Call mum", { due: d(0), when: "This Evening", project: home });
  task("Plan the Japan trip", { when: "Someday", project: personal });
  task("Read chapter 4 of Deep Work", { due: d(1), project: reading });
  task("Prep slides for the Acme all-hands", { due: at(1, 11), p: 2, project: acme, section: "Launch week" });
  task("1:1 with Leo", { due: at(1, 15, 30), project: orbit, person: "Leo", labels: ["discuss"] });
  task("Fix sign-up form validation", { due: d(2), p: 1, project: orbit, section: "Bugs" });
  task("Book a dentist appointment", { due: d(2), project: home });
  task("Weekly review", { due: at(2, 17), rec: "every week", labels: ["weekly"] });
  task("Draft the press kit", { due: d(3), p: 2, project: acme, section: "Design" });
  task("Pick the brand colour palette", { project: acme, section: "Design", person: "Priya" });
  task("Compare email marketing tools", { project: acme, section: "Planning", labels: ["decision"] });
  task("Record the product demo video", { due: d(4), deadline: d(6), p: 1, project: acme, section: "Launch week", person: "Sam" });
  task("Move savings to the holiday fund", { due: d(3), project: finance });
  task("Ship Orbit 1.2 to TestFlight", { due: d(6), p: 1, project: orbit, section: "Features" });
  task("Quarterly taxes", { due: d(12), deadline: d(15), p: 1, project: finance });
  task("Plant the herb garden", { labels: ["someday"] });
  task("Learn to make sourdough", { labels: ["someday"] });
  task("Sketch the side-project landing page", { labels: ["someday"] });
}

import { useState } from "react";
import { toDateStr } from "../../core/dates";
import { useApp } from "../hooks";

interface TourTask {
  section: string;
  title: string;
  notes: string;
  labels?: string[];
  person?: string;
  dueToday?: boolean;
  priority?: 1 | 2 | 3 | 4;
}

/** A practice project where every task teaches one feature by doing it (from Remit's tour). */
const TOUR_PROJECT = "Welcome to TaskDB";
const TOUR_SECTIONS = ["1 · Basics", "2 · Organise", "3 · Power moves"];
const TOUR_TASKS: TourTask[] = [
  { section: TOUR_SECTIONS[0]!, title: "Complete me: click the circle, or select me and press E", notes: "Completed tasks leave the list with a sound. ⌘Z brings the last one back.", dueToday: true },
  { section: TOUR_SECTIONS[0]!, title: "Press T to schedule me for today, or U for tomorrow", notes: "W is this weekend, N is next week, and 0 clears the date." },
  { section: TOUR_SECTIONS[0]!, title: "Double-click me, or press I, to open my details", notes: "Title, notes, date, repeat, priority, tags and section are all editable there." },
  { section: TOUR_SECTIONS[1]!, title: "Check in with Sam about the Acme launch plan", notes: "People are assigned with +Name. @waiting marks something you're waiting on.", labels: ["waiting"], person: "Sam", dueToday: true, priority: 2 },
  { section: TOUR_SECTIONS[1]!, title: "Press L and add the discuss tag to me", notes: "Tags are Notion multi-select values, so they show up in Notion too." },
  { section: TOUR_SECTIONS[1]!, title: "Move me to another section: open the Display menu, pick Board, and drag me", notes: "Or drag me onto a project in the sidebar." },
  { section: TOUR_SECTIONS[2]!, title: "Press Q and type: Call Priya tomorrow 5pm p1 @waiting +Priya", notes: "Quick add understands dates, times, priorities (p1 to p4), #project, @tag and +person." },
  { section: TOUR_SECTIONS[2]!, title: "Press ⌘K to search and jump to any project or task", notes: "Press ? any time for every keyboard shortcut. Change them in Settings." },
  { section: TOUR_SECTIONS[2]!, title: "Done? Right-click this project in the sidebar and delete it", notes: "That removes it and its tasks from Notion too." },
];

const STEPS = [
  {
    title: "Welcome to TaskDB",
    body: "A fast, keyboard-first workspace for your tasks — stored in your own Notion. Everything you do here is a change in Notion itself.",
  },
  {
    title: "List, Board and Calendar",
    body: "Every view can be a list, a board of columns (by day, section, priority, tag or project) or a calendar. The Display menu remembers your choice per view.",
  },
  {
    title: "Capture in one line",
    body: "Press Q and type “Call Priya tomorrow 5pm p1 #Work @waiting”. TaskDB sets the date, time, priority, project and tag at once. #, @ and + autocomplete as you type.",
  },
  {
    title: "Built for the keyboard",
    body: "J/K to move, E to complete, T/U/W/N to schedule, 1–4 for priority, I to open details, ⌘K to jump anywhere, ⌘Z to undo. Every key can be changed in Settings.",
  },
  {
    title: "Learn by doing",
    body: "Add a small practice project to Notion. Each task teaches one feature — complete them as you go, then delete the project.",
  },
];

export function Tour({ onClose, onOpenProject }: { onClose: () => void; onOpenProject: (id: string) => void }) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = step === STEPS.length - 1;
  const s = STEPS[step]!;

  const finish = () => {
    app.updateSettings({ tourDone: true });
    onClose();
  };

  const addPractice = async () => {
    setBusy(true);
    try {
      const project = await app.addProject({ name: TOUR_PROJECT, emoji: "👋", sections: TOUR_SECTIONS, color: "red" });
      const today = toDateStr(new Date());
      app.transaction(() => {
        for (const [i, t] of TOUR_TASKS.entries()) {
          app.createTask({
            title: t.title,
            notes: t.notes,
            projectId: project.id,
            section: t.section,
            labels: t.labels ?? [],
            person: t.person ?? null,
            due: t.dueToday ? today : null,
            priority: t.priority ?? 4,
            order: i + 1,
          });
        }
      }, "Added the practice project");
      finish();
      onOpenProject(project.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal tour">
        <div className="dots">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        <span className="logo" style={{ width: 34, height: 34, fontSize: 20 }}>
          ✓
        </span>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        {step === 0 && (
          <div className="sample">
            {[
              ["Send Sam the launch plan", "Today", "Sam👤 · waiting", "p1"],
              ["Review Priya's design notes", "Tomorrow", "Priya👤 · discuss", "p2"],
              ["Pay the internet bill", "Friday", "↻ monthly", "p4"],
            ].map(([t, d, m, p]) => (
              <div key={t} className="task" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className={`check ${p}`} />
                <div className="task-body">
                  <div className="task-title">{t}</div>
                  <div className="task-meta">
                    <span className={d === "Today" ? "due today" : "due"}>{d}</span>
                    <span className="tag">{m}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {step === 0 && (
          <ul className="points">
            <li>
              <span className="ico">#</span>Projects, sections, tags and people are real Notion properties — edit them in Notion too.
            </li>
            <li>
              <span className="ico">▥</span>List, Board and Calendar layouts, remembered for each view.
            </li>
            <li>
              <span className="ico">⌨</span>Keyboard-first: completing, scheduling and tagging each take one key.
            </li>
          </ul>
        )}
        <div className="tour-actions">
          <button className="link" onClick={finish}>
            {last ? "Not now" : "Skip tour"}
          </button>
          <span className="grow" />
          {step > 0 && (
            <button className="ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {last ? (
            <button className="primary" disabled={busy} onClick={() => void addPractice()}>
              {busy ? "Adding…" : "Add practice project"}
            </button>
          ) : (
            <button className="primary" onClick={() => setStep(step + 1)}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

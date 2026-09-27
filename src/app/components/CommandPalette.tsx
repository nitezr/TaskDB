import { useEffect, useMemo, useState } from "react";
import { dueLabel } from "../../core/dates";
import type { View } from "../display";
import { useApp } from "../hooks";

export interface PaletteAction {
  label: string;
  kind: string;
  icon: string;
  run: () => void;
}

/** ⌘K: jump to any view, project, tag or task, or run an app action. */
export function CommandPalette({
  onClose,
  onNavigate,
  onOpenTask,
  actions,
}: {
  onClose: () => void;
  onNavigate: (v: View) => void;
  onOpenTask: (id: string) => void;
  actions: PaletteAction[];
}) {
  const app = useApp();
  const [q, setQ] = useState("");
  const [hot, setHot] = useState(0);

  const results = useMemo<PaletteAction[]>(() => {
    const needle = q.trim().toLowerCase();
    const has = (s: string) => !needle || s.toLowerCase().includes(needle);
    const out: PaletteAction[] = [];
    const nav: [View, string, string][] = [
      [{ kind: "inbox" }, "Inbox", "📥"],
      [{ kind: "today" }, "Today", "▦"],
      [{ kind: "upcoming" }, "Upcoming", "🗓"],
      [{ kind: "browse" }, "Filters & Tags", "#"],
      [{ kind: "completed" }, "Completed", "✓"],
    ];
    for (const [v, label, icon] of nav) if (has(label)) out.push({ label, kind: "View", icon, run: () => onNavigate(v) });
    for (const { project } of app.projectTree())
      if (has(project.name)) out.push({ label: project.name, kind: "Project", icon: project.emoji ?? "#", run: () => onNavigate({ kind: "project", id: project.id }) });
    for (const f of app.filters()) if (has(f.name)) out.push({ label: f.name, kind: "Filter", icon: "☰", run: () => onNavigate({ kind: "filter", id: f.id }) });
    for (const l of app.labels()) if (has(l)) out.push({ label: l, kind: "Tag", icon: "⌗", run: () => onNavigate({ kind: "label", name: l }) });
    for (const a of actions) if (has(a.label)) out.push(a);
    if (needle) {
      const tasks = app
        .tasks()
        .filter((t) => !t.done && (t.title.toLowerCase().includes(needle) || (t.notes ?? "").toLowerCase().includes(needle)))
        .slice(0, 30);
      for (const t of tasks)
        out.push({
          label: t.title,
          kind: [app.projectName(t.projectId) ?? "Inbox", t.due ? dueLabel(t.due) : ""].filter(Boolean).join(" · "),
          icon: "○",
          run: () => onOpenTask(t.id),
        });
      out.push({ label: `Search tasks for “${q.trim()}”`, kind: "Search", icon: "🔍", run: () => onNavigate({ kind: "search", query: q.trim() }) });
    }
    return out;
  }, [q, app, actions, onNavigate, onOpenTask]);

  useEffect(() => setHot(0), [q]);
  useEffect(() => {
    document.querySelector(".palette .menu-item.hot")?.scrollIntoView({ block: "nearest" });
  }, [hot]);

  const run = (a: PaletteAction | undefined) => {
    if (!a) return;
    onClose();
    a.run();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Search tasks, projects, tags, or type a command…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHot((h) => Math.min(results.length - 1, h + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHot((h) => Math.max(0, h - 1));
            }
            if (e.key === "Enter") run(results[hot]);
          }}
        />
        <div className="palette-list">
          {results.map((r, i) => (
            <button key={`${r.kind}:${r.label}:${i}`} className={`menu-item ${i === hot ? "hot" : ""}`} onMouseEnter={() => setHot(i)} onClick={() => run(r)}>
              <span style={{ width: 20, textAlign: "center" }}>{r.icon}</span>
              <span>{r.label}</span>
              <span className="kind">{r.kind}</span>
            </button>
          ))}
          {!results.length && <div className="muted small" style={{ padding: 10 }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { hasIcon, ProjectIcon } from "./ProjectIcon";
import { dueLabel } from "../../core/dates";
import type { View } from "../display";
import { useApp } from "../hooks";
import { CheckCircleIcon, FilterIcon, FolderIcon, HashIcon, InboxIcon, LabelIcon, SearchIcon, TodayIcon, UpcomingIcon } from "../icons";

export interface PaletteAction {
  label: string;
  kind: string;
  icon: React.ReactNode;
  run: () => void;
}

/** ⌘K: jump to any view, project, label or task, or run an app action. */
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
    const nav: [View, string, React.ReactNode][] = [
      [{ kind: "inbox" }, "Inbox", <InboxIcon />],
      [{ kind: "today" }, "Today", <TodayIcon />],
      [{ kind: "upcoming" }, "Upcoming", <UpcomingIcon />],
      [{ kind: "browse" }, "Filters & Labels", <LabelIcon />],
      [{ kind: "completed" }, "Completed", <CheckCircleIcon />],
    ];
    for (const [v, label, icon] of nav) if (has(label)) out.push({ label, kind: "View", icon, run: () => onNavigate(v) });
    for (const { project } of app.projectTree())
      if (has(project.name)) out.push({ label: project.name, kind: "Project", icon: hasIcon(project) ? <ProjectIcon project={project} size={13} /> : (app.projects.some((x) => x.parentId === project.id) ? <FolderIcon /> : <span className={`t-${project.color}`}>#</span>), run: () => onNavigate({ kind: "project", id: project.id }) });
    for (const f of app.filters()) if (has(f.name)) out.push({ label: f.name, kind: "Filter", icon: <FilterIcon />, run: () => onNavigate({ kind: "filter", id: f.id }) });
    for (const l of app.labels()) if (has(l)) out.push({ label: l, kind: "Label", icon: <LabelIcon />, run: () => onNavigate({ kind: "label", name: l }) });
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
          icon: <span className={`mini-check p${t.priority}`} />,
          run: () => onOpenTask(t.id),
        });
      out.push({ label: `Search tasks for “${q.trim()}”`, kind: "Search", icon: <SearchIcon />, run: () => onNavigate({ kind: "search", query: q.trim() }) });
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
        <div className="palette-search">
          <SearchIcon />
        <input
          autoFocus
          placeholder="Search tasks or jump to a view"
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
        </div>
        <div className="palette-list">
          {results.map((r, i) => (
            <button key={`${r.kind}:${r.label}:${i}`} className={`menu-item ${i === hot ? "hot" : ""}`} onMouseEnter={() => setHot(i)} onClick={() => run(r)}>
              <span className="pal-icon">{r.icon}</span>
              <span className="pal-text">
                <span className="pal-label">{r.label}</span>
                <span className="kind">{r.kind}</span>
              </span>
            </button>
          ))}
          {!results.length && <div className="muted small" style={{ padding: "10px 16px" }}>No matches</div>}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑↓</kbd>Move
          </span>
          <span>
            <kbd>↵</kbd>Open
          </span>
          <span>
            <kbd>esc</kbd>Close
          </span>
        </div>
      </div>
    </div>
  );
}

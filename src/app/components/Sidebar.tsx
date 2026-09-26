import { useState } from "react";
import { PROJECT_COLORS } from "../../notion/setup";
import { useApp } from "../hooks";
import { countFor, sameView, type View } from "../views";

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  onQuickAdd: () => void;
  onSettings: () => void;
  searchRef: React.RefObject<HTMLInputElement>;
}

export function Sidebar({ view, onNavigate, onQuickAdd, onSettings, searchRef }: Props) {
  const app = useApp();
  const [newProject, setNewProject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = app.syncStatus();

  const item = (v: View, icon: string, label: string, count?: number, dot?: string) => (
    <button key={label} className={`nav ${sameView(v, view) ? "active" : ""}`} onClick={() => onNavigate(v)}>
      <span className="nav-icon">{dot ? <span className={`dot c-${dot}`} /> : icon}</span>
      <span className="nav-label">{label}</span>
      {count ? <span className="count">{count}</span> : null}
    </button>
  );

  const createProject = async () => {
    const name = newProject?.trim();
    if (!name) return setNewProject(null);
    try {
      const color = PROJECT_COLORS[app.projects.length % PROJECT_COLORS.length]!;
      const p = await app.addProject(name, color);
      setNewProject(null);
      setError(null);
      onNavigate({ kind: "project", id: p.id });
    } catch (e) {
      setError(`Couldn't create project: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="logo">✓</span> TaskDB
      </div>
      <button className="nav add-task" onClick={onQuickAdd}>
        <span className="nav-icon plus-circle">+</span>
        <span className="nav-label">Add task</span>
        <kbd>Q</kbd>
      </button>
      <div className="search">
        <input
          ref={searchRef}
          placeholder="Search"
          onChange={(e) => onNavigate(e.target.value ? { kind: "search", query: e.target.value } : { kind: "today" })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              (e.target as HTMLInputElement).value = "";
              (e.target as HTMLInputElement).blur();
            }
            e.stopPropagation();
          }}
        />
        <kbd>/</kbd>
      </div>
      {item({ kind: "inbox" }, "📥", "Inbox", countFor({ kind: "inbox" }, app))}
      {item({ kind: "today" }, "📅", "Today", countFor({ kind: "today" }, app))}
      {item({ kind: "upcoming" }, "🗓", "Upcoming")}
      {item({ kind: "browse" }, "🏷", "Filters & Labels")}

      <div className="nav-group">
        <span>My Projects</span>
        <button className="ghost icon" onClick={() => setNewProject("")} aria-label="Add project">
          +
        </button>
      </div>
      {app.projects
        .filter((p) => !p.archived)
        .map((p) => item({ kind: "project", id: p.id }, "#", p.name, countFor({ kind: "project", id: p.id }, app), p.color))}
      {newProject !== null && (
        <input
          className="new-project"
          autoFocus
          placeholder="Project name"
          value={newProject}
          onChange={(e) => setNewProject(e.target.value)}
          onBlur={() => void createProject()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createProject();
            if (e.key === "Escape") setNewProject(null);
            e.stopPropagation();
          }}
        />
      )}
      {error && <div className="small error-text">{error}</div>}

      <div className="sidebar-footer">
        <span className={`sync-dot ${status.pending ? "busy" : "ok"}`} />
        <span className="small muted">
          {app.platform.kind === "demo" ? "Demo mode · " : ""}
          {status.pending ? `Syncing ${status.pending}…` : "All changes synced"}
          {status.errors ? ` · ${status.errors} failed` : ""}
        </span>
        <button className="ghost icon" onClick={onSettings} aria-label="Settings">
          ⚙
        </button>
      </div>
    </nav>
  );
}

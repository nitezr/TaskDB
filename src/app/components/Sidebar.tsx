import { askConfirm } from "../confirm";
import { countFor, sameView, type View } from "../display";
import { useApp } from "../hooks";
import { dropProps, useMenu } from "../ui";
import type { Project } from "../../notion/projects";
import { describeLicense } from "./License";

interface Props {
  view: View;
  title: string;
  count: number;
  onNavigate: (v: View) => void;
  onQuickAdd: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onEditProject: (id: string | null, parentId?: string | null) => void;
  onSaveTemplate: (projectId: string) => void;
  onToast: (text: string) => void;
}

export function Sidebar(p: Props) {
  const app = useApp();
  const menu = useMenu();
  const settings = app.settings();
  const collapsed = new Set(settings.collapsed);
  const status = app.syncStatus();
  const license = app.licenseState();
  const tree = app.projectTree();
  const hasKids = new Set(app.projects.filter((x) => x.parentId && !x.archived).map((x) => x.parentId!));
  const filters = app.filters();
  const favorites = app.projects.filter((x) => x.favorite && !x.archived);

  /** Parents collapse their whole subtree. */
  const hiddenByParent = (proj: Project): boolean => {
    let parent = proj.parentId ? app.project(proj.parentId) : undefined;
    while (parent) {
      if (collapsed.has(`project:${parent.id}`)) return true;
      parent = parent.parentId ? app.project(parent.parentId) : undefined;
    }
    return false;
  };

  const projectCount = (id: string) => countFor({ kind: "project", id }, app);

  const projectMenu = (proj: Project, e: React.MouseEvent) => {
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY }, [
      { label: "Edit project…", icon: "✎", onClick: () => p.onEditProject(proj.id) },
      { label: "Add sub-project…", icon: "↳", onClick: () => p.onEditProject(null, proj.id) },
      {
        label: proj.favorite ? "Remove from favorites" : "Add to favorites",
        icon: proj.favorite ? "☆" : "★",
        onClick: () => void app.updateProject(proj.id, { favorite: !proj.favorite }),
      },
      { separator: true },
      { label: "Save as template…", icon: "⧉", onClick: () => p.onSaveTemplate(proj.id) },
      {
        label: "Archive",
        icon: "🗄",
        onClick: () => {
          void app.updateProject(proj.id, { archived: true });
          if (p.view.kind === "project" && p.view.id === proj.id) p.onNavigate({ kind: "inbox" });
          p.onToast(`Archived ${proj.name}`);
        },
      },
      {
        label: "Delete project",
        icon: "🗑",
        danger: true,
        onClick: () =>
          void askConfirm(`Delete “${proj.name}” and its ${projectCount(proj.id)} open task(s)? This also removes them from Notion.`, "Delete").then(
            (ok) => {
              if (!ok) return;
              if (p.view.kind === "project" && p.view.id === proj.id) p.onNavigate({ kind: "inbox" });
              void app.deleteProject(proj.id);
            },
          ),
      },
    ]);
  };

  const item = (v: View, icon: React.ReactNode, label: string, count?: number, extra?: object) => (
    <button key={JSON.stringify(v)} className={`nav ${sameView(v, p.view) ? "active" : ""}`} onClick={() => p.onNavigate(v)} {...extra}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count ? <span className="count">{count}</span> : null}
    </button>
  );

  const projectRow = (proj: Project, depth: number, keyPrefix = "") => {
    const kids = hasKids.has(proj.id) && !keyPrefix;
    const isCollapsed = collapsed.has(`project:${proj.id}`);
    return (
      <div key={keyPrefix + proj.id} style={{ display: "flex", alignItems: "center", paddingLeft: depth * 16 }}>
        {kids ? (
          <button className={`chev ${isCollapsed ? "closed" : ""}`} onClick={() => app.toggleCollapsed(`project:${proj.id}`)} aria-label="Toggle">
            ▾
          </button>
        ) : (
          <span className="chev" />
        )}
        {item(
          { kind: "project", id: proj.id },
          proj.emoji ?? <span className={`dot c-${proj.color}`} />,
          proj.name,
          projectCount(proj.id),
          {
            onContextMenu: (e: React.MouseEvent) => projectMenu(proj, e),
            ...dropProps((taskId) => app.updateTask(taskId, { projectId: proj.id, section: null })),
          },
        )}
      </div>
    );
  };

  const section = (key: string, label: string, children: React.ReactNode, action?: React.ReactNode) => {
    const isCollapsed = collapsed.has(key);
    return (
      <>
        <div className="nav-group">
          <button className="head" onClick={() => app.toggleCollapsed(key)}>
            {label} <span className={`chev ${isCollapsed ? "closed" : ""}`}>▾</span>
          </button>
          {action}
        </div>
        {!isCollapsed && children}
      </>
    );
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-top">
        <span className="logo">✓</span>
        <div className="win-title">
          <b>{p.title}</b>
          <span>
            {p.count} task{p.count === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="sidebar-scroll">
        <button className="nav add-task-nav" onClick={p.onQuickAdd}>
          <span className="nav-icon plus-circle">+</span>
          <span className="nav-label">Add task</span>
          <kbd>Q</kbd>
        </button>
        {item(
          { kind: "inbox" },
          "📥",
          "Inbox",
          countFor({ kind: "inbox" }, app),
          dropProps((id) => app.updateTask(id, { projectId: null, section: null })),
        )}
        {item({ kind: "today" }, "▦", "Today", countFor({ kind: "today" }, app))}
        {item({ kind: "upcoming" }, "🗓", "Upcoming", countFor({ kind: "upcoming" }, app))}
        {item({ kind: "browse" }, "#", "Filters & Tags")}

        {filters.length > 0 &&
          section(
            "sidebar:filters",
            "Filters",
            filters.map((f) => item({ kind: "filter", id: f.id }, "☰", f.name, countFor({ kind: "filter", id: f.id }, app))),
          )}

        {favorites.length > 0 && section("sidebar:favorites", "Favorites", favorites.map((f) => projectRow(f, 0, "fav:")))}

        {section(
          "sidebar:projects",
          "My Projects",
          <>
            {tree.filter(({ project }) => !hiddenByParent(project)).map(({ project, depth }) => projectRow(project, depth))}
            {!tree.length && (
              <button className="nav muted" onClick={() => p.onEditProject(null)}>
                <span className="nav-icon">+</span>
                <span className="nav-label">Add your first project</span>
              </button>
            )}
          </>,
          <button className="icon-btn" onClick={() => p.onEditProject(null)} aria-label="Add project" title="Add project">
            +
          </button>,
        )}
      </div>

      {license.kind !== "licensed" && (
        <button className={`trial-pill ${license.kind === "expired" ? "expired" : ""}`} onClick={p.onSettings}>
          {describeLicense(license)}
        </button>
      )}
      <div className="sidebar-footer">
        <button className="pill-btn" onClick={p.onShortcuts}>
          ⓘ Keyboard Shortcuts
        </button>
        <span className="grow" />
        <span
          className={`sync-dot ${status.errors ? "error" : status.pending ? "busy" : ""}`}
          title={
            (app.platform.kind === "demo" ? "Demo mode · " : "") +
            (status.pending ? `Syncing ${status.pending} change(s)…` : "All changes synced") +
            (status.errors ? ` · ${status.errors} failed` : "")
          }
        />
        <button className="icon-btn" onClick={p.onSettings} aria-label="Settings" title="Settings">
          ⚙
        </button>
      </div>
      {menu.element}
    </nav>
  );
}

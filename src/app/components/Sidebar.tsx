import { useState } from "react";
import { askConfirm } from "../confirm";
import { countFor, sameView, type View } from "../display";
import { useApp } from "../hooks";
import {
  ChevronIcon,
  FilterIcon,
  FolderIcon,
  GearIcon,
  HashIcon,
  HelpIcon,
  I,
  InboxIcon,
  PlusIcon,
  SidebarIcon,
  TodayIcon,
  UpcomingIcon,
} from "../icons";
import { dropProps, useMenu } from "../ui";
import type { Project } from "../../notion/projects";
import { describeLicense } from "./License";
import { productivityStats, Ring } from "./Productivity";

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  onQuickAdd: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onProductivity: () => void;
  onToggleSidebar: () => void;
  onEditProject: (id: string | null, parentId?: string | null) => void;
  onSaveTemplate: (projectId: string) => void;
  onToast: (text: string) => void;
}

type Zone = "before" | "inside" | "after";
const PROJECT_MIME = "application/x-taskdb-project";
/** The project being dragged. dataTransfer can't be read during dragover, so it lives here. */
let draggingProject: string | null = null;

/** Top and bottom quarters of a row insert beside it; the middle nests inside it. */
function zoneOf(e: React.DragEvent): Zone {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  return y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
}

export function Sidebar(p: Props) {
  const app = useApp();
  const menu = useMenu();
  const [dropAt, setDropAt] = useState<{ id: string; zone: Zone } | "root" | null>(null);
  const settings = app.settings();
  const collapsed = new Set(settings.collapsed);
  const status = app.syncStatus();
  const license = app.licenseState();
  const tree = app.projectTree();
  const hasKids = new Set(app.projects.filter((x) => x.parentId && !x.archived).map((x) => x.parentId!));
  const filters = app.filters();
  const favorites = app.projects.filter((x) => x.favorite && !x.archived);
  const stats = productivityStats(app);

  /** Parents collapse their whole subtree. */
  const hiddenByParent = (proj: Project): boolean => {
    let parent = proj.parentId ? app.project(proj.parentId) : undefined;
    while (parent) {
      if (collapsed.has(`project:${parent.id}`)) return true;
      parent = parent.parentId ? app.project(parent.parentId) : undefined;
    }
    return false;
  };
  const visible = tree.filter(({ project }) => !hiddenByParent(project));

  const projectCount = (id: string) => countFor({ kind: "project", id }, app);

  const move = (id: string, parentId: string | null, beforeId: string | null) =>
    void app.moveProject(id, parentId, beforeId).catch(() => p.onToast("Couldn't move the project. Check your connection."));

  const dropProject = (id: string, target: Project, zone: Zone) => {
    const parent = target.parentId ?? null;
    if (zone === "before") return move(id, parent, target.id);
    if (zone === "inside") {
      if (collapsed.has(`project:${target.id}`)) app.toggleCollapsed(`project:${target.id}`);
      return move(id, target.id, null);
    }
    // Just below an expanded parent is visually its first child.
    const kids = tree.filter((t) => t.project.parentId === target.id && t.project.id !== id);
    if (kids.length && !collapsed.has(`project:${target.id}`)) return move(id, target.id, kids[0]!.project.id);
    const siblings = tree.filter((t) => (t.project.parentId ?? null) === parent && t.project.id !== id).map((t) => t.project);
    const next = siblings[siblings.findIndex((s) => s.id === target.id) + 1];
    move(id, parent, next?.id ?? null);
  };

  /** Rows accept both dragged tasks (move into project) and dragged projects (reorder / nest). */
  const projectDnD = (proj: Project) => {
    const taskDrop = dropProps((taskId) => app.updateTask(taskId, { projectId: proj.id, section: null }));
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        draggingProject = proj.id;
        e.dataTransfer.setData(PROJECT_MIME, proj.id);
        e.dataTransfer.setData("text/plain", proj.name);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        draggingProject = null;
        setDropAt(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!draggingProject) return taskDrop.onDragOver(e);
        if (app.isWithinProject(proj.id, draggingProject)) return; // not into itself
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const zone = zoneOf(e);
        setDropAt((d) => (d && d !== "root" && d.id === proj.id && d.zone === zone ? d : { id: proj.id, zone }));
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!draggingProject) taskDrop.onDragLeave(e);
      },
      onDrop: (e: React.DragEvent) => {
        if (!draggingProject) return taskDrop.onDrop(e);
        e.preventDefault();
        e.stopPropagation();
        const id = draggingProject;
        draggingProject = null;
        setDropAt(null);
        dropProject(id, proj, zoneOf(e));
      },
    };
  };

  const rootDrop = {
    onDragOver: (e: React.DragEvent) => {
      if (!draggingProject) return;
      e.preventDefault();
      setDropAt("root");
    },
    onDragLeave: () => setDropAt((d) => (d === "root" ? null : d)),
    onDrop: (e: React.DragEvent) => {
      if (!draggingProject) return;
      e.preventDefault();
      const id = draggingProject;
      draggingProject = null;
      setDropAt(null);
      move(id, null, null);
    },
  };

  const moveMenu = (proj: Project, e: React.MouseEvent) => {
    const options = tree.filter(({ project }) => !app.isWithinProject(project.id, proj.id));
    menu.open({ x: e.clientX, y: e.clientY }, [
      { heading: `Move “${proj.name}” to` },
      { label: "Top level", icon: proj.parentId ? "" : <I.check />, onClick: () => move(proj.id, null, null) },
      { separator: true },
      ...options.map(({ project, depth }) => ({
        label: `${"   ".repeat(depth)}${project.emoji ? project.emoji + " " : ""}${project.name}`,
        icon: proj.parentId === project.id ? <I.check /> : "",
        onClick: () => move(proj.id, project.id, null),
      })),
    ]);
  };

  const shift = (proj: Project, delta: -1 | 1) => {
    const siblings = tree.filter((t) => (t.project.parentId ?? null) === (proj.parentId ?? null)).map((t) => t.project);
    const i = siblings.findIndex((s) => s.id === proj.id);
    const target = siblings[i + delta];
    if (!target) return;
    move(proj.id, proj.parentId ?? null, delta < 0 ? target.id : (siblings[i + 2]?.id ?? null));
  };

  const projectMenu = (proj: Project, e: React.MouseEvent) => {
    e.preventDefault();
    const siblings = tree.filter((t) => (t.project.parentId ?? null) === (proj.parentId ?? null));
    const i = siblings.findIndex((t) => t.project.id === proj.id);
    menu.open({ x: e.clientX, y: e.clientY }, [
      { label: "Edit project…", icon: <I.edit />, onClick: () => p.onEditProject(proj.id) },
      { label: "Add sub-project…", icon: <I.subProject />, onClick: () => p.onEditProject(null, proj.id) },
      {
        label: proj.favorite ? "Remove from favorites" : "Add to favorites",
        icon: proj.favorite ? <I.starOutline /> : <I.star />,
        onClick: () => void app.updateProject(proj.id, { favorite: !proj.favorite }),
      },
      { separator: true },
      { label: "Move up", icon: <I.up />, disabled: i <= 0, onClick: () => shift(proj, -1) },
      { label: "Move down", icon: <I.down />, disabled: i < 0 || i >= siblings.length - 1, onClick: () => shift(proj, 1) },
      { label: "Move to…", icon: <I.right />, onClick: () => setTimeout(() => moveMenu(proj, e)) },
      { separator: true },
      { label: "Save as template…", icon: <I.copy />, onClick: () => p.onSaveTemplate(proj.id) },
      {
        label: "Archive",
        icon: <I.archive />,
        onClick: () => {
          void app.updateProject(proj.id, { archived: true });
          if (p.view.kind === "project" && p.view.id === proj.id) p.onNavigate({ kind: "inbox" });
          p.onToast(`Archived ${proj.name}`);
        },
      },
      {
        label: "Delete project",
        icon: <I.trash />,
        danger: true,
        onClick: () =>
          void askConfirm(`Delete “${proj.name}”?`, "Delete Project and Tasks", {
            detail: projectCount(proj.id)
              ? `This deletes the project and its ${projectCount(proj.id)} open task(s) from Notion too. Sub-projects move up a level.`
              : "This deletes the project from Notion too. Sub-projects move up a level.",
          }).then(
            (ok) => {
              if (!ok) return;
              if (p.view.kind === "project" && p.view.id === proj.id) p.onNavigate({ kind: "inbox" });
              void app.deleteProject(proj.id);
            },
          ),
      },
    ]);
  };

  const row = (v: View, icon: React.ReactNode, label: string, count?: number, extra?: object, cls = "") => (
    <button
      key={JSON.stringify(v)}
      // A favourite is also in the tree; only the tree row takes the selection, so it never shows twice.
      className={`nav ${sameView(v, p.view) ? (cls.includes("fav") ? "current" : "active") : ""} ${cls}`} onClick={() => p.onNavigate(v)} {...extra}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count ? <span className="count">{count}</span> : null}
    </button>
  );

  const projectIcon = (proj: Project, isParent: boolean) =>
    proj.emoji ? (
      <span className="emoji">{proj.emoji}</span>
    ) : isParent ? (
      <FolderIcon className="folder" />
    ) : (
      <span className={`hash t-${proj.color}`}>#</span>
    );

  const projectRow = (proj: Project, depth: number, inFavorites = false) => {
    const kids = hasKids.has(proj.id) && !inFavorites;
    const isCollapsed = collapsed.has(`project:${proj.id}`);
    const drop = !inFavorites && dropAt && dropAt !== "root" && dropAt.id === proj.id ? `drop-${dropAt.zone}` : "";
    return (
      <div key={(inFavorites ? "fav:" : "") + proj.id} className={`proj-row ${drop}`} style={{ "--depth": depth } as React.CSSProperties}>
        {kids ? (
          <button className={`chev ${isCollapsed ? "" : "open"}`} onClick={() => app.toggleCollapsed(`project:${proj.id}`)} aria-label={isCollapsed ? "Expand" : "Collapse"}>
            <ChevronIcon />
          </button>
        ) : (
          <span className="chev" />
        )}
        {row({ kind: "project", id: proj.id }, projectIcon(proj, kids), proj.name, projectCount(proj.id), {
          onContextMenu: (e: React.MouseEvent) => projectMenu(proj, e),
          ...(inFavorites ? dropProps((taskId) => app.updateTask(taskId, { projectId: proj.id, section: null })) : projectDnD(proj)),
        }, inFavorites ? "fav" : "")}
      </div>
    );
  };

  const section = (key: string, label: string, children: React.ReactNode, action?: React.ReactNode, extra?: object) => {
    const isCollapsed = collapsed.has(key);
    return (
      <>
        <div className={`nav-group ${extra && dropAt === "root" ? "drop-inside" : ""}`} {...extra}>
          <button className="head" onClick={() => app.toggleCollapsed(key)}>
            {label}
            <span className={`chev ${isCollapsed ? "" : "open"}`}>
              <ChevronIcon />
            </span>
          </button>
          {action}
        </div>
        {!isCollapsed && children}
      </>
    );
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-top" data-tauri-drag-region>
        <span className="grow" data-tauri-drag-region />
        <button className="tool-btn" onClick={p.onQuickAdd} title="Add task (Q)" aria-label="Add task">
          <PlusIcon />
        </button>
        <button className="tool-btn" onClick={p.onToggleSidebar} title="Hide sidebar (⌘\)" aria-label="Hide sidebar">
          <SidebarIcon />
        </button>
      </div>
      <div className="sidebar-scroll">
        {row(
          { kind: "inbox" },
          <InboxIcon />,
          "Inbox",
          countFor({ kind: "inbox" }, app),
          dropProps((id) => app.updateTask(id, { projectId: null, section: null })),
        )}
        {row({ kind: "today" }, <TodayIcon />, "Today", countFor({ kind: "today" }, app))}
        {row({ kind: "upcoming" }, <UpcomingIcon />, "Upcoming", countFor({ kind: "upcoming" }, app))}
        {row({ kind: "browse" }, <HashIcon />, "Filters & Tags")}

        {filters.length > 0 &&
          section(
            "sidebar:filters",
            "Filters",
            filters.map((f) => row({ kind: "filter", id: f.id }, <FilterIcon />, f.name, countFor({ kind: "filter", id: f.id }, app), undefined, "filter-row")),
          )}

        {favorites.length > 0 && section("sidebar:favorites", "Favorites", favorites.map((f) => projectRow(f, 0, true)))}

        {section(
          "sidebar:projects",
          "My Projects",
          <>
            {visible.map(({ project, depth }) => projectRow(project, depth))}
            {!tree.length && (
              <button className="nav muted" onClick={() => p.onEditProject(null)}>
                <span className="nav-icon">
                  <PlusIcon />
                </span>
                <span className="nav-label">Add your first project</span>
              </button>
            )}
            {tree.length > 0 && <div className={`root-drop ${dropAt === "root" ? "on" : ""}`} {...rootDrop} />}
          </>,
          <button className="icon-btn add" onClick={() => p.onEditProject(null)} aria-label="Add project" title="Add project">
            <PlusIcon size={14} />
          </button>,
          rootDrop,
        )}
      </div>

      <div className="sidebar-footer">
        <button className="foot-btn" onClick={p.onShortcuts} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <HelpIcon />
        </button>
        <span className="grow" />
        {settings.dailyGoal > 0 && (
          <button className="foot-btn goal-btn" onClick={p.onProductivity} title={`${stats.today} of ${stats.dailyGoal} done today · ${stats.streak}-day streak (O)`}>
            <Ring value={stats.today} goal={stats.dailyGoal} size={15} stroke={2.2} />
          </button>
        )}
        <span
          className={`sync-dot ${status.errors ? "error" : status.pending ? "busy" : ""}`}
          title={
            (app.platform.kind === "demo" ? "Demo mode · " : "") +
            (status.pending ? `Syncing ${status.pending} change(s)…` : "All changes synced") +
            (status.errors ? ` · ${status.errors} failed` : "")
          }
        />
        <button className="foot-btn" onClick={p.onSettings} aria-label="Settings" title="Settings (⌘,)">
          <GearIcon />
        </button>
      </div>
      {license.kind !== "licensed" && (
        <button className={`trial-line ${license.kind === "expired" ? "expired" : ""}`} onClick={p.onSettings}>
          {describeLicense(license)}
        </button>
      )}
      {menu.element}
    </nav>
  );
}

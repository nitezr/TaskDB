import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatDue, hasTime, parseDue, startOfDay } from "../core/dates";
import type { Priority, TaskFields } from "../types";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette";
import { DetailPeek } from "./components/DetailPeek";
import { changedCount, DisplayMenu } from "./components/DisplayMenu";
import { FiltersTags } from "./components/FiltersTags";
import { LabelsPopover } from "./components/LabelsPopover";
import { LicenseBanner, Paywall } from "./components/License";
import { ListView, RESCHEDULE_TARGETS, type ViewCtx } from "./components/ListView";
import { Onboarding } from "./components/Onboarding";
import { ProjectDialog, SaveTemplateDialog } from "./components/ProjectDialogs";
import { QuickAdd } from "./components/QuickAdd";
import { SettingsWindow, ShortcutsPanel } from "./components/SettingsWindow";
import { Sidebar } from "./components/Sidebar";
import { Tour } from "./components/Tour";
import { askConfirm, ConfirmHost } from "./confirm";
import type { ScheduleTarget } from "./controller";
import { buildViewModel, DEFAULT_PREFS, type DisplayPrefs, sameView, type View, viewKey, viewTasks, visibleOrder } from "./display";
import { useApp } from "./hooks";
import { actionForCombo, comboFromEvent } from "./shortcuts";
import { type Anchor, anchorOf, type MenuEntry, playCompleteSound, Popover, useMenu } from "./ui";
import { BackIcon, CloseIcon, DisplayIcon, ForwardIcon, SearchIcon, SidebarIcon } from "./icons";

interface Toast {
  text: string;
  undo?: boolean;
}

export function App() {
  const app = useApp();
  const settings = app.settings();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.style.setProperty("--accent", settings.accent);
  }, [settings.theme, settings.accent, settings.font]);

  if (app.phase === "loading") return <div className="loading">Loading…</div>;
  if (app.phase === "connect") return <Onboarding />;
  return <Main />;
}

function Main() {
  const app = useApp();
  const settings = app.settings();
  const [view, setView] = useState<View>({ kind: "today" });
  const [back, setBack] = useState<View[]>([]);
  const [forward, setForward] = useState<View[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [quickAdd, setQuickAdd] = useState<Partial<TaskFields> | null>(null);
  const [palette, setPalette] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "shortcuts" | "license" | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [projectDialog, setProjectDialog] = useState<{ id: string | null; parentId?: string | null } | null>(null);
  const [templateFor, setTemplateFor] = useState<string | null>(null);
  const [labelsFor, setLabelsFor] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [displayAnchor, setDisplayAnchor] = useState<Anchor | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [upcomingWeek, setUpcomingWeek] = useState(0);
  const gPressed = useRef(false);
  const taskMenu = useMenu();

  const key = viewKey(view);
  const prefs = app.displayPrefs(key);
  const layout = view.kind === "browse" || view.kind === "completed" || view.kind === "search" ? "list" : prefs.layout;
  const upcomingStart = addDays(startOfDay(new Date()), upcomingWeek * 7);
  const vm = buildViewModel(view, app, prefs, {
    upcomingStart,
    upcomingDays: 7,
    upcomingOpenEnded: layout !== "board",
  });
  const order = useMemo(() => visibleOrder(vm, collapsed, layout), [vm, collapsed, layout]);
  const overlayOpen =
    !!quickAdd || palette || !!settingsTab || shortcuts || paywall || !!projectDialog || !!templateFor || !!openId || !!labelsFor || (!settings.tourDone && app.phase === "ready");

  useEffect(() => {
    app.onQuickAdd = () => setQuickAdd({});
    app.onPaywall = () => {
      setQuickAdd(null);
      setPaywall(true);
    };
  }, [app]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const navigate = useCallback(
    (v: View) => {
      if (sameView(v, view)) return;
      setBack((b) => [...b.slice(-49), view]);
      setForward([]);
      setView(v);
      setSelected(null);
      setUpcomingWeek(0);
    },
    [view],
  );
  const goBack = () => {
    const prev = back[back.length - 1];
    if (!prev) return;
    setBack(back.slice(0, -1));
    setForward((f) => [view, ...f]);
    setView(prev);
    setSelected(null);
  };
  const goForward = () => {
    const next = forward[0];
    if (!next) return;
    setForward(forward.slice(1));
    setBack((b) => [...b, view]);
    setView(next);
    setSelected(null);
  };

  const undo = () => {
    const label = app.undo();
    setToast({ text: label ? `Undid: ${label}` : "Nothing to undo" });
  };

  /** Strike, play the sound, then complete — with an Undo toast. */
  const complete = (id: string) => {
    const t = app.task(id);
    if (!t) return;
    if (t.done) return app.reopen(id);
    if (settings.completionSound) playCompleteSound();
    setCompleting((c) => new Set(c).add(id));
    setTimeout(() => {
      const next = order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1] ?? null;
      app.complete(id);
      setCompleting((c) => {
        const n = new Set(c);
        n.delete(id);
        return n;
      });
      const after = app.task(id);
      setToast({ text: after && !after.done ? "Rescheduled to the next date" : "1 task completed", undo: true });
      setSelected((s) => (s === id && after?.done ? next : s));
    }, 320);
  };

  const reschedule = (ids: string[], target: ScheduleTarget) => {
    if (!ids.length) return;
    app.schedule(ids, target);
    setToast({ text: ids.length === 1 ? "Rescheduled" : `Rescheduled ${ids.length} tasks`, undo: true });
  };

  const moveTask = (id: string, patch: Partial<TaskFields>) => {
    const t = app.task(id);
    if (!t) return;
    const next = { ...patch };
    // Moving between days keeps the time of day.
    if (next.due && t.due && hasTime(t.due) && !hasTime(next.due)) {
      const old = parseDue(t.due);
      const d = parseDue(next.due);
      d.setHours(old.getHours(), old.getMinutes(), 0, 0);
      next.due = formatDue(d, true);
    }
    if (next.projectId !== undefined && next.projectId !== t.projectId && next.section === undefined) next.section = null;
    app.updateTask(id, next);
  };

  const openTaskMenu = (id: string, e: React.MouseEvent) => {
    const t = app.task(id);
    if (!t) return;
    const sections = t.projectId ? app.sections(t.projectId) : [];
    const items: MenuEntry[] = [
      { label: "Open details", icon: "↗", hint: "I", onClick: () => setOpenId(id) },
      { label: t.done ? "Reopen" : "Complete", icon: "✓", hint: "E", onClick: () => complete(id) },
      { label: "Edit tags…", icon: "⌗", hint: "L", onClick: () => setLabelsFor({ id, anchor: { x: e.clientX, y: e.clientY } }) },
      { heading: "Schedule" },
      ...RESCHEDULE_TARGETS.map(([target, label]) => ({ label, onClick: () => reschedule([id], target) })),
      { heading: "Priority" },
      ...([1, 2, 3, 4] as Priority[]).map((p) => ({ label: `Priority ${p}${t.priority === p ? " ✓" : ""}`, onClick: () => app.updateTask(id, { priority: p }) })),
      { heading: "Move to" },
      { label: "📥 Inbox", onClick: () => app.updateTask(id, { projectId: null, section: null }) },
      ...app.projectTree().map(({ project, depth }) => ({
        label: `${"  ".repeat(depth)}${project.emoji ?? "#"} ${project.name}`,
        onClick: () => app.updateTask(id, { projectId: project.id, section: null }),
      })),
      ...(sections.length
        ? [
            { heading: "Move to section" } as MenuEntry,
            { label: "(No section)", onClick: () => app.updateTask(id, { section: null }) },
            ...sections.map((s) => ({ label: s, onClick: () => app.updateTask(id, { section: s }) })),
          ]
        : []),
      { separator: true },
      {
        label: "Delete task",
        icon: "🗑",
        hint: "⌘⌫",
        danger: true,
        onClick: () => void askConfirm(`Delete “${t.title}”?`, "Delete").then((ok) => ok && app.deleteTask(id)),
      },
    ];
    taskMenu.open({ x: e.clientX, y: e.clientY }, items);
  };

  const ctx: ViewCtx = {
    selected,
    completing,
    collapsed,
    toggleCollapse: (id) =>
      setCollapsed((c) => {
        const n = new Set(c);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }),
    showProject: view.kind !== "project" && view.kind !== "inbox",
    onSelect: setSelected,
    onOpen: setOpenId,
    onComplete: complete,
    onContextMenu: openTaskMenu,
    moveTask,
    reschedule,
  };

  const setPrefs = (patch: Partial<DisplayPrefs>) => app.setDisplayPrefs(key, patch);

  // ---- Keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable]");
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (typing || overlayOpen) return;

      if (meta) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (k === "\\" || k === "s") {
          e.preventDefault();
          app.updateSettings({ sidebarHidden: !settings.sidebarHidden });
        } else if (k === "[") {
          e.preventDefault();
          goBack();
        } else if (k === "]") {
          e.preventDefault();
          goForward();
        } else if (k === "backspace" && selected) {
          e.preventDefault();
          const t = app.task(selected);
          if (t) {
            const next = order[order.indexOf(selected) + 1] ?? order[order.indexOf(selected) - 1] ?? null;
            app.deleteTask(selected);
            setSelected(next);
            setToast({ text: `Deleted “${t.title}”`, undo: true });
          }
        }
        return;
      }
      if (e.altKey) return;

      if (gPressed.current) {
        gPressed.current = false;
        const dest: Record<string, View> = { i: { kind: "inbox" }, t: { kind: "today" }, u: { kind: "upcoming" }, f: { kind: "browse" } };
        const v = dest[e.key.toLowerCase()];
        if (v) {
          e.preventDefault();
          navigate(v);
        }
        return;
      }

      const idx = selected ? order.indexOf(selected) : -1;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelected(order[Math.min(order.length - 1, idx + 1)] ?? null);
          return;
        case "ArrowUp":
          e.preventDefault();
          setSelected(order[Math.max(0, idx - 1)] ?? order[0] ?? null);
          return;
        case "ArrowLeft":
        case "ArrowRight": {
          if (layout !== "board" || !selected) return;
          const gi = vm.groups.findIndex((g) => g.tasks.some((t) => t.id === selected));
          const row = vm.groups[gi]?.tasks.findIndex((t) => t.id === selected) ?? 0;
          const step = e.key === "ArrowLeft" ? -1 : 1;
          for (let j = gi + step; j >= 0 && j < vm.groups.length; j += step) {
            const col = vm.groups[j]!.tasks;
            if (col.length) {
              setSelected(col[Math.min(row, col.length - 1)]!.id);
              break;
            }
          }
          e.preventDefault();
          return;
        }
        case "Enter":
          if (selected) setOpenId(selected);
          return;
        case "Escape":
          setSelected(null);
          return;
        case "g":
          gPressed.current = true;
          setTimeout(() => (gPressed.current = false), 1000);
          return;
      }

      const combo = comboFromEvent(e);
      const action = combo ? actionForCombo(combo, settings.shortcuts) : null;
      if (!action) return;
      e.preventDefault();
      const sel = selected ? app.task(selected) : undefined;
      switch (action) {
        case "nextTask":
          setSelected(order[Math.min(order.length - 1, idx + 1)] ?? null);
          break;
        case "previousTask":
          setSelected(order[Math.max(0, idx - 1)] ?? order[0] ?? null);
          break;
        case "commandPalette":
          setPalette(true);
          break;
        case "shortcutsPanel":
          setShortcuts(true);
          break;
        case "quickAdd":
          setQuickAdd(vm.addDefaults);
          break;
        case "completeTask":
          if (sel) complete(sel.id);
          break;
        case "openDetail":
          if (sel) setOpenId(sel.id);
          break;
        case "editLabels":
          if (sel) {
            const el = document.querySelector(`[data-id="${CSS.escape(sel.id)}"]`);
            setLabelsFor({ id: sel.id, anchor: el ? anchorOf(el) : { x: window.innerWidth / 2, y: 120 } });
          }
          break;
        case "priority1":
        case "priority2":
        case "priority3":
        case "priority4":
          if (sel) app.updateTask(sel.id, { priority: Number(action.slice(-1)) as Priority });
          break;
        case "scheduleToday":
          if (sel) reschedule([sel.id], "today");
          break;
        case "scheduleTomorrow":
          if (sel) reschedule([sel.id], "tomorrow");
          break;
        case "scheduleWeekend":
          if (sel) reschedule([sel.id], "weekend");
          break;
        case "scheduleNextWeek":
          if (sel) reschedule([sel.id], "nextWeek");
          break;
        case "scheduleClear":
          if (sel) reschedule([sel.id], "none");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Mouse back/forward buttons navigate history.
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) goBack();
      if (e.button === 4) goForward();
    };
    window.addEventListener("mouseup", onMouse);
    return () => window.removeEventListener("mouseup", onMouse);
  });

  useEffect(() => {
    const el = selected ? document.querySelector(`[data-id="${CSS.escape(selected)}"]`) : null;
    const box = el?.closest(".view-body, .column-body")?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    // Off-screen selections glide to the centre (Remit); visible ones stay put so clicks don't jump.
    if (el && r && (!box || r.top < box.top || r.bottom > box.bottom)) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, [selected]);

  const openIdx = openId ? order.indexOf(openId) : -1;
  const paletteActions: PaletteAction[] = [
    { label: "Add task", kind: "Action", icon: "+", run: () => setQuickAdd(vm.addDefaults) },
    { label: "New project", kind: "Action", icon: "📁", run: () => setProjectDialog({ id: null }) },
    { label: "Toggle sidebar", kind: "Action", icon: "◧", run: () => app.updateSettings({ sidebarHidden: !settings.sidebarHidden }) },
    { label: "Keyboard shortcuts", kind: "Action", icon: "⌨", run: () => setShortcuts(true) },
    { label: "Settings", kind: "Action", icon: "⚙", run: () => setSettingsTab("general") },
    { label: "Switch to List layout", kind: "Action", icon: "☰", run: () => setPrefs({ layout: "list" }) },
    { label: "Switch to Board layout", kind: "Action", icon: "▥", run: () => setPrefs({ layout: "board" }) },
    { label: "Switch to Calendar layout", kind: "Action", icon: "▦", run: () => setPrefs({ layout: "calendar" }) },
    { label: "Undo", kind: "Action", icon: "↶", run: undo },
  ];

  const project = view.kind === "project" ? app.project(view.id) : undefined;
  // Admit what the Display filters hide, so the sidebar count and the list never seem to disagree.
  const filtering = prefs.deadline !== DEFAULT_PREFS.deadline || prefs.priority !== DEFAULT_PREFS.priority || prefs.label !== DEFAULT_PREFS.label;
  const hiddenByFilters = filtering
    ? Math.max(0, viewTasks(view, app, { ...DEFAULT_PREFS, showCompleted: prefs.showCompleted }).tasks.length - viewTasks(view, app, prefs).tasks.length)
    : 0;
  const allowSections = view.kind === "project" && (prefs.groupBy === "default" || prefs.groupBy === "section");

  return (
    <div className={`shell ${settings.sidebarHidden ? "no-sidebar" : ""}`}>
      <Sidebar
        view={view}
        onNavigate={navigate}
        onToggleSidebar={() => app.updateSettings({ sidebarHidden: !settings.sidebarHidden })}
        onQuickAdd={() => setQuickAdd(vm.addDefaults)}
        onSettings={() => setSettingsTab("general")}
        onShortcuts={() => setShortcuts(true)}
        onEditProject={(id, parentId) => setProjectDialog({ id, parentId })}
        onSaveTemplate={setTemplateFor}
        onToast={(text) => setToast({ text })}
      />
      <main className="main">
        <div className="toolbar" data-tauri-drag-region>
          {settings.sidebarHidden && (
            <>
              <span className="traffic-space" data-tauri-drag-region />
              <button className="tool-btn" onClick={() => app.updateSettings({ sidebarHidden: false })} title="Show sidebar (⌘\)" aria-label="Show sidebar">
                <SidebarIcon />
              </button>
            </>
          )}
          <button className="tool-btn" disabled={!back.length} onClick={goBack} title="Back (⌘[)" aria-label="Back">
            <BackIcon />
          </button>
          <button className="tool-btn" disabled={!forward.length} onClick={goForward} title="Forward (⌘])" aria-label="Forward">
            <ForwardIcon />
          </button>
          <div className="window-title" data-tauri-drag-region>
            <b data-tauri-drag-region>{vm.title}</b>
            <span data-tauri-drag-region>
              {view.kind !== "browse" && `${vm.count} task${vm.count === 1 ? "" : "s"}`}
              {hiddenByFilters > 0 ? ` · ${hiddenByFilters} hidden by filters` : ""}
              {vm.subtitle ? ` · ${vm.subtitle}` : ""}
            </span>
          </div>
          <span className="grow" data-tauri-drag-region />
          {project && (
            <button
              className="tool-btn"
              onClick={(e) => {
                const a = anchorOf(e.currentTarget, "right");
                taskMenu.open(a, [
                  { label: "Edit project…", icon: "✎", onClick: () => setProjectDialog({ id: project.id }) },
                  { label: "Add section", icon: "▤", onClick: () => {
                    const name = `Section ${app.sections(project.id).length + 1}`;
                    void app.addSection(project.id, name);
                  } },
                  { label: project.favorite ? "Remove from favorites" : "Add to favorites", icon: "★", onClick: () => void app.updateProject(project.id, { favorite: !project.favorite }) },
                  { label: "Save as template…", icon: "⧉", onClick: () => setTemplateFor(project.id) },
                ]);
              }}
              aria-label="Project menu"
                title="Project actions"
            >
              ⋯
            </button>
          )}
          <button className="tool-btn" onClick={() => setPalette(true)} title="Search (⌘K)" aria-label="Search">
            <SearchIcon />
          </button>
          {view.kind !== "browse" && view.kind !== "completed" && view.kind !== "search" && (
            <button className="tool-pill" onClick={(e) => setDisplayAnchor(anchorOf(e.currentTarget, "right"))}>
              <DisplayIcon /> Display
              {changedCount(prefs) > 0 && <span className="pill-count">{changedCount(prefs)}</span>}
            </button>
          )}
        </div>

        <LicenseBanner onOpen={() => setPaywall(true)} />
        {app.lastError && (
          <div className="banner error app-error">
            <span className="warn">⚠</span>
            <span className="grow">{app.lastError}</span>
            <button className="icon-btn" onClick={() => app.dismissError()} aria-label="Dismiss" title="Dismiss">
              <CloseIcon size={12} />
            </button>
          </div>
        )}

        {layout !== "calendar" && view.kind === "upcoming" && layout === "board" && (
          <div className={`view-head ${layout === "board" ? "wide" : ""}`}>
            <div className="grow" />

            {view.kind === "upcoming" && layout === "board" && (
              <div className="board-nav">
                <button onClick={() => setUpcomingWeek((w) => Math.max(0, w - 1))} disabled={upcomingWeek === 0} aria-label="Previous week">
                  ‹
                </button>
                <button className="today-btn" onClick={() => setUpcomingWeek(0)}>
                  Today
                </button>
                <button onClick={() => setUpcomingWeek((w) => w + 1)} aria-label="Next week">
                  ›
                </button>
              </div>
            )}
          </div>
        )}

        <div className="view-body" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          {view.kind === "browse" ? (
            <FiltersTags onNavigate={navigate} />
          ) : layout === "board" ? (
            <BoardView vm={vm} ctx={ctx} allowSections={allowSections} />
          ) : layout === "calendar" ? (
            <CalendarView
              tasks={viewTasks(view, app, { ...prefs, showCompleted: true }).tasks}
              range={prefs.calendarRange}
              onRange={(r) => setPrefs({ calendarRange: r })}
              selected={selected}
              onSelect={setSelected}
              onOpen={setOpenId}
              onContextMenu={openTaskMenu}
              moveTask={moveTask}
              onAddOn={(day) => setQuickAdd({ ...vm.addDefaults, due: day })}
            />
          ) : (
            <ListView vm={vm} ctx={ctx} allowSections={allowSections} />
          )}
        </div>
      </main>

      {displayAnchor && (
        <Popover anchor={displayAnchor} align="right" onClose={() => setDisplayAnchor(null)}>
          <DisplayMenu view={view} prefs={prefs} onChange={setPrefs} onReset={() => app.setDisplayPrefs(key, null)} />
        </Popover>
      )}
      {openId && app.task(openId) && (
        <DetailPeek
          id={openId}
          onClose={() => {
            setSelected(openId);
            setOpenId(null);
          }}
          onOpen={setOpenId}
          prevId={openIdx > 0 ? order[openIdx - 1]! : null}
          nextId={openIdx >= 0 && openIdx < order.length - 1 ? order[openIdx + 1]! : null}
          onComplete={complete}
        />
      )}
      {quickAdd && <QuickAdd variant="modal" defaults={quickAdd} onDone={() => setQuickAdd(null)} onAdded={(id) => setSelected(id)} />}
      {palette && (
        <CommandPalette
          onClose={() => setPalette(false)}
          onNavigate={navigate}
          onOpenTask={(id) => {
            setSelected(id);
            setOpenId(id);
          }}
          actions={paletteActions}
        />
      )}
      {settingsTab && (
        <SettingsWindow
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
          onBuy={() => {
            setSettingsTab(null);
            setPaywall(true);
          }}
        />
      )}
      {shortcuts && (
        <ShortcutsPanel
          onClose={() => setShortcuts(false)}
          onCustomize={() => {
            setShortcuts(false);
            setSettingsTab("shortcuts");
          }}
        />
      )}
      {projectDialog && (
        <ProjectDialog
          id={projectDialog.id}
          parentId={projectDialog.parentId}
          onClose={() => setProjectDialog(null)}
          onCreated={(id) => {
            setProjectDialog(null);
            navigate({ kind: "project", id });
          }}
        />
      )}
      {templateFor && (
        <SaveTemplateDialog
          projectId={templateFor}
          onClose={() => setTemplateFor(null)}
          onSaved={() => {
            setTemplateFor(null);
            setToast({ text: "Template saved — use it when creating a project" });
          }}
        />
      )}
      {labelsFor && <LabelsPopover taskId={labelsFor.id} anchor={labelsFor.anchor} onClose={() => setLabelsFor(null)} />}
      {paywall && <Paywall onClose={() => setPaywall(false)} />}
      {!settings.tourDone && <Tour onClose={() => undefined} onOpenProject={(id) => navigate({ kind: "project", id })} />}
      {taskMenu.element}
      {toast && (
        <div className="toast">
          {toast.text}
          {toast.undo && (
            <button
              className="link"
              onClick={() => {
                undo();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      <ConfirmHost />
    </div>
  );
}

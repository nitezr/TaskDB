import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatDue, hasTime, parseDue, startOfDay, toDateStr, formatDuration } from "../core/dates";
import type { Priority, Task, TaskFields } from "../types";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette";
import { BulkBar } from "./components/BulkBar";
import { DatePicker } from "./components/DatePicker";
import { DetailPeek } from "./components/DetailPeek";
import { Productivity, Ring } from "./components/Productivity";
import { changedCount, DisplayMenu } from "./components/DisplayMenu";
import { FiltersTags } from "./components/FiltersTags";
import { LabelsPopover } from "./components/LabelsPopover";
import { LicenseBanner, Paywall } from "./components/License";
import { ListView, orderBefore, RESCHEDULE_TARGETS, type ViewCtx } from "./components/ListView";
import { Onboarding } from "./components/Onboarding";
import { ProjectDialog, SaveTemplateDialog } from "./components/ProjectDialogs";
import { ProjectNotes } from "./components/ProjectNotes";
import { QuickAdd } from "./components/QuickAdd";
import { SettingsWindow, ShortcutsPanel } from "./components/SettingsWindow";
import { Sidebar } from "./components/Sidebar";
import { Tour } from "./components/Tour";
import { askConfirm, ConfirmHost } from "./confirm";
import { type ScheduleTarget, scheduleDue } from "./controller";
import { buildViewModel, countFor, DEFAULT_PREFS, type DisplayPrefs, sameView, type View, viewKey, viewTasks, visibleOrder } from "./display";
import { useApp } from "./hooks";
import { actionForCombo, comboFromEvent } from "./shortcuts";
import { type Anchor, anchorOf, type MenuEntry, playCompleteSound, Popover, useMenu } from "./ui";
import { THEMES } from "./themes";
import { I, ArchiveIcon, BackIcon, CalendarSmallIcon, CheckCircleIcon, ChevronIcon, ClockIcon, CloseIcon, DisplayIcon, FlagIcon, FolderIcon, ForwardIcon, InboxIcon, MoonIcon, NoDateIcon, RepeatIcon, SearchIcon, SidebarIcon, WarningIcon } from "./icons";

interface Toast {
  text: string;
  undo?: boolean;
  icon?: React.ReactNode;
}

/** "Today", "Tomorrow", "Saturday" within the week, else "Mon 6 Oct": how toasts name a date. */
function dayPhrase(due: string): string {
  const d = parseDue(due);
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  const time = hasTime(due) ? ` ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "";
  if (diff === 0) return `Today${time}`;
  if (diff === 1) return `Tomorrow${time}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString(undefined, { weekday: "long" })}${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${time}`;
}

/** One task: "Moved to Today". Several: "Moved to Today · 3 tasks". */
const phrase = (count: number, text: string) => (count > 1 ? `${text} · ${count} tasks` : text);

export function App() {
  const app = useApp();
  const settings = app.settings();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.palette = settings.palette;
    root.dataset.density = settings.density;
    root.style.setProperty("--accent", settings.accent);
  }, [settings.theme, settings.accent, settings.font, settings.palette, settings.density]);

  if (app.phase === "loading") return <div className="loading">Loading…</div>;
  if (app.phase === "connect") return <Onboarding />;
  return <Main />;
}

function Main() {
  const app = useApp();
  const settings = app.settings();
  const [view, setView] = useState<View>(() => ({ kind: settings.startView }));
  const [back, setBack] = useState<View[]>([]);
  const [forward, setForward] = useState<View[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<{ kind: "due" | "deadline"; ids: string[]; anchor: Anchor } | null>(null);
  const [productivity, setProductivity] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [quickAdd, setQuickAdd] = useState<Partial<TaskFields> | null>(null);
  const [palette, setPalette] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "shortcuts" | "import" | "license" | null>(null);
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
  const fullVm = buildViewModel(view, app, prefs, {
    upcomingStart,
    upcomingDays: 7,
    upcomingOpenEnded: layout !== "board",
  });
  // ⌘F narrows the current view to matching tasks (title, description, tags, person).
  const [find, setFind] = useState<string | null>(null);
  const needle = find?.trim().toLowerCase() ?? "";
  const vm = needle
    ? (() => {
        const hit = (t: Task) =>
          t.title.toLowerCase().includes(needle) ||
          (t.notes ?? "").toLowerCase().includes(needle) ||
          t.labels.some((l) => l.toLowerCase().includes(needle)) ||
          (t.person ?? "").toLowerCase().includes(needle);
        const groups = fullVm.groups.map((g) => ({ ...g, tasks: g.tasks.filter(hit), repeats: undefined, gap: undefined })).filter((g) => g.tasks.length);
        return { ...fullVm, groups, count: groups.reduce((n, g) => n + g.tasks.filter((t) => !t.done).length, 0) };
      })()
    : fullVm;
  const order = useMemo(() => visibleOrder(vm, collapsed, layout), [vm, collapsed, layout]);
  // Dock badge: what's due today or overdue, as in Things. Off in Settings.
  const badge = settings.dockBadge ? countFor({ kind: "today" }, app) : 0;
  useEffect(() => app.platform.setBadge?.(badge), [badge, app]);

  const otherOverlay =
    !!quickAdd || !!picker || productivity || palette || !!settingsTab || shortcuts || paywall || !!projectDialog || !!templateFor || !!labelsFor || (!settings.tourDone && app.phase === "ready");
  const overlayOpen = otherOverlay || !!openId;
  /** The detail panel is open on its own: task shortcuts act on the task it shows. */
  const peekOnly = !!openId && !otherOverlay;

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
      setMulti(new Set());
      setFind(null);
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
    setMulti(new Set());
  };
  const goForward = () => {
    const next = forward[0];
    if (!next) return;
    setForward(forward.slice(1));
    setBack((b) => [...b, view]);
    setView(next);
    setSelected(null);
    setMulti(new Set());
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
      setToast(
        after && !after.done && after.due
          ? { text: `Done · next ${dayPhrase(after.due)}`, undo: true, icon: <RepeatIcon size={13} /> }
          : { text: "Completed", undo: true, icon: <CheckCircleIcon size={14} /> },
      );
      setSelected((s) => (s === id && after?.done ? next : s));
    }, 320);
  };

  /** What an action applies to: the multi-selection if there is one, else the focused task. */
  const targets = (): string[] => (multi.size ? [...multi] : selected ? [selected] : []);

  /** ⌘-click toggles a task, ⇧-click selects the run from the focused task (Todoist, Things). */
  const onSelect = (id: string, e?: React.MouseEvent, fromMenu?: boolean) => {
    if (fromMenu && multi.has(id)) return;
    if (e && (e.metaKey || e.ctrlKey)) {
      const next = new Set(multi);
      if (!next.size && selected && selected !== id) next.add(selected);
      next.has(id) ? next.delete(id) : next.add(id);
      setMulti(next);
      setSelected(id);
      return;
    }
    if (e?.shiftKey && selected) {
      const a = order.indexOf(selected);
      const b = order.indexOf(id);
      if (a >= 0 && b >= 0) {
        const next = new Set(multi);
        for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
        setMulti(next);
        setSelected(id);
        return;
      }
    }
    setMulti(new Set());
    setSelected(id);
  };

  const completeMany = (ids: string[]) => {
    if (ids.length === 1) return complete(ids[0]!);
    const open = ids.filter((id) => !app.task(id)?.done);
    if (!open.length) return;
    if (settings.completionSound) playCompleteSound();
    setCompleting((c) => new Set([...c, ...open]));
    setTimeout(() => {
      app.transaction(() => open.forEach((id) => app.complete(id)), `Completed ${open.length} tasks`);
      setCompleting(new Set());
      setMulti(new Set());
      setToast({ text: `${open.length} tasks completed`, undo: true, icon: <CheckCircleIcon size={14} /> });
    }, 320);
  };

  const updateMany = (ids: string[], patch: Partial<TaskFields>, label: string, icon?: React.ReactNode) => {
    if (!ids.length) return;
    app.transaction(() => ids.forEach((id) => moveTask(id, patch)), label);
    setToast({ text: phrase(ids.length, label), undo: true, icon });
  };

  const deleteMany = (ids: string[]) => {
    if (!ids.length) return;
    const first = app.task(ids[0]!);
    const next = order.filter((x) => !ids.includes(x))[Math.max(0, order.indexOf(ids[0]!) )] ?? null;
    app.transaction(() => ids.forEach((id) => app.deleteTask(id)), `Deleted ${ids.length} task(s)`);
    setMulti(new Set());
    setSelected(next);
    setToast({ text: ids.length === 1 ? `Deleted “${first?.title ?? "task"}”` : `Deleted ${ids.length} tasks`, undo: true });
  };

  /** Copies the task and its sub-tasks, right after the original (⌘D, as in Things). */
  const duplicate = (id: string) => {
    const t = app.task(id);
    if (!t) return;
    let copyId: string | null = null;
    app.transaction(() => {
      const copy = app.createTask({ ...stripTask(t), order: t.order + 0.5 });
      copyId = copy?.id ?? null;
      if (!copy) return;
      for (const sub of app.tasks().filter((x) => x.parentId === id)) app.createTask({ ...stripTask(sub), parentId: copy.id });
    }, `Duplicated “${t.title}”`);
    if (copyId) setSelected(copyId);
    setToast({ text: `Duplicated “${t.title}”`, undo: true });
  };

  const notionUrl = (id: string) => {
    const nid = app.task(id)?.notionId;
    return nid ? `https://www.notion.so/${nid.replace(/-/g, "")}` : null;
  };
  const copyLink = (id: string) => {
    const url = notionUrl(id);
    if (!url) return setToast({ text: "This task hasn't reached Notion yet — try again in a moment" });
    void navigator.clipboard?.writeText(url).then(() => setToast({ text: "Link to the Notion page copied" }));
  };

  /** ⌥↑ / ⌥↓: move within its group. Reordering switches the view to manual order, like Todoist. */
  const shiftTask = (id: string, dir: -1 | 1) => {
    const group = vm.groups.find((g) => g.tasks.some((t) => t.id === id));
    const t = app.task(id);
    if (!group || !t || group.patch === null) return;
    const siblings = group.tasks.filter((x) => x.parentId === t.parentId);
    const i = siblings.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const rest = siblings.filter((x) => x.id !== id);
    const before = dir < 0 ? siblings[j]! : (siblings[j + 1] ?? null);
    if (prefs.sorting !== "manual") setPrefs({ sorting: "manual" });
    app.updateTask(id, { order: orderBefore(rest, before) });
  };

  /** Things' This Evening (today, later) and Someday (parked, no date). */
  const setWhen = (ids: string[], when: "evening" | "someday") => {
    if (!ids.length) return;
    const patch: Partial<TaskFields> = when === "evening" ? { due: toDateStr(new Date()), when } : { due: null, when };
    app.transaction(() => ids.forEach((id) => app.updateTask(id, patch)), when === "evening" ? "Moved to This Evening" : "Moved to Someday");
    setToast({
      text: phrase(ids.length, `Moved to ${when === "evening" ? "This Evening" : "Someday"}`),
      undo: true,
      icon: when === "evening" ? <MoonIcon size={13} filled /> : <ArchiveIcon size={13} />,
    });
  };

  const openPicker = (kind: "due" | "deadline", ids: string[]) => {
    if (!ids.length) return;
    const el = document.querySelector(`[data-id="${CSS.escape(ids[ids.length - 1]!)}"]`);
    setPicker({ kind, ids, anchor: el ? anchorOf(el) : { x: window.innerWidth / 2 - 130, y: 140 } });
  };

  const reschedule = (ids: string[], target: ScheduleTarget) => {
    if (!ids.length) return;
    app.schedule(ids, target);
    const due = scheduleDue(null, target);
    const text =
      target === "none"
        ? "Date removed"
        : target === "weekend"
          ? `Moved to the weekend · ${dayPhrase(due!)}`
          : target === "nextWeek"
            ? `Moved to next week · ${dayPhrase(due!)}`
            : `Moved to ${dayPhrase(due!)}`;
    setToast({ text: phrase(ids.length, text), undo: true, icon: target === "none" ? <NoDateIcon size={13} /> : <CalendarSmallIcon size={13} /> });
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
    const at = { x: e.clientX, y: e.clientY };
    // Right-clicking inside a multi-selection acts on all of it.
    const ids = multi.has(id) && multi.size > 1 ? [...multi] : [id];
    const many = ids.length > 1;
    const sections = t.projectId ? app.sections(t.projectId) : [];
    const today = startOfDay(new Date());
    const hint = (target: ScheduleTarget) => {
      const d = scheduleDue(null, target, today);
      return d ? parseDue(d).toLocaleDateString(undefined, { weekday: "short" }) : "";
    };
    const moveMenu = () =>
      taskMenu.open(at, [
        { heading: many ? `Move ${ids.length} tasks to` : "Move to" },
        { label: "Inbox", icon: <I.inbox />, onClick: () => updateMany(ids, { projectId: null, section: null }, "Moved to Inbox", <InboxIcon size={13} />) },
        ...app.projectTree().map(({ project, depth }) => ({
          label: `${"   ".repeat(depth)}${project.name}`,
          icon: project.emoji ?? "#",
          onClick: () => updateMany(ids, { projectId: project.id, section: null }, `Moved to ${project.name}`, <FolderIcon size={13} />),
        })),
        ...(sections.length && !many
          ? [
              { heading: "Section" } as MenuEntry,
              { label: "(No section)", onClick: () => app.updateTask(id, { section: null }) },
              ...sections.map((s) => ({ label: s, onClick: () => app.updateTask(id, { section: s }) })),
            ]
          : []),
      ]);
    const url = notionUrl(id);
    const items: MenuEntry[] = [
      ...(many
        ? [{ heading: `${ids.length} tasks selected` } as MenuEntry]
        : [
            { label: "Open details", icon: <I.open />, hint: "↩", onClick: () => setOpenId(id) },
            { label: "Edit tags…", icon: <I.tags />, hint: "L", onClick: () => setLabelsFor({ id, anchor: at }) },
          ]),
      { label: t.done && !many ? "Reopen" : "Complete", icon: <I.check />, hint: "E", onClick: () => (t.done && !many ? complete(id) : completeMany(ids)) },
      ...(t.recurrence && !many ? [{ label: "Skip this occurrence", icon: <I.skip />, onClick: () => {
                    app.skipOccurrence(id);
                    const next = app.task(id)?.due;
                    setToast({ text: next ? `Skipped · next ${dayPhrase(next)}` : "Skipped", undo: true, icon: <I.skip /> });
                  } }] : []),
      { separator: true },
      ...RESCHEDULE_TARGETS.filter(([target]) => target !== "none").map(([target, label]) => ({ label, hint: hint(target), onClick: () => reschedule(ids, target) })),
      { label: "This evening", icon: <MoonIcon size={13} />, hint: "⇧E", onClick: () => setWhen(ids, "evening") },
      { label: "Someday", icon: <I.archive />, hint: "⇧S", onClick: () => setWhen(ids, "someday") },
      { label: "Pick a date…", icon: "", hint: "S", onClick: () => setPicker({ kind: "due", ids, anchor: at }) },
      { label: t.deadline && !many ? "Change deadline…" : "Set deadline…", hint: "D", onClick: () => setPicker({ kind: "deadline", ids, anchor: at }) },
      ...(t.due || many ? [{ label: "Remove date", onClick: () => reschedule(ids, "none") }] : []),
      { separator: true },
      ...([1, 2, 3, 4] as Priority[]).map((p) => ({
        label: `Priority ${p}`,
        icon: !many && t.priority === p ? <I.check /> : "",
        hint: String(p),
        onClick: () => updateMany(ids, { priority: p }, `Priority ${p}`, <FlagIcon size={12} className={`prio-${p}`} />),
      })),
      { separator: true },
      { label: "Move to…", icon: <I.right />, onClick: () => setTimeout(moveMenu) },
      ...(!many
        ? [
            { label: "Duplicate", icon: <I.copy />, hint: "⌘D", onClick: () => duplicate(id) },
            { label: "Copy link", icon: <I.link />, hint: "⌘⇧C", onClick: () => copyLink(id) },
            ...(url ? [{ label: "Open in Notion", icon: <I.open />, onClick: () => void app.platform.openUrl(url) }] : []),
          ]
        : []),
      { separator: true },
      {
        label: many ? `Delete ${ids.length} tasks` : "Delete task",
        icon: <I.trash />,
        hint: "⌘⌫",
        danger: true,
        onClick: () =>
          void askConfirm(many ? `Delete ${ids.length} tasks?` : "Delete this task?", many ? "Delete Tasks" : "Delete Task", {
            detail: `${many ? "They are" : `“${t.title}” is`} removed from Notion too. ⌘Z undoes it.`,
          }).then((ok) => ok && deleteMany(ids)),
      },
    ];
    taskMenu.open(at, items);
  };

  const ctx: ViewCtx = {
    selected,
    multi,
    completing,
    collapsed,
    toggleCollapse: (id) =>
      setCollapsed((c) => {
        const n = new Set(c);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }),
    showProject: view.kind !== "project" && view.kind !== "inbox",
    onSelect,
    onOpen: setOpenId,
    onComplete: complete,
    onContextMenu: openTaskMenu,
    moveTask,
    reschedule,
  };

  const setPrefs = (patch: Partial<DisplayPrefs>) => app.setDisplayPrefs(key, patch);

  // ---- Keyboard ----

  /** Shortcuts inside the detail panel. J/K/arrows and Esc are the panel's own. */
  const peekKey = (e: KeyboardEvent, id: string) => {
    const t = app.task(id);
    if (!t) return;
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const anchorAt = (sel: string, i = 0) => {
      const el = document.querySelectorAll(sel)[i];
      return el ? anchorOf(el) : { x: window.innerWidth / 2 - 130, y: 140 };
    };
    if (meta) {
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "backspace") {
        e.preventDefault();
        deleteMany([id]);
        setOpenId(null);
      } else if (k === "d") {
        e.preventDefault();
        duplicate(id);
      } else if (k === "c" && e.shiftKey) {
        e.preventDefault();
        copyLink(id);
      }
      return;
    }
    if (e.altKey) return;
    const combo = comboFromEvent(e);
    const action = combo ? actionForCombo(combo, settings.shortcuts) : null;
    if (!action || action === "nextTask" || action === "previousTask" || action === "toggleSelect") return;
    e.preventDefault();
    switch (action) {
      case "completeTask":
        complete(id);
        break;
      case "priority1":
      case "priority2":
      case "priority3":
      case "priority4":
        app.updateTask(id, { priority: Number(action.slice(-1)) as Priority });
        break;
      case "scheduleToday":
        reschedule([id], "today");
        break;
      case "scheduleTomorrow":
        reschedule([id], "tomorrow");
        break;
      case "scheduleWeekend":
        reschedule([id], "weekend");
        break;
      case "scheduleNextWeek":
        reschedule([id], "nextWeek");
        break;
      case "scheduleClear":
        reschedule([id], "none");
        break;
      case "schedulePicker":
        setPicker({ kind: "due", ids: [id], anchor: anchorAt(".peek .date-btn", 0) });
        break;
      case "scheduleEvening":
        setWhen([id], "evening");
        break;
      case "scheduleSomeday":
        setWhen([id], "someday");
        break;
      case "deadlinePicker":
        setPicker({ kind: "deadline", ids: [id], anchor: anchorAt(".peek .date-btn", 1) });
        break;
      case "editLabels":
        setLabelsFor({ id, anchor: anchorAt(".peek .tag-pool") });
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
      case "productivity":
        setProductivity(true);
        break;
      case "openDetail":
        break;
    }
  };
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
      if (meta && e.key.toLowerCase() === "f" && !overlayOpen && view.kind !== "browse") {
        e.preventDefault();
        setFind((f) => f ?? "");
        requestAnimationFrame(() => (document.querySelector(".find-field input") as HTMLInputElement | null)?.select());
        return;
      }
      if (typing) return;
      if (peekOnly) return peekKey(e, openId!);
      if (overlayOpen) return;

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
        } else if (k === "backspace" && targets().length) {
          e.preventDefault();
          deleteMany(targets());
        } else if (k === "d" && selected) {
          e.preventDefault();
          duplicate(selected);
        } else if (k === "c" && e.shiftKey && selected) {
          e.preventDefault();
          copyLink(selected);
        }
        return;
      }
      if (e.altKey) {
        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && selected) {
          e.preventDefault();
          shiftTask(selected, e.key === "ArrowUp" ? -1 : 1);
        }
        return;
      }

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
      // ⇧↑ / ⇧↓ grow the selection one task at a time.
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && selected) {
        e.preventDefault();
        const to = order[e.key === "ArrowUp" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1)];
        if (to) {
          setMulti((m) => new Set([...m, selected, to]));
          setSelected(to);
        }
        return;
      }
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
        case " ": {
          // Things: Space adds a task next to the selected one, in the same project/section/day.
          if (!selected) return;
          e.preventDefault();
          const group = vm.groups.find((g) => g.tasks.some((t) => t.id === selected));
          const t = app.task(selected);
          setQuickAdd({ ...vm.addDefaults, ...(group?.patch ?? {}), ...(t?.parentId ? { parentId: t.parentId } : {}) });
          return;
        }
        case "Escape":
          if (multi.size) setMulti(new Set());
          else setSelected(null);
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
          completeMany(targets());
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
          updateMany(targets(), { priority: Number(action.slice(-1)) as Priority }, `Priority ${action.slice(-1)}`, <FlagIcon size={12} className={`prio-${action.slice(-1)}`} />);
          break;
        case "scheduleToday":
          reschedule(targets(), "today");
          break;
        case "scheduleTomorrow":
          reschedule(targets(), "tomorrow");
          break;
        case "scheduleWeekend":
          reschedule(targets(), "weekend");
          break;
        case "scheduleNextWeek":
          reschedule(targets(), "nextWeek");
          break;
        case "scheduleClear":
          reschedule(targets(), "none");
          break;
        case "schedulePicker":
          openPicker("due", targets());
          break;
        case "scheduleEvening":
          setWhen(targets(), "evening");
          break;
        case "scheduleSomeday":
          setWhen(targets(), "someday");
          break;
        case "deadlinePicker":
          openPicker("deadline", targets());
          break;
        case "toggleSelect":
          if (sel) {
            const next = new Set(multi);
            next.has(sel.id) ? next.delete(sel.id) : next.add(sel.id);
            setMulti(next);
          }
          break;
        case "productivity":
          setProductivity(true);
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
    { label: "Add task", kind: "Action", icon: <I.plus />, run: () => setQuickAdd(vm.addDefaults) },
    { label: "New project", kind: "Action", icon: <I.folder />, run: () => setProjectDialog({ id: null }) },
    { label: "Toggle sidebar", kind: "Action", icon: <I.sidebar />, run: () => app.updateSettings({ sidebarHidden: !settings.sidebarHidden }) },
    { label: "Keyboard shortcuts", kind: "Action", icon: <I.keyboard />, run: () => setShortcuts(true) },
    { label: "Settings", kind: "Action", icon: <I.gear />, run: () => setSettingsTab("general") },
    { label: "Switch to List layout", kind: "Action", icon: <I.list />, run: () => setPrefs({ layout: "list" }) },
    { label: "Switch to Board layout", kind: "Action", icon: <I.board />, run: () => setPrefs({ layout: "board" }) },
    { label: "Switch to Calendar layout", kind: "Action", icon: <I.calendar />, run: () => setPrefs({ layout: "calendar" }) },
    { label: "Undo", kind: "Action", icon: <I.undo />, run: undo },
    { label: "Productivity", kind: "Action", icon: <I.productivity />, run: () => setProductivity(true) },
    { label: "Import from Todoist…", kind: "Action", icon: <I.import />, run: () => setSettingsTab("import") },
    ...THEMES.map((t) => ({
      label: `Theme: ${t.name}`,
      kind: "Appearance",
      icon: <span className="dot" style={{ background: t.accent }} />,
      run: () => app.updateSettings({ palette: t.id, accent: t.accent }),
    })),
  ];

  const project = view.kind === "project" ? app.project(view.id) : undefined;
  // Things-style project progress: share of the project's tasks already done.
  const progress = project
    ? (() => {
        const all = app.tasks().filter((t) => t.projectId === project.id);
        return { done: all.filter((t) => t.done).length, total: all.length };
      })()
    : null;
  // Admit what the Display filters hide, so the sidebar count and the list never seem to disagree.
  const filtering = prefs.deadline !== DEFAULT_PREFS.deadline || prefs.priority !== DEFAULT_PREFS.priority || prefs.label !== DEFAULT_PREFS.label;
  const hiddenByFilters = filtering
    ? Math.max(0, viewTasks(view, app, { ...DEFAULT_PREFS, showCompleted: prefs.showCompleted }).tasks.length - viewTasks(view, app, prefs).tasks.length)
    : 0;
  const allowSections = view.kind === "project" && (prefs.groupBy === "default" || prefs.groupBy === "section") && !needle;

  return (
    <div className={`shell ${settings.sidebarHidden ? "no-sidebar" : ""}`}>
      <Sidebar
        view={view}
        onNavigate={navigate}
        onToggleSidebar={() => app.updateSettings({ sidebarHidden: !settings.sidebarHidden })}
        onQuickAdd={() => setQuickAdd(vm.addDefaults)}
        onSettings={() => setSettingsTab("general")}
        onShortcuts={() => setShortcuts(true)}
        onProductivity={() => setProductivity(true)}
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
            <b data-tauri-drag-region>
              {vm.title}
              {progress && progress.done > 0 && (
                <span className="title-progress" title={`${progress.done} of ${progress.total} tasks done`}>
                  <Ring value={progress.done} goal={progress.total} size={13} stroke={2} />
                </span>
              )}
            </b>
            <span data-tauri-drag-region>
              {view.kind !== "browse" && `${vm.count} task${vm.count === 1 ? "" : "s"}`}
              {hiddenByFilters > 0 ? ` · ${hiddenByFilters} hidden by filters` : ""}
              {progress && progress.done > 0 ? ` · ${Math.round((progress.done / progress.total) * 100)}% done` : ""}
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
                  { label: "Edit project…", icon: <I.edit />, onClick: () => setProjectDialog({ id: project.id }) },
                  { label: "Add section", icon: <I.section />, onClick: () => {
                    const name = `Section ${app.sections(project.id).length + 1}`;
                    void app.addSection(project.id, name);
                  } },
                  { label: project.favorite ? "Remove from favorites" : "Add to favorites", icon: <I.star />, onClick: () => void app.updateProject(project.id, { favorite: !project.favorite }) },
                  { label: "Save as template…", icon: <I.copy />, onClick: () => setTemplateFor(project.id) },
                ]);
              }}
              aria-label="Project menu"
                title="Project actions"
            >
              ⋯
            </button>
          )}
          {find !== null && (
            <div className="find-field">
              <SearchIcon size={13} />
              <input
                autoFocus
                placeholder={`Find in ${vm.title}`}
                value={find}
                onChange={(e) => setFind(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setFind(null);
                  }
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                    setSelected(order[0] ?? null);
                  }
                }}
              />
              {needle && <span className="find-count">{vm.count}</span>}
              <button className="icon-btn" onClick={() => setFind(null)} aria-label="Close find">
                <CloseIcon size={11} />
              </button>
            </div>
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
            <span className="warn"><WarningIcon size={13} /></span>
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
                  <ChevronIcon size={10} className="flip" />
                </button>
                <button className="today-btn" onClick={() => setUpcomingWeek(0)}>
                  Today
                </button>
                <button onClick={() => setUpcomingWeek((w) => w + 1)} aria-label="Next week">
                  <ChevronIcon size={10} />
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
            <>
              {project && !needle && <ProjectNotes project={project} />}
              <ListView vm={vm} ctx={ctx} allowSections={allowSections} />
            </>
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
      {picker && (
        <DatePicker
          anchor={picker.anchor}
          mode={picker.kind}
          value={(() => {
            const t = app.task(picker.ids[0]!);
            return (picker.kind === "due" ? t?.due : t?.deadline) ?? null;
          })()}
          duration={picker.ids.length === 1 ? app.task(picker.ids[0]!)?.duration : undefined}
          onDuration={
            picker.kind === "due"
              ? (m) => updateMany(picker.ids, { duration: m }, m ? `Duration · ${formatDuration(m)}` : "Duration removed", <ClockIcon size={13} />)
              : undefined
          }
          onChange={(v) =>
            picker.kind === "due"
              ? updateMany(picker.ids, { due: v }, v ? `Moved to ${dayPhrase(v)}` : "Date removed", <CalendarSmallIcon size={13} />)
              : updateMany(picker.ids, { deadline: v }, v ? `Deadline · ${dayPhrase(v)}` : "Deadline removed", <FlagIcon size={12} />)
          }
          onClose={() => setPicker(null)}
        />
      )}
      {multi.size > 1 && (
        <BulkBar
          count={multi.size}
          onComplete={() => completeMany([...multi])}
          onSchedule={(e) => setPicker({ kind: "due", ids: [...multi], anchor: anchorOf(e.currentTarget) })}
          onPriority={(p) => updateMany([...multi], { priority: p }, `Priority ${p}`, <FlagIcon size={12} className={`prio-${p}`} />)}
          onMove={(projectId) => updateMany([...multi], { projectId, section: null }, `Moved to ${app.projectName(projectId) ?? "Inbox"}`, <FolderIcon size={13} />)}
          onDelete={() =>
            void askConfirm(`Delete ${multi.size} tasks?`, "Delete Tasks", { detail: "They are removed from Notion too. ⌘Z undoes it." }).then((ok) => ok && deleteMany([...multi]))
          }
          onClear={() => setMulti(new Set())}
        />
      )}
      {productivity && <Productivity onClose={() => setProductivity(false)} />}
      {labelsFor && <LabelsPopover taskId={labelsFor.id} anchor={labelsFor.anchor} onClose={() => setLabelsFor(null)} />}
      {paywall && <Paywall onClose={() => setPaywall(false)} />}
      {!settings.tourDone && <Tour onClose={() => undefined} onOpenProject={(id) => navigate({ kind: "project", id })} />}
      {taskMenu.element}
      {toast && (
        <div className="toast">
          {toast.icon && <span className="toast-icon">{toast.icon}</span>}
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

/** The editable fields of a task, for copying it (⌘D). */
function stripTask(t: Task): Partial<TaskFields> {
  const { id: _id, notionId: _n, remoteEditedAt: _r, syncError: _s, createdAt: _c, done: _d, completedAt: _ca, ...fields } = t;
  return fields;
}

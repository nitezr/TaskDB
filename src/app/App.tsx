import { useEffect, useMemo, useRef, useState } from "react";
import { dueLabel, toDateStr } from "../core/dates";
import type { Priority, TaskFields } from "../types";
import { Browse } from "./components/Browse";
import { LicenseBanner, Paywall } from "./components/License";
import { Onboarding } from "./components/Onboarding";
import { ProjectHeader } from "./components/ProjectHeader";
import { QuickAdd } from "./components/QuickAdd";
import { SettingsPanel } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";
import { askConfirm, ConfirmHost } from "./confirm";
import { useApp } from "./hooks";
import { buildView, type View, visibleIds } from "./views";

interface Toast {
  text: string;
  undo?: () => void;
}

export function App() {
  const app = useApp();
  const settings = app.settings();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty("--accent", settings.accent);
  }, [settings.theme, settings.accent]);

  if (app.phase === "loading") return <div className="loading">Loading…</div>;
  if (app.phase === "connect") return <Onboarding />;
  return <Main />;
}

function Main() {
  const app = useApp();
  const [view, setView] = useState<View>({ kind: "today" });
  const [selected, setSelected] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [quickAdd, setQuickAdd] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gPressed = useRef(false);

  const vm = buildView(view, app);
  const ids = useMemo(() => visibleIds(vm, collapsed), [vm, collapsed]);

  useEffect(() => {
    app.onQuickAdd = () => setQuickAdd(true);
    app.onPaywall = () => {
      setQuickAdd(false);
      setPaywall(true);
    };
  }, [app]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const navigate = (v: View) => {
    setView(v);
    setSelected(null);
    if (v.kind !== "search" && searchRef.current) searchRef.current.value = "";
  };

  /** Completes with an undo that restores every touched task. */
  const completeWithUndo = (id: string) => {
    const task = app.task(id);
    if (!task) return;
    const touched = [task, ...app.tasks().filter((t) => t.parentId === id && !t.done)];
    const before = touched.map((t) => ({ id: t.id, fields: { done: t.done, completedAt: t.completedAt, due: t.due, reminder: t.reminder } }));
    app.complete(id);
    const after = app.task(id);
    setToast({
      text: after && !after.done && after.due ? `Rescheduled to ${dueLabel(after.due)}` : "1 task completed",
      undo: () => before.forEach((b) => app.updateTask(b.id, b.fields as Partial<TaskFields>)),
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (quickAdd || settingsOpen || paywall) return;

      if (gPressed.current) {
        gPressed.current = false;
        const dest: Record<string, View> = { i: { kind: "inbox" }, t: { kind: "today" }, u: { kind: "upcoming" }, f: { kind: "browse" } };
        if (dest[e.key]) {
          e.preventDefault();
          navigate(dest[e.key]!);
        }
        return;
      }

      const idx = selected ? ids.indexOf(selected) : -1;
      const sel = selected ? app.task(selected) : undefined;
      switch (e.key) {
        case "q":
        case "a":
          e.preventDefault();
          setQuickAdd(true);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "g":
          gPressed.current = true;
          setTimeout(() => (gPressed.current = false), 1000);
          break;
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setSelected(ids[Math.min(ids.length - 1, idx + 1)] ?? null);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setSelected(ids[Math.max(0, idx - 1)] ?? ids[0] ?? null);
          break;
        case "Enter":
          if (selected) setOpenId(selected);
          break;
        case "e":
        case "x":
          if (sel) {
            const next = ids[idx + 1] ?? ids[idx - 1] ?? null;
            completeWithUndo(sel.id);
            if (!app.task(sel.id) || app.task(sel.id)!.done) setSelected(next);
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          if (sel) app.updateTask(sel.id, { priority: Number(e.key) as Priority });
          break;
        case "t":
          if (sel) app.updateTask(sel.id, { due: toDateStr(new Date()) });
          break;
        case "Backspace":
        case "Delete":
          if (sel) {
            const next = ids[idx + 1] ?? ids[idx - 1] ?? null;
            void askConfirm(`Delete "${sel.title}"?`, "Delete").then((ok) => {
              if (!ok) return;
              app.deleteTask(sel.id);
              setSelected(next);
              setOpenId((o) => (o === sel.id ? null : o));
            });
          }
          break;
        case "Escape":
          if (openId) setOpenId(null);
          else setSelected(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Keep the selected row in view during keyboard navigation.
  useEffect(() => {
    if (selected) document.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const showProject = view.kind !== "project" && view.kind !== "inbox";

  return (
    <div className={`layout ${openId ? "with-detail" : ""}`}>
      <Sidebar view={view} onNavigate={navigate} onQuickAdd={() => setQuickAdd(true)} onSettings={() => setSettingsOpen(true)} searchRef={searchRef} />
      <main
        onClickCapture={(e) => {
          const btn = (e.target as HTMLElement).closest("button.check");
          const row = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
          // Route list checkbox clicks through undo.
          if (btn && row) {
            e.stopPropagation();
            const t = app.task(row.dataset.id!);
            if (t) t.done ? app.reopen(t.id) : completeWithUndo(t.id);
          }
        }}
      >
        <LicenseBanner onOpen={() => setPaywall(true)} />
        <header className="view-header">
          {view.kind === "project" ? <ProjectHeader id={view.id} onGone={() => navigate({ kind: "inbox" })} /> : <h1>{vm.title}</h1>}
          {view.kind === "today" && <span className="muted">{new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>}
        </header>
        {view.kind === "browse" ? (
          <Browse onNavigate={navigate} />
        ) : (
          <TaskList
            vm={vm}
            selected={selected}
            collapsed={collapsed}
            onSelect={setSelected}
            onOpen={setOpenId}
            onToggleCollapse={(id) =>
              setCollapsed((c) => {
                const n = new Set(c);
                n.has(id) ? n.delete(id) : n.add(id);
                return n;
              })
            }
            showProject={showProject}
          />
        )}
      </main>
      {openId && app.task(openId) && <TaskDetail id={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      {quickAdd && <QuickAdd variant="modal" defaults={vm.addDefaults} onDone={() => setQuickAdd(false)} />}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onBuy={() => {
            setSettingsOpen(false);
            setPaywall(true);
          }}
        />
      )}
      {paywall && <Paywall onClose={() => setPaywall(false)} />}
      <ConfirmHost />
      {toast && (
        <div className="toast">
          {toast.text}
          {toast.undo && (
            <button
              className="link"
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

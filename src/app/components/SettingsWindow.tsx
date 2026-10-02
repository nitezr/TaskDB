import { useEffect, useState } from "react";
import { askConfirm } from "../confirm";
import { useApp } from "../hooks";
import { QUICK_ADD_HOTKEY } from "../platform";
import {
  ACTIONS,
  type ActionGroup,
  type ActionId,
  bindingsFor,
  comboFromEvent,
  conflicts,
  displayCombo,
  FIXED_BINDINGS,
} from "../shortcuts";
import { LicenseSettings } from "./License";
import { THEMES } from "../themes";
import { parseTodoistCsv, projectNameFromFile } from "../../core/todoistCsv";
import { CloseIcon, GearIcon, ImportIcon, KeyboardIcon, KeyIcon, ResetIcon, SyncIcon } from "../icons";

const ACCENTS = ["#dc4c3e", "#246fe0", "#058527", "#8b5cf6", "#eb8909", "#e05194", "#14b8a6", "#475569"];
type Tab = "general" | "shortcuts" | "import" | "notion" | "license";

export function SettingsWindow({ onClose, onBuy, initialTab = "general" }: { onClose: () => void; onBuy: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string, React.ReactNode][] = [
    ["general", "General", <GearIcon />],
    ["shortcuts", "Shortcuts", <KeyboardIcon />],
    ["import", "Import", <ImportIcon />],
    ["notion", "Notion sync", <SyncIcon />],
    ["license", "License", <KeyIcon />],
  ];
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal settings-window"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !(e.target as HTMLElement).closest(".keycap.recording")) onClose();
        }}
      >
        <div className="settings-tabs">
          {tabs.map(([t, label, icon]) => (
            <button key={t} className={`nav ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </div>
        <div className="settings-main">
          <div className="settings-pane">
            {tab === "general" && <General />}
            {tab === "shortcuts" && <Shortcuts />}
            {tab === "import" && <ImportTab />}
            {tab === "notion" && <NotionTab />}
            {tab === "license" && (
              <>
                <h2>License</h2>
                <LicenseSettings onBuy={onBuy} />
              </>
            )}
          </div>
          <div className="settings-foot">
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function General() {
  const app = useApp();
  const s = app.settings();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
  const hourPicker = (value: number, key: "sleepStart" | "sleepEnd") => (
    <select value={value} disabled={!s.hideSleep} onChange={(e) => app.updateSettings({ [key]: Number(e.target.value) })}>
      {hours.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <h2>General</h2>
      <h4>Appearance</h4>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-card ${s.palette === t.id ? "on" : ""}`}
            onClick={() => app.updateSettings({ palette: t.id, accent: t.accent })}
            title={t.name}
          >
            <span className="theme-preview" style={{ background: t.light.page ?? "#faf9f7" }}>
              <span className="tp-side" style={{ background: t.light.sidebar ?? "#f3f1ee" }}>
                <i style={{ background: t.accent }} />
              </span>
              <span className="tp-dark" style={{ background: t.dark.page ?? "#1f1f1f" }}>
                <i style={{ background: t.accent }} />
              </span>
            </span>
            <span className="theme-name">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="field">
        Mode
        <div className="segmented">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} className={s.theme === t ? "on" : ""} onClick={() => app.updateSettings({ theme: t })}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        Accent colour
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button key={c} className={`swatch ${s.accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => app.updateSettings({ accent: c })} aria-label={`Accent ${c}`} />
          ))}
        </div>
      </div>
      <div className="field stacked">
        <div className="field-row">
          Interface font
          <div className="segmented">
            <button className={s.font === "avenir" ? "on" : ""} onClick={() => app.updateSettings({ font: "avenir", fontPicked: true })} style={{ fontFamily: "Avenir Next, Avenir, sans-serif" }}>
              Avenir Next
            </button>
            <button className={s.font === "system" ? "on" : ""} onClick={() => app.updateSettings({ font: "system", fontPicked: true })} style={{ fontFamily: "-apple-system, sans-serif" }}>
              System (SF)
            </button>
          </div>
        </div>
        <p className="caption">
          SF is crisper at small sizes; Avenir Next is rounder and lighter.
        </p>
      </div>

      <div className="field">
        Density
        <div className="segmented">
          {(["comfortable", "compact"] as const).map((d) => (
            <button key={d} className={s.density === d ? "on" : ""} onClick={() => app.updateSettings({ density: d })}>
              {d === "comfortable" ? "Comfortable" : "Compact"}
            </button>
          ))}
        </div>
      </div>

      <h4>Time-based views</h4>
      <div className="field">
        Open TaskDB on
        <select value={s.startView} onChange={(e) => app.updateSettings({ startView: e.target.value as typeof s.startView })}>
          <option value="today">Today</option>
          <option value="inbox">Inbox</option>
          <option value="upcoming">Upcoming</option>
        </select>
      </div>
      <div className="field">
        Week starts on
        <div className="segmented">
          {([0, 1] as const).map((d) => (
            <button key={d} className={s.weekStart === d ? "on" : ""} onClick={() => app.updateSettings({ weekStart: d })}>
              {d === 0 ? "Sunday" : "Monday"}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        Hide sleeping hours in calendar day and week views
        <input type="checkbox" checked={s.hideSleep} onChange={(e) => app.updateSettings({ hideSleep: e.target.checked })} />
      </label>
      <div className={`field ${s.hideSleep ? "" : "disabled"}`}>
        Sleeping hours
        <span className="row" style={{ gap: 6 }}>
          From {hourPicker(s.sleepStart, "sleepStart")} until {hourPicker(s.sleepEnd, "sleepEnd")}
        </span>
      </div>

      <h4>Feedback</h4>
      <label className="field">
        Show the Today count on the Dock icon
        <input type="checkbox" checked={s.dockBadge} onChange={(e) => app.updateSettings({ dockBadge: e.target.checked })} />
      </label>
      <label className="field">
        Play a sound when completing a task
        <input type="checkbox" checked={s.completionSound} onChange={(e) => app.updateSettings({ completionSound: e.target.checked })} />
      </label>
      <div className="field">
        Quick add from anywhere
        <span className="keycap emph">{QUICK_ADD_HOTKEY.replace("CommandOrControl", "⌘").replace("Shift", "⇧").replace("Space", "Space").replace(/\+/g, "")}</span>
      </div>
      <div className="field">
        Welcome tour
        <button className="link small" onClick={() => app.updateSettings({ tourDone: false })}>
          Show it again
        </button>
      </div>
    </>
  );
}

function Shortcuts() {
  const app = useApp();
  const overrides = app.settings().shortcuts;
  /** The action being recorded, and the key it replaces (null = adds to an unassigned action). */
  const [recording, setRecording] = useState<{ id: ActionId; replaces: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const title = (id: ActionId) => ACTIONS.find((a) => a.id === id)!.title;

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(null);
      const combo = comboFromEvent(e);
      if (!combo) return;
      const { id, replaces } = recording;
      const clash = conflicts(combo, id, overrides);
      const next = { ...overrides };
      // A key belongs to one action: take it off whatever had it.
      for (const other of clash) next[other] = bindingsFor(other, overrides).filter((c) => c !== combo);
      const current = bindingsFor(id, overrides);
      next[id] = [...new Set(replaces ? current.map((c) => (c === replaces ? combo : c)) : [...current, combo])];
      app.updateSettings({ shortcuts: next });
      setNote(
        clash.length
          ? `${displayCombo(combo)} was on ${title(clash[0]!)}; it now runs ${title(id)}.`
          : `${title(id)} is now ${displayCombo(combo)}.`,
      );
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, overrides, app]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups: ActionGroup[] = ["Navigation", "Tasks", "Schedule"];
  const isRec = (id: ActionId, key: string | null) => recording?.id === id && recording.replaces === key;
  return (
    <>
      <h2>Shortcuts</h2>
      {groups.map((g) => (
        <div key={g}>
          <h4>{g}</h4>
          {ACTIONS.filter((a) => a.group === g).map((a) => {
            const keys = bindingsFor(a.id, overrides);
            return (
              <div key={a.id} className="shortcut-row">
                {a.title}
                {overrides[a.id] && (
                  <button
                    className="reset-one"
                    title="Reset to default"
                    onClick={() => {
                      const { [a.id]: _, ...rest } = overrides;
                      app.updateSettings({ shortcuts: rest });
                      setNote(`${a.title} restored to its default.`);
                    }}
                  >
                    <ResetIcon />
                  </button>
                )}
                <span className="keys">
                  {keys.map((c, i) => (
                    <span key={c} className="keys">
                      {i > 0 && <span className="or">or</span>}
                      <button className={`keycap emph ${isRec(a.id, c) ? "recording" : ""}`} title="Click to record a new key" onClick={() => setRecording({ id: a.id, replaces: c })}>
                        {isRec(a.id, c) ? "Press a key…" : displayCombo(c)}
                      </button>
                    </span>
                  ))}
                  {!keys.length &&
                    (isRec(a.id, null) ? (
                      <span className="keycap recording">Press a key…</span>
                    ) : (
                      <button className="unassigned" onClick={() => setRecording({ id: a.id, replaces: null })}>
                        unassigned
                      </button>
                    ))}
                </span>
              </div>
            );
          })}
          {FIXED_BINDINGS.filter((f) => f.group === g).map((f) => (
            <div key={f.title} className="shortcut-row fixed">
              <span className="muted">{f.title}</span>
              <span className="keys">
                <span className="keycap">{f.keys}</span>
                <span className="or">fixed</span>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="shortcut-status">
        <span className="grow">{note ?? "Click a shortcut to record a new key. Esc cancels."}</span>
        <button
          className="link"
          onClick={() => {
            app.updateSettings({ shortcuts: {} });
            setNote("All shortcuts restored to defaults.");
          }}
        >
          Reset All
        </button>
      </div>
    </>
  );
}

/** Todoist CSV import: each exported project becomes a TaskDB project, in Notion. */
function ImportTab() {
  const app = useApp();
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const projects = files.map((f) => parseTodoistCsv(f.text, projectNameFromFile(f.name), { apiPriorities: flip }));
  const total = projects.reduce((n, p) => n + p.tasks.length, 0);

  const pick = async (list: FileList | null) => {
    if (!list) return;
    setDone(null);
    setFiles(await Promise.all(Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() }))));
  };

  const run = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const p of projects) n += await app.importProject(p);
      // Notion takes ~2.5 writes a second; say roughly how long the background sync needs.
      const minutes = Math.max(1, Math.round(n / 2.5 / 60));
      setDone(`Imported ${n} task${n === 1 ? "" : "s"} into ${projects.length} project${projects.length === 1 ? "" : "s"}. They're usable now and finish syncing to Notion in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      setFiles([]);
    } catch (e) {
      setDone(`Import stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Import</h2>
      <h4>From Todoist</h4>
      <ol className="steps-list">
        <li>In Todoist, open a project and choose ⋯ → Export as a template → Export as CSV file.</li>
        <li>Repeat for each project you want to bring over.</li>
        <li>Choose the files here. Each becomes a TaskDB project with its sections, sub-tasks, dates, repeats, priorities, labels and descriptions.</li>
      </ol>
      <label className="file-pick">
        <input type="file" accept=".csv,text/csv" multiple onChange={(e) => void pick(e.target.files)} />
        <span className="primary-outline">Choose CSV files…</span>
      </label>
      {projects.length > 0 && (
        <>
          <div className="import-list">
            {projects.map((p, i) => (
              <div key={i} className="import-row">
                <b>{p.name}</b>
                <span className="muted small">
                  {p.tasks.length} task{p.tasks.length === 1 ? "" : "s"}
                  {p.sections.length ? ` · ${p.sections.length} section${p.sections.length === 1 ? "" : "s"}` : ""}
                  {app.projects.some((x) => x.name.toLowerCase() === p.name.toLowerCase()) ? " · adds to the existing project" : ""}
                </span>
              </div>
            ))}
          </div>
          <label className="field">
            Priorities look reversed (older exports)
            <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="grow" />
            <button className="ghost" onClick={() => setFiles([])}>
              Clear
            </button>
            <button className="primary" disabled={busy || !total} onClick={() => void run()}>
              {busy ? "Importing…" : `Import ${total} task${total === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
      {done && <p className="banner info">{done}</p>}
      <p className="caption">Completed tasks aren't included in Todoist exports. Nothing is deleted in Todoist.</p>
    </>
  );
}

function NotionTab() {
  const app = useApp();
  const status = app.syncStatus();
  return (
    <>
      <h2>Notion sync</h2>
      <p className="small">
        {status.pending ? `${status.pending} change(s) waiting to sync.` : "Everything is synced."}{" "}
        {status.errors ? `${status.errors} task(s) failed to sync.` : ""}
      </p>
      <p className="small muted">
        {status.requests} Notion requests this session
        {status.lastSyncAt ? ` · last activity ${new Date(status.lastSyncAt).toLocaleTimeString()}` : ""}
      </p>
      {app.lastError && <p className="small error-text">Last error: {app.lastError}</p>}
      <ColumnsSection />
      <div className="row">
        <button className="ghost" onClick={() => void app.refreshProjects({ rereadTasks: true })}>
          Refresh from Notion
        </button>
        <span className="grow" />
        <button
          className="danger"
          onClick={() =>
            void askConfirm("Disconnect Notion?", "Disconnect", { detail: "Local data on this Mac is cleared. Your tasks stay in Notion.", danger: true }).then(
              (ok) => void (ok && app.disconnect()),
            )
          }
        >
          Disconnect Notion
        </button>
      </div>
    </>
  );
}

/**
 * Project and Person are plain columns in the one TaskDB database. Each can stay a select or be
 * linked to the user's own Projects / People database; TaskDB uses whatever the column shows.
 */
function ColumnsSection() {
  const app = useApp();
  const info = app.columnInfo();
  const [picking, setPicking] = useState<"project" | "person" | null>(null);
  const [dbs, setDbs] = useState<{ id: string; title: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (which: "project" | "person") => {
    setPicking(which);
    setError(null);
    if (!dbs) void app.databases().then(setDbs, (e) => setError(String(e?.message ?? e)));
  };
  const link = async (which: "project" | "person", db: { id: string; title: string }) => {
    const col = info[which].name;
    const ok = await askConfirm(`Link ${col} to “${db.title}”?`, "Link", {
      detail: `TaskDB renames the current ${col} column to “${col} (old)” and adds a new ${col} column linked to “${db.title}”. Nothing is deleted. Tasks start empty in the new column; fill it in Notion or in TaskDB.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await app.linkColumn(which, db.id);
      setPicking(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const row = (which: "project" | "person", label: string) => (
    <div className="column-row" key={which}>
      <div className="grow">
        <div className="column-name">{label}</div>
        <div className={`small ${info[which].kind === "unsupported" || info[which].kind === "missing" ? "warn-text" : "muted"}`}>{info[which].text}</div>
        {info[which].problem && <div className="small column-hint">{info[which].problem}</div>}
      </div>
      {info[which].kind !== "missing" && (
        <button className="ghost" disabled={busy} onClick={() => (picking === which ? setPicking(null) : open(which))}>
          {info[which].kind === "relation" ? "Change…" : "Link to a database…"}
        </button>
      )}
    </div>
  );

  return (
    <>
      <h4>Project and Person</h4>
      <p className="caption" style={{ marginTop: 0 }}>
        Your tasks live in one database, TaskDB Tasks. Its Project and Person columns can be simple selects, or link to Projects and People databases you
        already have. If they link, Notion also needs those databases shared with TaskDB so it can read the names.
      </p>
      <div className="column-card">
        {row("project", "Project")}
        {picking === "project" && <DbPicker dbs={dbs} busy={busy} onPick={(db) => void link("project", db)} />}
        {row("person", "Person")}
        {picking === "person" && <DbPicker dbs={dbs} busy={busy} onPick={(db) => void link("person", db)} />}
      </div>
      {busy && <p className="small muted">Linking… then re-reading every task from Notion.</p>}
      {error && <p className="small error-text">{error}</p>}
      <p className="caption">A linked database must be shared with TaskDB in Notion (••• › Connections). Order, nesting, colours and sections are kept on this Mac unless the linked database has matching columns.</p>
      {info.hiddenProjects > 0 && (
        <p className="caption">
          {info.hiddenProjects} deleted project{info.hiddenProjects === 1 ? " is" : "s are"} hidden from TaskDB.{" "}
          <button className="link small" onClick={() => app.showHiddenProjects()}>
            Show again
          </button>
        </p>
      )}
    </>
  );
}

function DbPicker({ dbs, busy, onPick }: { dbs: { id: string; title: string }[] | null; busy: boolean; onPick: (db: { id: string; title: string }) => void }) {
  const [q, setQ] = useState("");
  if (!dbs) return <p className="small muted db-picker">Loading databases…</p>;
  const shown = dbs.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="db-picker">
      <input autoFocus placeholder="Search databases shared with TaskDB…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="db-list">
        {shown.map((d) => (
          <button key={d.id} disabled={busy} onClick={() => onPick(d)}>
            {d.title}
          </button>
        ))}
        {!shown.length && <p className="small muted">No shared databases match. Share one with TaskDB in Notion first.</p>}
      </div>
    </div>
  );
}

/** "?" panel: every shortcut, remappable and fixed. */
export function ShortcutsPanel({ onClose, onCustomize }: { onClose: () => void; onCustomize: () => void }) {
  const app = useApp();
  const overrides = app.settings().shortcuts;
  const groups: ActionGroup[] = ["Navigation", "Tasks", "Schedule"];
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal shortcuts-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginTop: 0 }}>
          <h2 className="grow" style={{ fontSize: 18 }}>
            Keyboard shortcuts
          </h2>
          <button className="link small" onClick={onCustomize}>
            Customize…
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="cols">
          {groups.map((g) => (
            <div key={g} style={{ display: "contents" }}>
              <h4>{g}</h4>
              {ACTIONS.filter((a) => a.group === g).map((a) => (
                <div key={a.id} className="shortcut-row">
                  {a.title}
                  <span className="keys">
                    {bindingsFor(a.id, overrides).map((c, i) => (
                      <span key={c} className="keys">
                        {i > 0 && <span className="or">or</span>}
                        <span className="keycap emph">{displayCombo(c)}</span>
                      </span>
                    ))}
                    {!bindingsFor(a.id, overrides).length && <span className="unassigned">unassigned</span>}
                  </span>
                </div>
              ))}
              {FIXED_BINDINGS.filter((f) => f.group === g).map((f) => (
                <div key={f.title} className="shortcut-row fixed">
                  <span className="muted">{f.title}</span>
                  <span className="keys">
                    <span className="keycap">{f.keys}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

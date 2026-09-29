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
import { CloseIcon, GearIcon, KeyboardIcon, KeyIcon, ResetIcon, SyncIcon } from "../icons";

const ACCENTS = ["#dc4c3e", "#246fe0", "#058527", "#8b5cf6", "#eb8909", "#e05194", "#14b8a6", "#475569"];
type Tab = "general" | "shortcuts" | "notion" | "license";

export function SettingsWindow({ onClose, onBuy, initialTab = "general" }: { onClose: () => void; onBuy: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string, React.ReactNode][] = [
    ["general", "General", <GearIcon />],
    ["shortcuts", "Shortcuts", <KeyboardIcon />],
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
      <div className="field">
        Theme
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
          Avenir Next is rounder and lighter, but has a smaller x-height, so it reads a size down at the small sizes most of this interface uses. SF is
          drawn for that range and is usually crisper on screen.
        </p>
      </div>

      <h4>Time-based views</h4>
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
      <div className="row">
        <button className="ghost" onClick={() => void app.refreshProjects()}>
          Refresh projects
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

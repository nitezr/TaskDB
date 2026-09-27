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

const ACCENTS = ["#dc4c3e", "#246fe0", "#058527", "#8b5cf6", "#eb8909", "#e05194", "#14b8a6", "#475569"];
type Tab = "general" | "shortcuts" | "notion" | "license";

export function SettingsWindow({ onClose, onBuy, initialTab = "general" }: { onClose: () => void; onBuy: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string, string][] = [
    ["general", "General", "⚙"],
    ["shortcuts", "Shortcuts", "⌨"],
    ["notion", "Notion sync", "⇅"],
    ["license", "License", "🔑"],
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
      </div>
    </div>
  );
}

function General() {
  const app = useApp();
  const s = app.settings();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
  return (
    <>
      <h2>General</h2>
      <div className="field">
        Appearance
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
      <div className="field">
        Interface font
        <div className="segmented">
          <button className={s.font === "avenir" ? "on" : ""} onClick={() => app.updateSettings({ font: "avenir" })} style={{ fontFamily: "Avenir Next, Avenir, sans-serif" }}>
            Avenir Next
          </button>
          <button className={s.font === "system" ? "on" : ""} onClick={() => app.updateSettings({ font: "system" })} style={{ fontFamily: "-apple-system, sans-serif" }}>
            System (SF)
          </button>
        </div>
      </div>
      <label className="field">
        Play a sound when completing a task
        <input type="checkbox" checked={s.completionSound} onChange={(e) => app.updateSettings({ completionSound: e.target.checked })} />
      </label>
      <label className="field">
        Hide sleeping hours in calendar day and week views
        <input type="checkbox" checked={s.hideSleep} onChange={(e) => app.updateSettings({ hideSleep: e.target.checked })} />
      </label>
      {s.hideSleep && (
        <div className="field">
          Sleeping hours
          <span>
            <select value={s.sleepStart} onChange={(e) => app.updateSettings({ sleepStart: Number(e.target.value) })}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>{" "}
            to{" "}
            <select value={s.sleepEnd} onChange={(e) => app.updateSettings({ sleepEnd: Number(e.target.value) })}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
      <div className="field">
        Quick add from anywhere
        <span className="keycap">{QUICK_ADD_HOTKEY.replace("CommandOrControl", "⌘").replace("Shift", "⇧").replace("Space", "Space").replace(/\+/g, "")}</span>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="ghost" onClick={() => app.updateSettings({ tourDone: false })}>
          Show the welcome tour again
        </button>
      </div>
    </>
  );
}

function Shortcuts() {
  const app = useApp();
  const overrides = app.settings().shortcuts;
  const [recording, setRecording] = useState<ActionId | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(null);
      const combo = comboFromEvent(e);
      if (!combo) return;
      const clash = conflicts(combo, recording, overrides);
      const next = { ...overrides };
      // A key belongs to one action: take it off whatever had it.
      for (const other of clash) next[other] = bindingsFor(other, overrides).filter((c) => c !== combo);
      next[recording] = [...new Set([...bindingsFor(recording, overrides), combo])];
      app.updateSettings({ shortcuts: next });
      setWarning(clash.length ? `${displayCombo(combo)} was moved from “${ACTIONS.find((a) => a.id === clash[0])!.title}”.` : null);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, overrides, app]);

  const groups: ActionGroup[] = ["Navigation", "Tasks", "Schedule"];
  return (
    <>
      <h2>Shortcuts</h2>
      <p className="small muted">Click + to record a new key for an action. Click a key to remove it.</p>
      {warning && <div className="banner info">{warning}</div>}
      {groups.map((g) => (
        <div key={g}>
          <h4>{g}</h4>
          {ACTIONS.filter((a) => a.group === g).map((a) => (
            <div key={a.id} className="shortcut-row">
              {a.title}
              <span className="keys">
                {bindingsFor(a.id, overrides).map((c) => (
                  <button
                    key={c}
                    className="keycap removable"
                    title="Remove"
                    onClick={() => app.updateSettings({ shortcuts: { ...overrides, [a.id]: bindingsFor(a.id, overrides).filter((x) => x !== c) } })}
                  >
                    {displayCombo(c)}
                  </button>
                ))}
                <button className={`keycap ${recording === a.id ? "recording" : ""}`} onClick={() => setRecording(a.id)}>
                  {recording === a.id ? "Press a key…" : "+"}
                </button>
              </span>
            </div>
          ))}
          {FIXED_BINDINGS.filter((f) => f.group === g).map((f) => (
            <div key={f.title} className="shortcut-row muted">
              {f.title}
              <span className="keys">
                <span className="keycap">{f.keys}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="row">
        <button className="ghost" onClick={() => app.updateSettings({ shortcuts: {} })}>
          Restore defaults
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
            void askConfirm("Disconnect Notion? Local data is cleared; your tasks stay in Notion.", "Disconnect").then(
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
            ✕
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
                    {bindingsFor(a.id, overrides).map((c) => (
                      <span key={c} className="keycap">
                        {displayCombo(c)}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
              {FIXED_BINDINGS.filter((f) => f.group === g).map((f) => (
                <div key={f.title} className="shortcut-row">
                  {f.title}
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

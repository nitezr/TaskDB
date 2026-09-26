import { useApp } from "../hooks";
import { QUICK_ADD_HOTKEY } from "../platform";

const ACCENTS = ["#dc4c3e", "#246fe0", "#058527", "#8b5cf6", "#eb8909", "#e05194", "#14b8a6", "#475569"];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const s = app.settings();
  const status = app.syncStatus();

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <header>
          <h2>Settings</h2>
          <button className="ghost icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <h4>Theme</h4>
        <div className="segmented">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} className={s.theme === t ? "on" : ""} onClick={() => app.saveSettings({ ...s, theme: t })}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <h4>Accent colour</h4>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`swatch ${s.accent === c ? "on" : ""}`}
              style={{ background: c }}
              onClick={() => app.saveSettings({ ...s, accent: c })}
              aria-label={`Accent ${c}`}
            />
          ))}
        </div>

        <h4>Keyboard</h4>
        <table className="shortcuts">
          <tbody>
            {[
              [QUICK_ADD_HOTKEY.replace("CommandOrControl", "⌘").replace(/\+/g, " "), "Quick add from anywhere"],
              ["Q", "Quick add"],
              ["/", "Search"],
              ["J / K", "Move down / up"],
              ["E", "Complete selected"],
              ["Enter", "Open selected"],
              ["1–4", "Set priority"],
              ["T", "Due today"],
              ["⌫", "Delete selected"],
              ["G then I / T / U", "Go to Inbox / Today / Upcoming"],
            ].map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Notion sync</h4>
        <p className="small">
          {status.pending ? `${status.pending} change(s) waiting to sync.` : "Everything is synced."}{" "}
          {status.errors ? `${status.errors} task(s) failed to sync.` : ""}
          <br />
          <span className="muted">
            {status.requests} Notion requests this session
            {status.lastSyncAt ? ` · last activity ${new Date(status.lastSyncAt).toLocaleTimeString()}` : ""}
          </span>
        </p>
        {app.lastError && <p className="small error-text">Last error: {app.lastError}</p>}
        <div className="row">
          <button className="ghost" onClick={() => void app.refreshProjects()}>
            Refresh projects
          </button>
          <span className="grow" />
          <button
            className="danger"
            onClick={() => {
              if (confirm("Disconnect Notion? Local data is cleared; your tasks stay in Notion.")) void app.disconnect();
            }}
          >
            Disconnect Notion
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { PageRef, WorkspaceIds } from "../../notion/setup";
import { useApp } from "../hooks";

type Step = { kind: "token" } | { kind: "page"; pages: PageRef[]; existing: WorkspaceIds | null } | { kind: "working" };

export function Onboarding() {
  const app = useApp();
  const [token, setToken] = useState(app.platform.kind === "demo" ? "demo-token" : "");
  const [step, setStep] = useState<Step>({ kind: "token" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const check = () =>
    run(async () => {
      const res = await app.connect(token);
      setStep({ kind: "page", ...res });
    });

  const finish = (target: Parameters<typeof app.finishSetup>[1]) =>
    run(async () => {
      setStep({ kind: "working" });
      try {
        await app.finishSetup(token, target);
      } catch (e) {
        setStep({ kind: "token" });
        throw e;
      }
    });

  return (
    <div className="onboarding">
      <div className="card">
        <div className="brand big">
          <span className="logo">✓</span> TaskDB
        </div>
        <p className="muted">Todoist-style speed on top of your own Notion. Your tasks never leave your workspace.</p>

        {step.kind === "token" && (
          <>
            <h3>1. Connect Notion</h3>
            <ol className="small">
              <li>
                Open <b>notion.so/profile/integrations</b> → <b>New integration</b> (type: Internal).
              </li>
              <li>Copy the <b>Internal Integration Secret</b> and paste it below.</li>
              <li>
                In Notion, open the page where TaskDB should live → <b>•••</b> → <b>Connections</b> → add your integration.
              </li>
            </ol>
            <input
              type="password"
              placeholder="ntn_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && token.trim() && void check()}
              autoFocus
            />
            <button className="primary wide" disabled={!token.trim() || busy} onClick={() => void check()}>
              {busy ? "Checking…" : "Continue"}
            </button>
            <p className="small muted">The secret is stored in your macOS Keychain and only sent to Notion.</p>
          </>
        )}

        {step.kind === "page" && (
          <>
            {step.existing && (
              <>
                <h3>Welcome back</h3>
                <p className="small">Found TaskDB databases from an earlier install.</p>
                <button className="primary wide" disabled={busy} onClick={() => void finish({ existing: step.existing! })}>
                  Reconnect existing TaskDB
                </button>
                <p className="small muted center">or create a fresh set below</p>
              </>
            )}
            <h3>2. Choose where TaskDB lives</h3>
            {step.pages.length === 0 ? (
              <p className="small">
                No pages shared yet. In Notion, open a page → <b>•••</b> → <b>Connections</b> → add your integration, then{" "}
                <button className="link" onClick={() => void check()}>
                  check again
                </button>
                .
              </p>
            ) : (
              <ul className="page-list">
                {step.pages.map((p) => (
                  <li key={p.id}>
                    <button disabled={busy} onClick={() => void finish({ parentPageId: p.id })}>
                      📄 {p.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted">TaskDB creates two databases there: “TaskDB Tasks” and “TaskDB Projects”.</p>
          </>
        )}

        {step.kind === "working" && <p>Setting up your databases…</p>}
        {error && <p className="error-text small">{error}</p>}
      </div>
    </div>
  );
}

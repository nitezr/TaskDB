import appIcon from "../assets/app-icon.png";
import { BoltIcon, ChevronIcon, DatabaseIcon, KeyboardIcon, PageIcon } from "../icons";
import { useEffect, useState } from "react";
import type { PageRef, WorkspaceIds } from "../../notion/setup";
import { useApp } from "../hooks";
import { NOTION_AUTH_URL } from "../platform";

const INTEGRATIONS_URL = "https://www.notion.so/profile/integrations";
const POLL_MS = 3_000;

type Step =
  | { kind: "token" }
  | { kind: "access"; pages: PageRef[]; existing: WorkspaceIds | null; via: "oauth" | "secret" }
  | { kind: "working" };

/** Three short steps; step 2 watches for page access so the user never clicks "check again". */
export function Onboarding() {
  const app = useApp();
  const demo = app.platform.kind === "demo";
  const authUrl = NOTION_AUTH_URL || (demo ? "demo" : "");
  const [mode, setMode] = useState<"oauth" | "secret">(authUrl ? "oauth" : "secret");
  const [token, setToken] = useState(demo ? "demo-token" : "");
  const [step, setStep] = useState<Step>({ kind: "token" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openNotion = () => void app.platform.openUrl(INTEGRATIONS_URL);

  const connect = async () => {
    const t = token.trim();
    if (!demo && !/^(ntn_|secret_)/.test(t)) {
      setError("That doesn't look like a Notion secret. It starts with “ntn_”.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStep({ kind: "access", via: "secret", ...(await app.connect(t)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/unauthorized|invalid/i.test(msg) ? "Notion didn't accept that secret. Copy it again and paste." : msg);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await app.signInWithNotion(authUrl);
      setToken(res.token);
      if (res.existing) return setStep({ kind: "access", via: "oauth", pages: res.pages, existing: res.existing });
      // Notion copied our template page into their workspace, or they shared exactly one page: no picking needed.
      const target = res.templateId ?? (res.pages.length === 1 ? res.pages[0]!.id : null);
      if (target) return void finish({ parentPageId: target }, res.token);
      setStep({ kind: "access", via: "oauth", pages: res.pages, existing: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Waiting for the user to grant page access in Notion: re-check quietly.
  const waiting = step.kind === "access" && step.via === "secret" && step.pages.length === 0 && !step.existing;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const res = await app.connect(token.trim());
        if (res.pages.length || res.existing) setStep({ kind: "access", via: "secret", ...res });
      } catch {
        // Keep waiting; a transient error shouldn't interrupt setup.
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [waiting, app, token]);

  const finish = async (target: Parameters<typeof app.finishSetup>[1], tok = token.trim()) => {
    const via = step.kind === "access" ? step.via : mode;
    setStep({ kind: "working" });
    setError(null);
    try {
      await app.finishSetup(tok, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: "access", via, ...(await app.connect(tok).catch(() => ({ pages: [], existing: null }))) });
    }
  };

  const stepNo = step.kind === "token" ? 1 : step.kind === "access" ? 2 : 3;

  return (
    <div className="onboarding" data-tauri-drag-region>
      <div className="card">
        <img className="app-icon" src={appIcon} alt="" width={72} height={72} draggable={false} />

        {step.kind === "token" && mode === "oauth" && (
          <>
            <h2>Welcome to TaskDB</h2>
            <p className="muted">Todoist-fast task management, on top of your own Notion.</p>
            <button className="primary wide notion-connect" disabled={busy} onClick={() => void signIn()}>
              {busy ? "Waiting for Notion…" : "Connect with Notion"}
            </button>
            {busy ? (
              <p className="small muted center">Finish in your browser: pick a page, click Allow, then come back here.</p>
            ) : (
              <p className="small muted center">
                <button className="link" onClick={() => setMode("secret")}>
                  Use a Notion secret instead
                </button>
              </p>
            )}
          </>
        )}

        {step.kind === "token" && mode === "secret" && (
          <>
            <h2>Connect your Notion</h2>
            <p className="muted">Takes about a minute. Your tasks stay in your own Notion.</p>
            <ol className="big-steps">
              <li>
                <button className="ghost" onClick={openNotion}>
                  Open Notion
                </button>
                <span>
                  Click <b>New integration</b>, name it <b>TaskDB</b>, then <b>Save</b>.
                </span>
              </li>
              <li>
                <span>
                  Copy the <b>secret</b> Notion shows you and paste it here:
                </span>
              </li>
            </ol>
            <input
              type="password"
              placeholder="ntn_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && token.trim() && void connect()}
              autoFocus
            />
            <button className="primary wide" disabled={!token.trim() || busy} onClick={() => void connect()}>
              {busy ? "Checking…" : "Continue"}
            </button>
            {authUrl && (
              <p className="small muted center">
                <button className="link" onClick={() => setMode("oauth")}>
                  Back to one-click connect
                </button>
              </p>
            )}
          </>
        )}

        {step.kind === "access" && step.existing && (
          <>
            <h2>Welcome back</h2>
            <p className="muted">Your TaskDB databases are already in Notion.</p>
            <button className="primary wide" onClick={() => void finish({ existing: step.existing! })}>
              Continue with my tasks
            </button>
          </>
        )}

        {step.kind === "access" && step.via === "oauth" && !step.existing && step.pages.length === 0 && (
          <>
            <h2>TaskDB needs one page</h2>
            <p className="muted">In Notion's window, pick a page for TaskDB (an empty page called “Tasks” works well).</p>
            <button className="primary wide" disabled={busy} onClick={() => void signIn()}>
              {busy ? "Waiting for Notion…" : "Connect again"}
            </button>
          </>
        )}

        {step.kind === "access" && step.via === "secret" && !step.existing && step.pages.length === 0 && (
          <>
            <h2>Give TaskDB one page</h2>
            <p className="muted">TaskDB only sees the page you choose.</p>
            <ol className="big-steps">
              <li>
                <span>
                  In the same Notion screen, open the <b>Access</b> tab.
                </span>
              </li>
              <li>
                <span>
                  Click <b>Edit access</b>, pick a page (e.g. a new empty page called “Tasks”), then <b>Save</b>.
                </span>
              </li>
            </ol>
            <div className="waiting">
              <span className="spinner" /> Waiting for access…
            </div>
            <button className="link small" onClick={openNotion}>
              Open Notion again
            </button>
          </>
        )}

        {step.kind === "access" && !step.existing && step.pages.length > 0 && (
          <>
            <h2>Where should TaskDB live?</h2>
            <p className="muted">TaskDB adds one database to this page: TaskDB Tasks. Projects and people are columns in it, and you can link them to your own databases later.</p>
            <ul className="page-list">
              {step.pages.map((p) => (
                <li key={p.id}>
                  <button onClick={() => void finish({ parentPageId: p.id })}>
                    <PageIcon /> <span className="grow">{p.title}</span> <ChevronIcon />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {step.kind === "working" && (
          <div className="waiting big">
            <span className="spinner" /> Setting up your Notion databases…
          </div>
        )}

        {error && <p className="error-text small">{error}</p>}
        <div className="steps-dots" aria-label={`Step ${stepNo} of 3`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={n === stepNo ? "on" : n < stepNo ? "done" : ""} />
          ))}
        </div>
      </div>
      {step.kind === "token" && (
        <ul className="onb-points">
          <li>
            <DatabaseIcon />
            <span>
              <b>Your data stays in Notion</b>
              Tasks live in your own workspace. Nothing is stored on our servers.
            </span>
          </li>
          <li>
            <BoltIcon />
            <span>
              <b>Instant and offline</b>
              A local copy makes every action immediate; changes sync in the background.
            </span>
          </li>
          <li>
            <KeyboardIcon size={18} />
            <span>
              <b>Keyboard first</b>
              Capture, schedule and complete without touching the mouse.
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}

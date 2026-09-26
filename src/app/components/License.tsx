import { useState } from "react";
import { CHECKOUT_URL, type LicenseState } from "../../license/license";
import { useApp } from "../hooks";

export const PRICE_LABEL = "$29 / year";

export function describeLicense(s: LicenseState): string {
  switch (s.kind) {
    case "trial":
      return `Free trial · ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left`;
    case "licensed":
      return s.expiresAt ? `Licensed · renews ${new Date(s.expiresAt).toLocaleDateString()}` : "Licensed";
    case "offline":
      return `Can't reach the license server · works offline for ${s.daysLeft} more day${s.daysLeft === 1 ? "" : "s"}`;
    case "expired":
      return s.reason === "trial"
        ? "Your free trial has ended"
        : s.reason === "offline"
          ? "License couldn't be checked for 7 days"
          : "Your license has expired";
  }
}

/** Banner above the task list, shown near the end of the trial or when read-only. */
export function LicenseBanner({ onOpen }: { onOpen: () => void }) {
  const app = useApp();
  const s = app.licenseState();
  const show = s.kind === "expired" || s.kind === "offline" || (s.kind === "trial" && s.daysLeft <= 5);
  if (!show) return null;
  return (
    <div className={`banner ${s.kind === "expired" ? "error" : "info"} license-banner`}>
      <span>
        {describeLicense(s)}
        {s.kind === "expired" && " — your tasks are read-only until you activate a license."}
      </span>
      <button className="link" onClick={onOpen}>
        {s.kind === "offline" ? "Retry" : `Buy TaskDB · ${PRICE_LABEL}`}
      </button>
    </div>
  );
}

/** Buy / enter key dialog. */
export function Paywall({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const s = app.licenseState();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await app.activateLicense(key);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal paywall" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="brand big">
          <span className="logo">✓</span> TaskDB
        </div>
        <p className={s.kind === "expired" ? "error-text" : "muted"}>{describeLicense(s)}</p>
        <ul className="benefits">
          <li>Todoist-speed task entry, backed by your own Notion</li>
          <li>Today, Upcoming, projects, labels, people and filters</li>
          <li>Recurring tasks, reminders and the ⌘⇧Space quick add</li>
          <li>All updates for the year · works offline</li>
        </ul>
        <button className="primary wide" onClick={() => void app.platform.openUrl(CHECKOUT_URL)}>
          Buy TaskDB · {PRICE_LABEL}
        </button>
        <p className="small muted center">Your license key arrives by email right after checkout.</p>
        <div className="row">
          <input
            className="grow"
            placeholder="Paste license key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && key.trim() && void activate()}
          />
          <button className="ghost" disabled={!key.trim() || busy} onClick={() => void activate()}>
            {busy ? "Activating…" : "Activate"}
          </button>
        </div>
        {error && <p className="small error-text">{error}</p>}
        <div className="row">
          <span className="grow" />
          <button className="ghost" onClick={onClose}>
            {s.kind === "expired" ? "Keep browsing (read-only)" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** License section inside Settings. */
export function LicenseSettings({ onBuy }: { onBuy: () => void }) {
  const app = useApp();
  const s = app.licenseState();
  const key = app.licenseKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <p className="small">{describeLicense(s)}</p>
      {key ? (
        <div className="row">
          <code className="small muted">
            {key.slice(0, 4)}…{key.slice(-4)}
          </code>
          <span className="grow" />
          <button className="ghost" disabled={busy} onClick={() => void run(() => app.revalidate(true))}>
            Check now
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => confirm("Remove the license from this Mac? You can activate it on another Mac.") && void run(() => app.deactivateLicense())}
          >
            Deactivate
          </button>
        </div>
      ) : (
        <button className="primary" onClick={onBuy}>
          Buy or enter license key
        </button>
      )}
      {error && <p className="small error-text">{error}</p>}
    </>
  );
}

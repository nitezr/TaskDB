import { useEffect, useState } from "react";

/**
 * In-app replacement for window.confirm, which WKWebView (the macOS webview
 * Tauri uses) may not show. Returns a promise instead of blocking.
 */
interface Request {
  message: string;
  okLabel: string;
  resolve: (ok: boolean) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function askConfirm(message: string, okLabel = "OK"): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { message, okLabel, resolve };
    notify();
  });
}

function answer(ok: boolean) {
  const req = current;
  current = null;
  notify();
  req?.resolve(ok);
}

export function ConfirmHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  if (!current) return null;
  return (
    <div className="overlay confirm-overlay" onMouseDown={() => answer(false)}>
      <div
        className="modal confirm"
        role="alertdialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") answer(false);
          if (e.key === "Enter") answer(true);
        }}
      >
        <p>{current.message}</p>
        <div className="row">
          <span className="grow" />
          <button className="ghost" onClick={() => answer(false)}>
            Cancel
          </button>
          <button className="primary" autoFocus onClick={() => answer(true)}>
            {current.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

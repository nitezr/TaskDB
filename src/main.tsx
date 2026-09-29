import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppController } from "./app/controller";
import { demoPlatform } from "./app/demo";
import { AppContext } from "./app/hooks";
import { isTauri, tauriPlatform } from "./app/platform";
import "./app/styles.css";
import { injectThemes } from "./app/themes";

// The Mac window has an overlay title bar and sidebar vibrancy (tauri.conf.json); the CSS makes
// room for the traffic lights and lets the material show through.
injectThemes();
if (isTauri() && /Mac/.test(navigator.platform || navigator.userAgent)) document.documentElement.classList.add("mac-window");

/** Shows a startup crash on screen instead of a blank window. */
function showFatal(err: unknown) {
  const root = document.getElementById("root")!;
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "fatal";
  const h = document.createElement("h2");
  h.textContent = "TaskDB couldn't start";
  const p = document.createElement("p");
  p.textContent = "Please send this message to support:";
  const pre = document.createElement("pre");
  pre.textContent = msg;
  box.append(h, p, pre);
  root.append(box);
}

window.addEventListener("error", (e) => {
  if (!document.querySelector(".layout, .onboarding")) showFatal(e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  if (!document.querySelector(".layout, .onboarding")) showFatal(e.reason);
});

async function main() {
  const platform = isTauri() ? await tauriPlatform() : demoPlatform();
  const app = new AppController(platform);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppContext.Provider value={app}>
        <App />
      </AppContext.Provider>
    </StrictMode>,
  );
  await app.boot();
}

main().catch(showFatal);

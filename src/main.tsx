import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppController } from "./app/controller";
import { demoPlatform } from "./app/demo";
import { AppContext } from "./app/hooks";
import { isTauri, tauriPlatform } from "./app/platform";
import "./app/styles.css";

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

void main();

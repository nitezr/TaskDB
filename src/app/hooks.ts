import { createContext, useContext, useSyncExternalStore } from "react";
import type { AppController } from "./controller";

export const AppContext = createContext<AppController | null>(null);

/** Returns the controller and re-renders whenever its data changes. */
export function useApp(): AppController {
  const app = useContext(AppContext)!;
  useSyncExternalStore(
    (fn) => app.subscribe(fn),
    () => app.getVersion(),
  );
  return app;
}

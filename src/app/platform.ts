import type { FetchLike } from "../notion/client";
import type { Store } from "../store/store";

/** Everything that differs between the desktop app and the browser demo. */
export interface Platform {
  kind: "tauri" | "demo";
  fetch: FetchLike;
  openStore(): Promise<Store & { clear?(): Promise<void> }>;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  /** Global hotkey + tray "Quick add" both call this. */
  onQuickAdd(cb: () => void): Promise<void>;
  onFocusChange(cb: (focused: boolean) => void): void;
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const QUICK_ADD_HOTKEY = "CommandOrControl+Shift+Space";

export async function tauriPlatform(): Promise<Platform> {
  const [{ fetch }, { invoke }, notification, shortcut, { listen }, { getCurrentWindow }, { SqliteStore }] =
    await Promise.all([
      import("@tauri-apps/plugin-http"),
      import("@tauri-apps/api/core"),
      import("@tauri-apps/plugin-notification"),
      import("@tauri-apps/plugin-global-shortcut"),
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/window"),
      import("../store/sqliteStore"),
    ]);
  const win = getCurrentWindow();

  return {
    kind: "tauri",
    fetch: (url, init) => fetch(url, init),
    openStore: () => SqliteStore.open(),
    getToken: () => invoke<string | null>("get_token"),
    setToken: (token) => invoke("set_token", { token }),
    clearToken: () => invoke("clear_token"),
    async notify(title, body) {
      let granted = await notification.isPermissionGranted();
      if (!granted) granted = (await notification.requestPermission()) === "granted";
      if (granted) notification.sendNotification({ title, body });
    },
    async onQuickAdd(cb) {
      const open = async () => {
        await win.show();
        await win.unminimize();
        await win.setFocus();
        cb();
      };
      await listen("quick-add", open);
      try {
        await shortcut.unregister(QUICK_ADD_HOTKEY);
        await shortcut.register(QUICK_ADD_HOTKEY, (e) => {
          if (e.state === "Pressed") void open();
        });
      } catch (e) {
        console.warn("Global hotkey unavailable", e);
      }
    },
    onFocusChange(cb) {
      void win.onFocusChanged(({ payload }) => cb(payload));
    },
  };
}

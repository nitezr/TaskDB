/**
 * Remappable single-key actions, ported from Remit's ShortcutAction.
 * A binding is a combo string like "e", "shift+t", "?" or "meta+k".
 */

export type ActionId =
  | "nextTask"
  | "previousTask"
  | "commandPalette"
  | "shortcutsPanel"
  | "completeTask"
  | "openDetail"
  | "quickAdd"
  | "editLabels"
  | "priority1"
  | "priority2"
  | "priority3"
  | "priority4"
  | "scheduleToday"
  | "scheduleTomorrow"
  | "scheduleWeekend"
  | "scheduleNextWeek"
  | "scheduleClear";

export type ActionGroup = "Navigation" | "Tasks" | "Schedule";

export const ACTIONS: { id: ActionId; title: string; group: ActionGroup; defaults: string[] }[] = [
  { id: "nextTask", title: "Next task", group: "Navigation", defaults: ["j"] },
  { id: "previousTask", title: "Previous task", group: "Navigation", defaults: ["k"] },
  { id: "commandPalette", title: "Command palette / search", group: "Navigation", defaults: ["/"] },
  { id: "shortcutsPanel", title: "Keyboard shortcuts panel", group: "Navigation", defaults: ["?"] },
  { id: "completeTask", title: "Complete task", group: "Tasks", defaults: ["e"] },
  { id: "openDetail", title: "Open task detail", group: "Tasks", defaults: ["i"] },
  { id: "quickAdd", title: "Quick add", group: "Tasks", defaults: ["q", "a"] },
  { id: "editLabels", title: "Edit tags", group: "Tasks", defaults: ["l"] },
  { id: "priority1", title: "Priority 1", group: "Tasks", defaults: ["1"] },
  { id: "priority2", title: "Priority 2", group: "Tasks", defaults: ["2"] },
  { id: "priority3", title: "Priority 3", group: "Tasks", defaults: ["3"] },
  { id: "priority4", title: "Priority 4", group: "Tasks", defaults: ["4"] },
  { id: "scheduleToday", title: "Today", group: "Schedule", defaults: ["t"] },
  { id: "scheduleTomorrow", title: "Tomorrow", group: "Schedule", defaults: ["u", "m"] },
  { id: "scheduleWeekend", title: "This weekend", group: "Schedule", defaults: ["w"] },
  { id: "scheduleNextWeek", title: "Next week", group: "Schedule", defaults: ["n"] },
  { id: "scheduleClear", title: "Remove due date", group: "Schedule", defaults: ["0", "shift+t"] },
];

/** Structural keys that are documented but not remappable (as in Remit). */
export const FIXED_BINDINGS: { group: ActionGroup; keys: string; title: string }[] = [
  { group: "Navigation", keys: "↓ ↑", title: "Next / previous task" },
  { group: "Navigation", keys: "← →", title: "Move between board columns" },
  { group: "Navigation", keys: "⌘K", title: "Command palette" },
  { group: "Navigation", keys: "⌘\\", title: "Toggle sidebar" },
  { group: "Navigation", keys: "⌘[ ⌘]", title: "Back / forward" },
  { group: "Navigation", keys: "G then I / T / U / F", title: "Go to Inbox / Today / Upcoming / Filters & Tags" },
  { group: "Tasks", keys: "↩", title: "Open task detail" },
  { group: "Tasks", keys: "⌘⌫", title: "Delete task" },
  { group: "Tasks", keys: "⌘Z", title: "Undo last change" },
];

const isLetter = (k: string) => /^[a-z]$/i.test(k);

/** Canonical combo for a keyboard event, or null for bare modifier presses. */
export function comboFromEvent(e: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">): string | null {
  if (["Shift", "Meta", "Control", "Alt", "CapsLock"].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  // Shift is part of the character for symbols ("?" is shift+/), so it only counts for letters and named keys.
  if (e.shiftKey && (isLetter(key) || key.length > 1)) parts.push("shift");
  if (e.metaKey) parts.push("meta");
  parts.push(key);
  return parts.join("+");
}

export function bindingsFor(id: ActionId, overrides: Record<string, string[]>): string[] {
  return overrides[id] ?? ACTIONS.find((a) => a.id === id)!.defaults;
}

export function actionForCombo(combo: string, overrides: Record<string, string[]>): ActionId | null {
  for (const a of ACTIONS) if (bindingsFor(a.id, overrides).includes(combo)) return a.id;
  return null;
}

/** Other actions already using a combo, to warn before a remap steals it. */
export function conflicts(combo: string, except: ActionId, overrides: Record<string, string[]>): ActionId[] {
  return ACTIONS.filter((a) => a.id !== except && bindingsFor(a.id, overrides).includes(combo)).map((a) => a.id);
}

const GLYPH: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const NAMED: Record<string, string> = {
  Enter: "↩",
  Tab: "⇥",
  Backspace: "⌫",
  Escape: "esc",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowDown: "↓",
  ArrowUp: "↑",
  " ": "space",
};

export function displayCombo(combo: string): string {
  const parts = combo.split("+");
  // "+" itself would split into empty strings.
  const key = combo.endsWith("++") || combo === "+" ? "+" : parts[parts.length - 1]!;
  const mods = parts.slice(0, -1).filter((m) => m in GLYPH);
  return mods.map((m) => GLYPH[m]).join("") + (NAMED[key] ?? key.toUpperCase());
}

/**
 * Colour themes, in the spirit of Todoist's theme picker. Each one sets the accent and tints the
 * surfaces for light and dark mode; Light / Dark / System still decides which half applies.
 * "Classic" is the stylesheet's own palette and overrides nothing.
 */
type Surface = Partial<Record<"page" | "sidebar" | "card" | "column" | "line" | "text" | "muted" | "faint" | "chip" | "hover", string>>;

export interface Theme {
  id: string;
  name: string;
  accent: string;
  light: Surface;
  dark: Surface;
}

export const THEMES: Theme[] = [
  { id: "classic", name: "Classic", accent: "#dc4c3e", light: {}, dark: {} },
  {
    id: "graphite",
    name: "Graphite",
    accent: "#475569",
    light: { page: "#f8f9fa", sidebar: "#eff1f3", column: "#eceff2", line: "#e1e5ea" },
    dark: { page: "#1c1d20", sidebar: "#25272b", card: "#2a2c31", column: "#222428", line: "#35383e" },
  },
  {
    id: "moonstone",
    name: "Moonstone",
    accent: "#4a5d78",
    light: { page: "#f7f8fa", sidebar: "#edf0f4", column: "#e9edf2", line: "#dfe4ea" },
    dark: { page: "#1b1e23", sidebar: "#23272e", card: "#292e35", column: "#20242a", line: "#343a43" },
  },
  {
    id: "tangerine",
    name: "Tangerine",
    accent: "#e8912d",
    light: { page: "#fffaf5", sidebar: "#fdf0e4", column: "#fbece0", line: "#f1e0d2" },
    dark: { page: "#201c19", sidebar: "#2a241f", card: "#2f2924", column: "#26211d", line: "#3c342d" },
  },
  {
    id: "kale",
    name: "Kale",
    accent: "#4c7a45",
    light: { page: "#f8faf7", sidebar: "#ecf2ea", column: "#e8efe6", line: "#dde6da" },
    dark: { page: "#1a1e1b", sidebar: "#222924", card: "#28302a", column: "#202622", line: "#333c35" },
  },
  {
    id: "blueberry",
    name: "Blueberry",
    accent: "#297abc",
    light: { page: "#f8f9fd", sidebar: "#ecf0fa", column: "#e8edf8", line: "#dce3f2" },
    dark: { page: "#1a1c22", sidebar: "#21252f", card: "#272c38", column: "#1f232c", line: "#323949" },
  },
  {
    id: "lavender",
    name: "Lavender",
    accent: "#766bbd",
    light: { page: "#faf9fd", sidebar: "#f1edfa", column: "#ede8f8", line: "#e2dcf1" },
    dark: { page: "#1d1b22", sidebar: "#26222f", card: "#2c2836", column: "#231f2b", line: "#383245" },
  },
  {
    id: "raspberry",
    name: "Raspberry",
    accent: "#c5496c",
    light: { page: "#fdf9fa", sidebar: "#f9edf1", column: "#f6e8ed", line: "#eedce3" },
    dark: { page: "#211b1d", sidebar: "#2b2226", card: "#31272b", column: "#271f22", line: "#3f3237" },
  },
  {
    id: "sand",
    name: "Sand",
    accent: "#a8733f",
    light: { page: "#fbf8f2", sidebar: "#f2ece0", card: "#fffdf8", column: "#efe8da", line: "#e5dccb" },
    dark: { page: "#1f1c17", sidebar: "#29251e", card: "#2f2a22", column: "#25211b", line: "#3b352b" },
  },
  {
    id: "nord",
    name: "Nord",
    accent: "#5e81ac",
    light: { page: "#f4f6f9", sidebar: "#e5e9f0", card: "#fbfcfd", column: "#e5e9f0", line: "#d8dee9", text: "#2e3440", muted: "#6b7385" },
    dark: { page: "#2e3440", sidebar: "#3b4252", card: "#3b4252", column: "#343b48", line: "#4c566a", text: "#eceff4", muted: "#a3adbf", faint: "#6f7b91" },
  },
  {
    id: "solarized",
    name: "Solarized",
    accent: "#cb4b16",
    light: { page: "#fdf6e3", sidebar: "#eee8d5", card: "#fffbef", column: "#f3ecd8", line: "#e4dcc3", text: "#073642", muted: "#657b83" },
    dark: { page: "#002b36", sidebar: "#073642", card: "#0a3c49", column: "#05323e", line: "#1b4b57", text: "#eee8d5", muted: "#93a1a1", faint: "#586e75" },
  },
  {
    id: "midnight",
    name: "Midnight",
    accent: "#7c9cff",
    light: { page: "#f7f8fb", sidebar: "#eef0f6", column: "#eaedf5", line: "#dfe3ee" },
    // True black for OLED-style contrast.
    dark: { page: "#000000", sidebar: "#0c0c0e", card: "#141417", column: "#0a0a0c", line: "#26262b", hover: "rgba(255,255,255,0.07)" },
  },
];

export const themeById = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0]!;

const block = (s: Surface) =>
  Object.entries(s)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(" ");

/** One stylesheet for every theme, keyed on data-palette so switching needs no re-render. */
export function themeCss(): string {
  return THEMES.filter((t) => t.id !== "classic")
    .map((t) => {
      const sel = `:root[data-palette="${t.id}"]`;
      return [
        `${sel} { ${block(t.light)} }`,
        `@media (prefers-color-scheme: dark) { ${sel}:not([data-theme="light"]) { ${block(t.dark)} } }`,
        `${sel}[data-theme="dark"] { ${block(t.dark)} }`,
      ].join("\n");
    })
    .join("\n");
}

let injected = false;
export function injectThemes(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.id = "taskdb-themes";
  style.textContent = themeCss();
  document.head.append(style);
}

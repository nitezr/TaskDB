import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

// ---- Popover anchored to a point or element ----

export interface Anchor {
  x: number;
  y: number;
}

export function anchorOf(el: Element, align: "left" | "right" = "left"): Anchor {
  const r = el.getBoundingClientRect();
  return { x: align === "right" ? r.right : r.left, y: r.bottom + 4 };
}

export function Popover({
  anchor,
  onClose,
  children,
  className = "",
  align = "left",
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });

  // Keep the popover on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = align === "right" ? anchor.x - w : anchor.x;
    let top = anchor.y;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.y - h - 8);
    setPos({ left, top });
  }, [anchor.x, anchor.y, align]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Defer so the click that opened the popover doesn't close it.
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    window.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={`popover ${className}`} style={pos} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

// ---- Menus ----

export type MenuEntry =
  | { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { separator: true }
  | { heading: string };

export function Menu({ items, anchor, onClose }: { items: MenuEntry[]; anchor: Anchor; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      {items.map((it, i) =>
        "separator" in it ? (
          <div key={i} className="menu-sep" />
        ) : "heading" in it ? (
          <div key={i} className="menu-label">
            {it.heading}
          </div>
        ) : (
          <button
            key={i}
            className={`menu-item ${it.danger ? "danger-item" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.icon && <span style={{ width: 16, textAlign: "center" }}>{it.icon}</span>}
            <span className="grow">{it.label}</span>
            {it.hint && <span className="muted small">{it.hint}</span>}
          </button>
        ),
      )}
    </Popover>
  );
}

/** Right-click / "⋯" menu state helper. */
export function useMenu() {
  const [menu, setMenu] = useState<{ anchor: Anchor; items: MenuEntry[] } | null>(null);
  return {
    open: (anchor: Anchor, items: MenuEntry[]) => setMenu({ anchor, items }),
    element: menu ? <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} /> : null,
  };
}

// ---- Drag and drop (HTML5, task ids only) ----

const TASK_MIME = "application/x-taskdb-task";
let draggingId: string | null = null;

export function dragProps(taskId: string, onStart?: () => void) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      draggingId = taskId;
      e.dataTransfer.setData(TASK_MIME, taskId);
      e.dataTransfer.setData("text/plain", taskId);
      e.dataTransfer.effectAllowed = "move";
      onStart?.();
    },
    onDragEnd: () => {
      draggingId = null;
      document.querySelectorAll(".drop-target, .drop-before").forEach((el) => el.classList.remove("drop-target", "drop-before"));
    },
  };
}

/** Handlers for an element that accepts dropped tasks. */
export function dropProps(onDrop: (taskId: string) => void, cls = "drop-target") {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!draggingId) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      (e.currentTarget as HTMLElement).classList.add(cls);
    },
    onDragLeave: (e: React.DragEvent) => {
      (e.currentTarget as HTMLElement).classList.remove(cls);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).classList.remove(cls);
      const id = e.dataTransfer.getData(TASK_MIME) || draggingId;
      draggingId = null;
      if (id) onDrop(id);
    },
  };
}

// ---- Completion sound (Remit plays one when a task is completed) ----

let audio: AudioContext | null = null;
export function playCompleteSound() {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.07;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  } catch {
    // Sound is a nicety; never let it break completing a task.
  }
}

export const PROJECT_EMOJI = [
  "🚀", "⭐", "🏠", "💼", "💰", "📚", "🌱", "🎯", "🛠️", "🎨",
  "🧠", "💡", "📈", "📅", "✈️", "🏋️", "🍳", "🎵", "🎮", "🧾",
  "❤️", "🔥", "⚡", "🌍", "🐶", "👶", "🎓", "🏥", "🛒", "🧹",
  "📦", "📝", "💻", "📱", "🔧", "🧪", "📣", "🤝", "🗂️", "🏆",
];

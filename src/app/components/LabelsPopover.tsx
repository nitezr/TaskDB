import { useState } from "react";
import { useApp } from "../hooks";
import { type Anchor, Popover } from "../ui";

/** L: toggle tags on the selected task without opening its details. */
export function LabelsPopover({ taskId, anchor, onClose }: { taskId: string; anchor: Anchor; onClose: () => void }) {
  const app = useApp();
  const task = app.task(taskId);
  const [q, setQ] = useState("");
  const [hot, setHot] = useState(0);
  if (!task) return null;
  const all = [...new Set([...app.labels(), ...task.labels])];
  const shown = all.filter((l) => l.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim() && !all.some((l) => l.toLowerCase() === q.trim().toLowerCase());
  const toggle = (l: string) =>
    app.updateTask(taskId, { labels: task.labels.includes(l) ? task.labels.filter((x) => x !== l) : [...task.labels, l] });

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="popover-title">Labels for {task.title}</div>
      <input
        autoFocus
        placeholder="Type a label"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setHot(0);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") setHot((h) => Math.min(shown.length - 1, h + 1));
          if (e.key === "ArrowUp") setHot((h) => Math.max(0, h - 1));
          if (e.key === "Enter") {
            if (canCreate && !shown.length) {
              toggle(q.trim().replace(/^[@#]/, ""));
              setQ("");
            } else if (shown[hot]) toggle(shown[hot]!);
          }
        }}
        style={{ width: "100%", marginBottom: 4 }}
      />
      {!all.length && !q.trim() && <div className="muted small" style={{ padding: "4px 8px" }}>No labels yet. Type below to add one.</div>}
      <div className="labels-list">
      {shown.map((l, i) => (
        <button key={l} className={`menu-item ${i === hot ? "hot" : ""}`} onClick={() => toggle(l)}>
          <span style={{ width: 16 }}>{task.labels.includes(l) ? "✓" : ""}</span>
          <span className="hash tag-hash">@</span> {l}
        </button>
      ))}
      </div>
      {canCreate && (
        <button
          className="menu-item"
          onClick={() => {
            toggle(q.trim().replace(/^[@#]/, ""));
            setQ("");
          }}
        >
          Add @{q.trim().replace(/^[@#]/, "")}
        </button>
      )}
    </Popover>
  );
}

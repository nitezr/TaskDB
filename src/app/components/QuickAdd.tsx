import { useEffect, useMemo, useRef, useState } from "react";
import { dueLabel } from "../../core/dates";
import { parseQuickAdd } from "../../core/quickAdd";
import type { TaskFields } from "../../types";
import { useApp } from "../hooks";

interface Props {
  defaults?: Partial<TaskFields>;
  onDone: () => void;
  /** Modal keeps the form open after adding for rapid entry. */
  variant: "modal" | "inline";
}

export function QuickAdd({ defaults = {}, onDone, variant }: Props) {
  const app = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const parsed = useMemo(
    () => parseQuickAdd(text, { projects: app.projects.map((p) => p.name), people: app.people() }),
    [text, app],
  );
  const known = parsed.project && app.projects.some((p) => p.name.toLowerCase() === parsed.project!.toLowerCase());

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    await app.quickAdd(text, defaults);
    setBusy(false);
    setText("");
    if (variant === "inline") ref.current?.focus();
  };

  const chips: { label: string; kind: string }[] = [];
  const due = parsed.due ?? defaults.due ?? null;
  if (due) chips.push({ label: `📅 ${dueLabel(due)}`, kind: "date" });
  if (parsed.recurrence) chips.push({ label: `🔁 ${parsed.recurrence}`, kind: "recurrence" });
  const projectName = parsed.project ?? app.projectName(defaults.projectId ?? null);
  if (projectName) chips.push({ label: `# ${projectName}${parsed.project && !known ? " (new)" : ""}`, kind: "project" });
  for (const l of [...(defaults.labels ?? []), ...parsed.labels]) chips.push({ label: `@${l}`, kind: "label" });
  const person = parsed.person ?? defaults.person;
  if (person) chips.push({ label: `👤 ${person}`, kind: "person" });
  if (parsed.priority !== 4) chips.push({ label: `p${parsed.priority}`, kind: `p${parsed.priority}` });

  const form = (
    <div className={`quick-add ${variant}`}>
      <input
        ref={ref}
        value={text}
        placeholder="e.g. Call Ravi tomorrow 5pm #Sales +Ravi @urgent p1"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") onDone();
          e.stopPropagation();
        }}
      />
      <div className="chips">
        {chips.map((c, i) => (
          <span key={i} className={`chip chip-${c.kind}`}>
            {c.label}
          </span>
        ))}
        {!chips.length && <span className="hint">Dates, #project, @label, +person, p1–p4, every …</span>}
      </div>
      <div className="quick-add-actions">
        <button className="ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="primary" disabled={!parsed.title || busy} onClick={() => void submit()}>
          Add task
        </button>
      </div>
    </div>
  );

  if (variant === "inline") return form;
  return (
    <div className="overlay" onMouseDown={onDone}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {form}
      </div>
    </div>
  );
}

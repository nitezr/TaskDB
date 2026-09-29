import { useEffect, useMemo, useRef, useState } from "react";
import { dueLabel } from "../../core/dates";
import { parseQuickAdd } from "../../core/quickAdd";
import type { TaskFields } from "../../types";
import { useApp } from "../hooks";

interface Props {
  defaults?: Partial<TaskFields>;
  onDone: () => void;
  /** Modal stays open after adding for rapid entry; inline sits in the list. */
  variant: "modal" | "inline";
  onAdded?: (id: string) => void;
}

interface Suggestion {
  trigger: "#" | "@" | "+";
  query: string;
  start: number;
  options: string[];
}

/** Finds the #, @ or + token under the caret and what could complete it. */
function suggestionAt(text: string, caret: number, sources: Record<"#" | "@" | "+", string[]>): Suggestion | null {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|\s)([#@+])([^\s#@+]*)$/);
  if (!m) return null;
  const trigger = m[1] as "#" | "@" | "+";
  const query = m[2]!;
  // Leading emoji and punctuation are skipped so "🤝 Acme" is found by "ac".
  const norm = (s: string) => s.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, "").replace(/[\s_-]+/g, "");
  const q = norm(query);
  // Prefix matches first, then anywhere; no hard cap (a cap hid most of a long project list).
  const rank = (o: string) => (norm(o).startsWith(q) ? 0 : norm(o).includes(q) ? 1 : 2);
  const options = sources[trigger]
    .filter((o) => rank(o) < 2)
    .sort((a, b) => rank(a) - rank(b));
  return { trigger, query, start: caret - query.length - 1, options };
}

export function QuickAdd({ defaults = {}, onDone, variant, onAdded }: Props) {
  const app = useApp();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [caret, setCaret] = useState(0);
  const [hot, setHot] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const projectNames = app.projects.filter((p) => !p.archived).map((p) => p.name);
  const parsed = useMemo(
    () => parseQuickAdd(text, { projects: projectNames, people: app.people(), labels: app.labels() }),
    [text, app, projectNames.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const suggestion = useMemo(
    () => suggestionAt(text, caret, { "#": projectNames, "@": app.labels(), "+": app.people() }),
    [text, caret, app, projectNames.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const showSuggest = suggestion && suggestion.options.length > 0;
  useEffect(() => setHot(0), [suggestion?.query, suggestion?.trigger]);
  useEffect(() => {
    document.querySelector(".suggest .menu-item.hot")?.scrollIntoView({ block: "nearest" });
  }, [hot]);

  const complete = (option: string) => {
    if (!suggestion) return;
    // Spaces aren't allowed inside tokens; the parser matches underscores back to the real name.
    const token = `${suggestion.trigger}${option.replace(/\s+/g, "_")} `;
    const next = text.slice(0, suggestion.start) + token + text.slice(caret);
    setText(next);
    const pos = suggestion.start + token.length;
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    const task = await app.quickAdd(text, { ...defaults, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    setBusy(false);
    setText("");
    setNotes("");
    if (task) onAdded?.(task.id);
    ref.current?.focus();
  };

  const chips: { label: string; kind: string }[] = [];
  const due = parsed.due ?? defaults.due ?? null;
  if (due) chips.push({ label: `📅 ${dueLabel(due)}`, kind: "date" });
  if (parsed.recurrence) chips.push({ label: `🔁 ${parsed.recurrence}`, kind: "recurrence" });
  const projectName = parsed.project ?? app.projectName(defaults.projectId ?? null);
  const known = parsed.project && projectNames.some((p) => p.toLowerCase() === parsed.project!.toLowerCase());
  if (projectName) chips.push({ label: `# ${projectName}${parsed.project && !known ? " (new)" : ""}`, kind: "project" });
  if (defaults.section) chips.push({ label: `▤ ${defaults.section}`, kind: "section" });
  for (const l of [...(defaults.labels ?? []), ...parsed.labels]) chips.push({ label: `⌗ ${l}`, kind: "label" });
  const person = parsed.person ?? defaults.person;
  if (person) chips.push({ label: `👤 ${person}`, kind: "person" });
  if (parsed.priority !== 4) chips.push({ label: `P${parsed.priority}`, kind: `p${parsed.priority}` });

  const form = (
    <div className={`quick-add ${variant}`} onKeyDown={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        className="qa-input"
        value={text}
        placeholder="Task name — try “Call Priya tomorrow 5pm p1 #Work @waiting”"
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (showSuggest) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = suggestion!.options.length;
              setHot((h) => (h + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
              return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
              e.preventDefault();
              complete(suggestion!.options[hot]!);
              return;
            }
          }
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") onDone();
        }}
      />
      {showSuggest && (
        <div className="suggest">
          {suggestion!.options.map((o, i) => (
            <button
              key={o}
              className={`menu-item ${i === hot ? "hot" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                complete(o);
              }}
            >
              {suggestion!.trigger === "#" ? (
                <span className={`dot c-${app.projects.find((p) => p.name === o)?.color ?? "gray"}`} />
              ) : suggestion!.trigger === "@" ? (
                <span className="dot" style={{ background: "#6b7280" }} />
              ) : (
                <span className="suggest-person">👤</span>
              )}
              {o}
            </button>
          ))}
          <div className="hint">⇥ to complete</div>
        </div>
      )}
      <input
        className="qa-notes"
        value={notes}
        placeholder="Description"
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="chips">
        {chips.map((c, i) => (
          <span key={i} className={`chip chip-${c.kind}`}>
            {c.label}
          </span>
        ))}
        {!chips.length && <span className="hint">Dates, p1–p4, #project, @tag, +person, every …</span>}
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

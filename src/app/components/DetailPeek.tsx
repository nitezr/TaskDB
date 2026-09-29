import { useEffect, useState } from "react";
import { deadlineLabel, dueLabel, formatDuration, hasTime, parseDue, toDateStr, toLocalIso } from "../../core/dates";
import { parseQuickAdd } from "../../core/quickAdd";
import { parseRule } from "../../core/recurrence";
import type { Priority } from "../../types";
import { askConfirm } from "../confirm";
import { useApp } from "../hooks";
import { CalendarSmallIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, FlagIcon, HashIcon, TrashIcon } from "../icons";
import { type Anchor, anchorOf } from "../ui";
import { DatePicker } from "./DatePicker";

const short = (d: string) => parseDue(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
import { QuickAdd } from "./QuickAdd";

const REPEATS: [string, string][] = [
  ["", "No repeat"],
  ["every day", "Every day"],
  ["every weekday", "Every weekday"],
  ["every week", "Every week"],
  ["every 2 weeks", "Every 2 weeks"],
  ["every month", "Every month"],
  ["every year", "Every year"],
];

interface Props {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  /** Previous / next task in the current view, for stepping without closing. */
  prevId: string | null;
  nextId: string | null;
  onComplete: (id: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function DetailPeek({ id, onClose, onOpen, prevId, nextId, onComplete }: Props) {
  const app = useApp();
  const task = app.task(id);
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [tagQuery, setTagQuery] = useState("");
  const [customRepeat, setCustomRepeat] = useState<string | null>(null);
  const [addingSub, setAddingSub] = useState(false);
  const [picker, setPicker] = useState<{ kind: "due" | "deadline"; anchor: Anchor } | null>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setCustomRepeat(null);
    setTagQuery("");
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select");
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (typing) (typing as HTMLElement).blur();
        else onClose();
        return;
      }
      if (typing) return;
      if ((e.key === "ArrowUp" || e.key === "k") && prevId) {
        e.preventDefault();
        e.stopPropagation();
        onOpen(prevId);
      }
      if ((e.key === "ArrowDown" || e.key === "j") && nextId) {
        e.preventDefault();
        e.stopPropagation();
        onOpen(nextId);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [prevId, nextId, onClose, onOpen]);

  if (!task) return null;
  const update = (f: Parameters<typeof app.updateTask>[1]) => app.updateTask(id, f);
  const project = app.project(task.projectId);
  const subs = app.tasks().filter((t) => t.parentId === id).sort((a, b) => a.order - b.order);
  const parent = task.parentId ? app.task(task.parentId) : undefined;
  const sections = task.projectId ? app.sections(task.projectId) : [];
  const timed = task.due ? hasTime(task.due) : false;
  const repeatKnown = REPEATS.some(([v]) => v === (task.recurrence ?? ""));
  const allTags = [...new Set([...app.labels(), ...task.labels])];
  const shownTags = allTags.filter((l) => l.toLowerCase().includes(tagQuery.toLowerCase()));

  const addTag = (raw: string) => {
    const v = raw.trim().replace(/^[@#]/, "");
    if (v && !task.labels.includes(v)) update({ labels: [...task.labels, v] });
    setTagQuery("");
  };

  return (
    <div
      className="overlay"
      onMouseDown={() => {
        // Blurring first runs the title/notes onBlur saves, so a click outside never loses an edit.
        (document.activeElement as HTMLElement | null)?.blur();
        onClose();
      }}
    >
      <div className="modal peek" onMouseDown={(e) => e.stopPropagation()}>
        <div className="peek-bar">
          {parent ? (
            <button className="link" onClick={() => onOpen(parent.id)}>
              ↑ {parent.title}
            </button>
          ) : (
            <span className="crumb">
              {project?.emoji ? <span>{project.emoji}</span> : <HashIcon size={11} />} {project ? project.name : "Inbox"}
              {task.section ? ` / ${task.section}` : ""}
            </span>
          )}
          <span className="grow" />
          <button className="icon-btn" disabled={!prevId} onClick={() => prevId && onOpen(prevId)} aria-label="Previous task" title="Previous (↑)">
            <ChevronUpIcon />
          </button>
          <button className="icon-btn" disabled={!nextId} onClick={() => nextId && onOpen(nextId)} aria-label="Next task" title="Next (↓)">
            <ChevronDownIcon />
          </button>
          <button
            className="icon-btn trash"
            aria-label="Delete task"
            title="Delete (⌘⌫)"
            onClick={() =>
              void askConfirm("Delete this task?", "Delete Task", {
                detail: `“${task.title}”${subs.length ? ` and its ${subs.length} sub-task(s)` : ""} will also be removed from Notion. ⌘Z undoes it.`,
              }).then((ok) => {
                if (!ok) return;
                const next = nextId ?? prevId;
                app.deleteTask(id);
                next ? onOpen(next) : onClose();
              })
            }
          >
            <TrashIcon />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {task.syncError && (
          <div className="banner error" style={{ margin: "8px 14px 0" }}>
            Notion rejected the last change: {task.syncError}{" "}
            <button className="link" onClick={() => app.retrySync(id)}>
              Retry
            </button>
          </div>
        )}

        <div className="peek-body">
          <div className="peek-main">
            <div className="peek-title">
              <button className={`check p${task.priority} ${task.done ? "done" : ""}`} onClick={() => onComplete(id)} aria-label="Complete task">
                <span>✓</span>
              </button>
              <textarea
                value={title}
                rows={1}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== task.title && update({ title: title.trim() })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
              />
            </div>
            <textarea
              className="peek-notes"
              placeholder="Description"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (task.notes ?? "") && update({ notes: notes.trim() || null })}
            />

            {!task.parentId && (
              <div className="subtasks">
                <h4>
                  Sub-tasks{" "}
                  {subs.length > 0 && (
                    <span className="muted">
                      {subs.filter((s) => s.done).length}/{subs.length}
                    </span>
                  )}
                </h4>
                <ul>
                  {subs.map((s) => (
                    <li key={s.id}>
                      <button className={`check p${s.priority} ${s.done ? "done" : ""}`} onClick={() => onComplete(s.id)}>
                        <span>✓</span>
                      </button>
                      <button className={`grow ${s.done ? "strike" : ""}`} style={{ textAlign: "left" }} onClick={() => onOpen(s.id)}>
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
                {addingSub ? (
                  <QuickAdd
                    variant="inline"
                    defaults={{ parentId: id, projectId: task.projectId, section: task.section }}
                    onDone={() => setAddingSub(false)}
                  />
                ) : (
                  <button className="add-inline" onClick={() => setAddingSub(true)}>
                    <span className="plus">+</span> Add sub-task
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="peek-side">
            <div className="prop">
              <h5>Project</h5>
              <select value={task.projectId ?? ""} onChange={(e) => update({ projectId: e.target.value || null, section: null })}>
                <option value="">📥 Inbox</option>
                {app.projectTree().map(({ project: p, depth }) => (
                  <option key={p.id} value={p.id}>
                    {"  ".repeat(depth)}
                    {p.emoji ?? "#"} {p.name}
                  </option>
                ))}
              </select>
            </div>

            {task.projectId && (
              <div className="prop">
                <h5>Section</h5>
                <select value={task.section ?? ""} onChange={(e) => update({ section: e.target.value || null })}>
                  <option value="">(No section)</option>
                  {sections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="prop">
              <h5>Date</h5>
              <button className={`date-btn ${task.due ? "" : "empty"}`} onClick={(e) => setPicker({ kind: "due", anchor: anchorOf(e.currentTarget) })}>
                <CalendarSmallIcon size={12} />
                {task.due ? dueLabel(task.due) : "Add date"}
                {task.duration ? <span className="muted"> · {formatDuration(task.duration)}</span> : null}
              </button>
            </div>

            <div className="prop">
              <h5>Deadline</h5>
              <button
                className={`date-btn ${task.deadline ? `deadline ${deadlineLabel(task.deadline).tone}` : "empty"}`}
                onClick={(e) => setPicker({ kind: "deadline", anchor: anchorOf(e.currentTarget) })}
              >
                <FlagIcon size={11} />
                {task.deadline ? `${short(task.deadline)} · ${deadlineLabel(task.deadline).text}` : "Add deadline"}
              </button>
            </div>
            {picker && (
              <DatePicker
                anchor={picker.anchor}
                mode={picker.kind}
                value={picker.kind === "due" ? task.due : task.deadline}
                duration={task.duration}
                onDuration={picker.kind === "due" ? (m) => update({ duration: m }) : undefined}
                onChange={(v) => update(picker.kind === "due" ? { due: v } : { deadline: v })}
                onClose={() => setPicker(null)}
              />
            )}

            <div className="prop">
              <h5>Repeat</h5>
              <select
                value={customRepeat !== null || !repeatKnown ? "custom" : (task.recurrence ?? "")}
                onChange={(e) => {
                  if (e.target.value === "custom") return setCustomRepeat(task.recurrence ?? "");
                  setCustomRepeat(null);
                  update({ recurrence: e.target.value || null, ...(e.target.value && !task.due ? { due: toDateStr(new Date()) } : {}) });
                }}
              >
                {REPEATS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="custom">{!repeatKnown && task.recurrence ? task.recurrence : "Custom…"}</option>
              </select>
              {customRepeat !== null && (
                <input
                  autoFocus
                  className={customRepeat && !parseRule(customRepeat) ? "invalid" : ""}
                  placeholder="every mon,thu · every 3 days"
                  value={customRepeat}
                  onChange={(e) => setCustomRepeat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && parseRule(customRepeat)) {
                      update({ recurrence: customRepeat.trim() });
                      setCustomRepeat(null);
                    }
                  }}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>

            <div className="prop">
              <h5>Priority</h5>
              <div className="segmented prio-seg">
                {([1, 2, 3, 4] as Priority[]).map((p) => (
                  <button key={p} className={`p${p} ${task.priority === p ? "on" : ""}`} onClick={() => update({ priority: p })}>
                    <FlagIcon size={10} />P{p}
                  </button>
                ))}
              </div>
            </div>

            <div className="prop">
              <h5>Tags</h5>
              <input
                placeholder="Search or add tags"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && tagQuery.trim() && addTag(tagQuery)}
              />
              <div className="tag-pool">
                {shownTags.map((l) => {
                  const on = task.labels.includes(l);
                  return (
                    <button
                      key={l}
                      className={on ? "on" : ""}
                      onClick={() => update({ labels: on ? task.labels.filter((x) => x !== l) : [...task.labels, l] })}
                    >
                      <span className="hash">#</span>
                      {l}
                    </button>
                  );
                })}
                {tagQuery.trim() && !allTags.some((t) => t.toLowerCase() === tagQuery.trim().replace(/^[@#]/, "").toLowerCase()) && (
                  <button className="add-tag" onClick={() => addTag(tagQuery)}>
                    Add #{tagQuery.trim().replace(/^[@#]/, "")}
                  </button>
                )}
              </div>
            </div>

            <div className="prop">
              <h5>Person</h5>
              <input
                list="people-list"
                defaultValue={task.person ?? ""}
                key={`person-${id}-${task.person}`}
                placeholder="Nobody"
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== task.person) update({ person: v });
                }}
              />
              <datalist id="people-list">
                {app.people().map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div className="prop">
              <h5>Reminder</h5>
              <input
                type="datetime-local"
                value={task.reminder ? toInputValue(task.reminder) : ""}
                onChange={(e) => update({ reminder: e.target.value ? toLocalIso(new Date(e.target.value)) : null })}
              />
              {!task.reminder && timed && <div className="small muted" style={{ marginTop: 4 }}>Reminds at the due time</div>}
            </div>

            <div className="prop small muted">
              {task.notionId ? (
                <button className="link" onClick={() => void app.platform.openUrl(`https://www.notion.so/${task.notionId!.replace(/-/g, "")}`)}>
                  Open in Notion ↗
                </button>
              ) : task.syncError ? (
                "Not synced"
              ) : (
                "Syncing…"
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toInputValue(iso: string): string {
  const d = parseDue(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

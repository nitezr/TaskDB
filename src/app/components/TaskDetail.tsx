import { useEffect, useState } from "react";
import { dueLabel, hasTime, parseDue, toLocalIso } from "../../core/dates";
import { parseQuickAdd } from "../../core/quickAdd";
import { parseRule } from "../../core/recurrence";
import type { Priority } from "../../types";
import { useApp } from "../hooks";
import { QuickAdd } from "./QuickAdd";

interface Props {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}

export function TaskDetail({ id, onClose, onOpen }: Props) {
  const app = useApp();
  const task = app.task(id);
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueText, setDueText] = useState("");
  const [recurText, setRecurText] = useState(task?.recurrence ?? "");
  const [labelText, setLabelText] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setRecurText(task?.recurrence ?? "");
    setDueText("");
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;
  const update = (f: Parameters<typeof app.updateTask>[1]) => app.updateTask(id, f);
  const subs = app.tasks().filter((t) => t.parentId === id).sort((a, b) => a.order - b.order);
  const parent = task.parentId ? app.task(task.parentId) : undefined;
  const recurValid = !recurText.trim() || parseRule(recurText) !== null;

  const commitDue = () => {
    const text = dueText.trim();
    if (!text) return;
    if (/^(none|no date|clear)$/i.test(text)) update({ due: null, recurrence: null });
    else {
      const r = parseQuickAdd(`x ${text}`);
      if (r.due) update({ due: r.due, ...(r.recurrence ? { recurrence: r.recurrence } : {}) });
      if (r.recurrence) setRecurText(r.recurrence);
    }
    setDueText("");
  };

  return (
    <aside className="detail" onKeyDown={(e) => e.stopPropagation()}>
      <header>
        {parent ? (
          <button className="link" onClick={() => onOpen(parent.id)}>
            ↑ {parent.title}
          </button>
        ) : (
          <span className="muted">{app.projectName(task.projectId) ?? "Inbox"}</span>
        )}
        <button className="ghost icon" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      {task.syncError && (
        <div className="banner error">
          Notion rejected the last change: {task.syncError}
          <button className="link" onClick={() => app.retrySync(id)}>
            Retry
          </button>
        </div>
      )}

      <div className="detail-title">
        <button
          className={`check p${task.priority} ${task.done ? "done" : ""}`}
          onClick={() => (task.done ? app.reopen(id) : app.complete(id))}
          aria-label="Complete task"
        >
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

      <dl className="fields">
        <dt>Due</dt>
        <dd>
          <input
            placeholder={task.due ? dueLabel(task.due) : "Type a date: tomorrow 5pm, fri, oct 5…"}
            value={dueText}
            onChange={(e) => setDueText(e.target.value)}
            onBlur={commitDue}
            onKeyDown={(e) => e.key === "Enter" && commitDue()}
          />
          {task.due && (
            <button className="link" onClick={() => update({ due: null })}>
              Clear
            </button>
          )}
        </dd>

        <dt>Repeat</dt>
        <dd>
          <input
            className={recurValid ? "" : "invalid"}
            placeholder="every week, every mon,thu, every 3 days…"
            value={recurText}
            onChange={(e) => setRecurText(e.target.value)}
            onBlur={() => {
              const rule = recurText.trim();
              if (rule === (task.recurrence ?? "") || !recurValid) return;
              update({ recurrence: rule || null });
            }}
          />
        </dd>

        <dt>Priority</dt>
        <dd className="prio-picker">
          {([1, 2, 3, 4] as Priority[]).map((p) => (
            <button key={p} className={`prio p${p} ${task.priority === p ? "on" : ""}`} onClick={() => update({ priority: p })}>
              P{p}
            </button>
          ))}
        </dd>

        <dt>Project</dt>
        <dd>
          <select value={task.projectId ?? ""} onChange={(e) => update({ projectId: e.target.value || null })}>
            <option value="">Inbox</option>
            {app.projects
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </dd>

        <dt>Person</dt>
        <dd>
          <input
            list="people"
            defaultValue={task.person ?? ""}
            key={`person-${id}-${task.person}`}
            placeholder="Nobody"
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== task.person) update({ person: v });
            }}
          />
          <datalist id="people">
            {app.people().map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </dd>

        <dt>Labels</dt>
        <dd className="labels-edit">
          {task.labels.map((l) => (
            <span key={l} className="chip chip-label">
              @{l}
              <button onClick={() => update({ labels: task.labels.filter((x) => x !== l) })} aria-label={`Remove ${l}`}>
                ×
              </button>
            </span>
          ))}
          <input
            list="labels"
            placeholder="Add label"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            onKeyDown={(e) => {
              const v = labelText.trim().replace(/^@/, "");
              if (e.key === "Enter" && v) {
                if (!task.labels.includes(v)) update({ labels: [...task.labels, v] });
                setLabelText("");
              }
            }}
          />
          <datalist id="labels">
            {app.labels().map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </dd>

        <dt>Reminder</dt>
        <dd>
          <input
            type="datetime-local"
            value={task.reminder ? toInputValue(task.reminder) : ""}
            onChange={(e) => update({ reminder: e.target.value ? toLocalIso(new Date(e.target.value)) : null })}
          />
          {!task.reminder && task.due && hasTime(task.due) && <span className="muted small">At due time</span>}
        </dd>
      </dl>

      {!task.parentId && (
        <div className="subtasks">
          <h4>Sub-tasks {subs.length > 0 && <span className="muted">{subs.filter((s) => s.done).length}/{subs.length}</span>}</h4>
          <ul>
            {subs.map((s) => (
              <li key={s.id} onClick={() => onOpen(s.id)}>
                <button
                  className={`check p${s.priority} ${s.done ? "done" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    s.done ? app.reopen(s.id) : app.complete(s.id);
                  }}
                >
                  <span>✓</span>
                </button>
                <span className={s.done ? "strike" : ""}>{s.title}</span>
              </li>
            ))}
          </ul>
          {addingSub ? (
            <QuickAdd
              variant="inline"
              defaults={{ parentId: id, projectId: task.projectId }}
              onDone={() => setAddingSub(false)}
            />
          ) : (
            <button className="add-inline" onClick={() => setAddingSub(true)}>
              <span className="plus">+</span> Add sub-task
            </button>
          )}
        </div>
      )}

      <footer>
        {task.notionId ? (
          <button className="link small" onClick={() => void app.platform.openUrl(notionUrl(task.notionId!))}>
            Open in Notion ↗
          </button>
        ) : (
          <span className="muted small">{task.syncError ? "Not synced" : "Syncing…"}</span>
        )}
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete "${task.title}"${subs.length ? ` and ${subs.length} sub-task(s)` : ""}?`)) {
              app.deleteTask(id);
              onClose();
            }
          }}
        >
          Delete
        </button>
      </footer>
    </aside>
  );
}

function toInputValue(iso: string): string {
  const d = parseDue(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

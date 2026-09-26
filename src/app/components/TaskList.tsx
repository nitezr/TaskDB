import { useState } from "react";
import { dueDay, dueLabel, toDateStr } from "../../core/dates";
import type { Task } from "../../types";
import { useApp } from "../hooks";
import type { TaskNode, ViewModel } from "../views";
import { QuickAdd } from "./QuickAdd";

interface Props {
  vm: ViewModel;
  selected: string | null;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  showProject: boolean;
}

export function TaskList({ vm, selected, collapsed, onSelect, onOpen, onToggleCollapse, showProject }: Props) {
  const [adding, setAdding] = useState<number | null>(null);
  const empty = vm.sections.every((s) => s.nodes.length === 0);

  return (
    <div className="task-list">
      {vm.error && <div className="banner error">{vm.error}</div>}
      {vm.sections.map((section, i) => {
        // Upcoming shows many empty days; only the first few keep an add button when empty.
        if (!section.nodes.length && section.title && vm.title === "Upcoming" && i > 7) return null;
        return (
          <section key={i} className="section">
            {section.title && <h3 className={section.tone === "overdue" ? "overdue" : ""}>{section.title}</h3>}
            <ul>
              {section.nodes.map((n) => (
                <Row
                  key={n.task.id}
                  node={n}
                  depth={0}
                  {...{ selected, collapsed, onSelect, onOpen, onToggleCollapse, showProject }}
                />
              ))}
            </ul>
            {!section.noAdd &&
              (adding === i ? (
                <QuickAdd variant="inline" defaults={{ ...vm.addDefaults, ...section.addDefaults }} onDone={() => setAdding(null)} />
              ) : (
                <button className="add-inline" onClick={() => setAdding(i)}>
                  <span className="plus">+</span> Add task
                </button>
              ))}
          </section>
        );
      })}
      {empty && !vm.error && vm.title !== "Upcoming" && <EmptyState title={vm.title} />}
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty">
      <div className="empty-mark">✓</div>
      <p>{title === "Today" ? "You're all done for today. Enjoy the rest of your day!" : "Nothing here yet."}</p>
      <p className="hint">
        Press <kbd>Q</kbd> to add a task.
      </p>
    </div>
  );
}

interface RowProps extends Omit<Props, "vm"> {
  node: TaskNode;
  depth: number;
}

function Row({ node, depth, selected, collapsed, onSelect, onOpen, onToggleCollapse, showProject }: RowProps) {
  const { task, children } = node;
  const isCollapsed = collapsed.has(task.id);
  return (
    <>
      <li
        className={`task ${selected === task.id ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 28 }}
        onClick={() => {
          onSelect(task.id);
          onOpen(task.id);
        }}
        data-id={task.id}
      >
        {children.length > 0 ? (
          <button
            className={`collapse ${isCollapsed ? "closed" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(task.id);
            }}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            ▾
          </button>
        ) : (
          <span className="collapse-spacer" />
        )}
        <TaskRow task={task} showProject={showProject} subCount={children.length} />
      </li>
      {!isCollapsed &&
        children.map((c) => (
          <Row
            key={c.task.id}
            node={c}
            depth={depth + 1}
            {...{ selected, collapsed, onSelect, onOpen, onToggleCollapse, showProject }}
          />
        ))}
    </>
  );
}

function TaskRow({ task, showProject, subCount }: { task: Task; showProject: boolean; subCount: number }) {
  const app = useApp();
  const today = toDateStr(new Date());
  const dueClass = task.due ? (dueDay(task.due) < today ? "overdue" : dueDay(task.due) === today ? "today" : "") : "";
  const project = showProject ? app.projects.find((p) => p.id === task.projectId) : undefined;
  const subs = subCount ? app.tasks().filter((t) => t.parentId === task.id) : [];

  return (
    <>
      <button
        className={`check p${task.priority} ${task.done ? "done" : ""}`}
        aria-label="Complete task"
        onClick={(e) => {
          e.stopPropagation();
          task.done ? app.reopen(task.id) : app.complete(task.id);
        }}
      >
        <span>✓</span>
      </button>
      <div className="task-body">
        <div className={`task-title ${task.done ? "strike" : ""}`}>{task.title}</div>
        <div className="task-meta">
          {task.due && (
            <span className={`due ${dueClass}`}>
              📅 {dueLabel(task.due)}
              {task.recurrence && " 🔁"}
            </span>
          )}
          {subCount > 0 && (
            <span>
              ⑂ {subs.filter((s) => s.done).length}/{subs.length}
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l} className="label">
              @{l}
            </span>
          ))}
          {task.person && <span className="person">👤 {task.person}</span>}
          {task.syncError && <span className="sync-error" title={task.syncError}>⚠ Not synced</span>}
          {!task.notionId && !task.syncError && <span className="pending" title="Waiting to sync">•</span>}
        </div>
      </div>
      {project && (
        <span className="task-project">
          {project.name} <span className={`dot c-${project.color}`} />
        </span>
      )}
    </>
  );
}

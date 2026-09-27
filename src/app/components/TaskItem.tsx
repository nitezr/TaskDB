import { dueDay, dueLabel, toDateStr } from "../../core/dates";
import type { Task } from "../../types";
import { useApp } from "../hooks";
import { dragProps } from "../ui";

export interface TaskItemHandlers {
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
}

interface Props extends TaskItemHandlers {
  task: Task;
  variant: "row" | "card";
  selected: boolean;
  completing: boolean;
  showProject: boolean;
  depth?: number;
  childCount?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onDropBefore?: (draggedId: string) => void;
}

export function TaskItem(p: Props) {
  const app = useApp();
  const { task } = p;
  const today = toDateStr(new Date());
  const day = task.due ? dueDay(task.due) : null;
  const dueClass = day ? (day < today && !task.done ? "overdue" : day === today ? "today" : "") : "";
  const project = p.showProject ? app.project(task.projectId) : undefined;
  const subs = p.childCount ? app.tasks().filter((t) => t.parentId === task.id) : [];

  const check = (
    <button
      className={`check p${task.priority} ${task.done ? "done" : ""}`}
      aria-label={task.done ? "Reopen task" : "Complete task"}
      onClick={(e) => {
        e.stopPropagation();
        p.onComplete(task.id);
      }}
    >
      <span>✓</span>
    </button>
  );

  const date = task.due && (
    <span className={`due ${dueClass}`}>
      {p.variant === "row" && "▦ "}
      {task.recurrence && "↻ "}
      {dueLabel(task.due)}
    </span>
  );
  const chips = (
    <>
      {task.labels.map((l) => (
        <span key={l} className="tag">
          {l}
        </span>
      ))}
      {task.person && <span className="tag">{task.person}👤</span>}
      {subs.length > 0 && (
        <span>
          ⑂ {subs.filter((s) => s.done).length}/{subs.length}
        </span>
      )}
      {task.syncError && (
        <span className="sync-error" title={task.syncError}>
          ⚠ Not synced
        </span>
      )}
      {!task.notionId && !task.syncError && (
        <span className="pending-dot" title="Waiting to sync">
          •
        </span>
      )}
    </>
  );
  const projectLabel = project && (
    <span className="task-project">
      {p.variant === "card" && <span className={`hash t-${project.color}`}>#</span>}
      {project.emoji && <span>{project.emoji}</span>}
      {project.name}
      {p.variant === "row" && <span className={`dot c-${project.color}`} />}
    </span>
  );

  const common = {
    "data-id": task.id,
    onClick: () => p.onSelect(task.id),
    onDoubleClick: () => p.onOpen(task.id),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      p.onSelect(task.id);
      p.onContextMenu(task.id, e);
    },
    ...dragProps(task.id),
    ...(p.onDropBefore
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLElement).classList.add("drop-before");
          },
          onDragLeave: (e: React.DragEvent) => (e.currentTarget as HTMLElement).classList.remove("drop-before"),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLElement).classList.remove("drop-before");
            const id = e.dataTransfer.getData("application/x-taskdb-task");
            if (id && id !== task.id) p.onDropBefore!(id);
          },
        }
      : {}),
  };
  const state = `${p.selected ? "selected" : ""} ${p.completing ? "completing" : ""}`;

  if (p.variant === "card") {
    return (
      <div className={`card ${state}`} {...common}>
        {check}
        <div className="task-body">
          <div className={`task-title ${task.done ? "strike" : ""}`}>{task.title}</div>
          {task.notes && <div className="task-notes">{task.notes}</div>}
          <div className="task-meta">
            {(date || task.labels.length > 0 || task.person) && (
              <div className="meta-row">
                {date}
                {chips}
              </div>
            )}
            {projectLabel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`task ${state}`} style={{ paddingLeft: 8 + (p.depth ?? 0) * 28 }} {...common}>
      {p.childCount ? (
        <button
          className={`collapse ${p.collapsed ? "closed" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            p.onToggleCollapse?.();
          }}
          aria-label={p.collapsed ? "Expand" : "Collapse"}
        >
          ▾
        </button>
      ) : (
        <span className="collapse-spacer" />
      )}
      {check}
      <div className="task-body">
        <div className={`task-title ${task.done ? "strike" : ""}`}>{task.title}</div>
        {task.notes && <div className="task-notes">{task.notes}</div>}
        <div className="task-meta">
          {date}
          {chips}
        </div>
      </div>
      {projectLabel}
    </div>
  );
}

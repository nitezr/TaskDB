import { deadlineLabel, dueDay, dueLabel, formatDuration, hasTime, parseDue, toDateStr } from "../../core/dates";

const timeLabel = (due: string) => parseDue(due).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
import type { Task } from "../../types";
import { useApp } from "../hooks";
import { CalendarSmallIcon, ChevronIcon, FlagIcon, PersonIcon, RepeatIcon, SubtaskIcon, WarningIcon } from "../icons";
import { dragProps } from "../ui";

export interface TaskItemHandlers {
  /** `e` carries ⌘/⇧ for multi-select; `fromMenu` keeps an existing multi-selection. */
  onSelect: (id: string, e?: React.MouseEvent, fromMenu?: boolean) => void;
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
  /** The day the surrounding group stands for, if it's a day heading. */
  groupDay?: string | null;
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

  // Under a heading that already names the day ("Today", "30 Sep · Tomorrow") the row doesn't
  // repeat it: only a time, if there is one (Things).
  const sameDay = !!task.due && !!p.groupDay && dueDay(task.due) === p.groupDay && !task.done;
  const date = task.due && !(sameDay && !hasTime(task.due) && !task.recurrence && !task.duration) && (
    <>
      {p.variant === "card" && task.recurrence && (
        <span className="recur muted">
          <RepeatIcon />
        </span>
      )}
      <span className={`due ${dueClass}`}>
        {p.variant === "row" && !sameDay && <CalendarSmallIcon />}
        {task.recurrence && p.variant === "row" && <RepeatIcon />}
        {sameDay ? (hasTime(task.due) ? timeLabel(task.due) : task.recurrence ? "" : null) : dueLabel(task.due)}
        {task.duration ? <span className="dur"> · {formatDuration(task.duration)}</span> : null}
      </span>
    </>
  );
  const dl = task.deadline && !task.done ? deadlineLabel(task.deadline) : null;
  const deadline = dl && (
    <span className={`deadline ${dl.tone}`} title={`Deadline ${task.deadline}`}>
      <FlagIcon /> {dl.text}
    </span>
  );
  const chips = (
    <>
      {deadline}
      {!task.due && task.duration ? <span className="dur">{formatDuration(task.duration)}</span> : null}
      {task.labels.map((l) => (
        <span key={l} className="tag">
          {l}
        </span>
      ))}
      {task.person && (
        <span className="tag person">
          <PersonIcon size={10} />
          {task.person}
        </span>
      )}
      {subs.length > 0 && (
        <span className="subcount" title="Sub-tasks done">
          <SubtaskIcon /> {subs.filter((s) => s.done).length}/{subs.length}
        </span>
      )}
      {task.syncError && (
        <span className="sync-error" title={task.syncError}>
          <WarningIcon size={11} /> Not synced
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
    onClick: (e: React.MouseEvent) => p.onSelect(task.id, e),
    onDoubleClick: () => p.onOpen(task.id),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      p.onSelect(task.id, undefined, true);
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
            {(date || deadline || task.labels.length > 0 || task.person) && (
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
    <div className={`task ${state}`} style={{ paddingLeft: 12 + (p.depth ?? 0) * 28, "--indent": `${(p.depth ?? 0) * 28}px` } as React.CSSProperties} {...common}>
      {p.childCount ? (
        <button
          className={`collapse ${p.collapsed ? "closed" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            p.onToggleCollapse?.();
          }}
          aria-label={p.collapsed ? "Expand" : "Collapse"}
        >
          <ChevronIcon />
        </button>
      ) : null}
      {check}
      <div className="task-body">
        <div className={`task-title ${task.done ? "strike" : ""}`}>{task.title}</div>
        {task.notes && <div className="task-notes">{task.notes}</div>}
        {(date || deadline || task.labels.length > 0 || task.person || subs.length > 0 || projectLabel || task.syncError || !task.notionId) && (
          <div className="task-meta">
            {date}
            {chips}
            {projectLabel && <span className="grow" />}
            {projectLabel}
          </div>
        )}
      </div>
    </div>
  );
}

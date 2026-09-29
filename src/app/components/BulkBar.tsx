import type { Priority } from "../../types";
import { useApp } from "../hooks";
import { CalendarSmallIcon, CheckCircleIcon, CloseIcon, FlagIcon, FolderIcon, I, TrashIcon } from "../icons";
import { anchorOf, useMenu } from "../ui";

/** Floating bar for a multi-selection (Todoist's multi-select toolbar). */
export function BulkBar(p: {
  count: number;
  onComplete: () => void;
  onSchedule: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPriority: (p: Priority) => void;
  onMove: (projectId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const app = useApp();
  const menu = useMenu();
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Selected tasks">
      <span className="bulk-count">{p.count} selected</span>
      <span className="bulk-sep" />
      <button onClick={p.onComplete} title="Complete (E)">
        <CheckCircleIcon size={14} /> Complete
      </button>
      <button onClick={p.onSchedule} title="Pick a date (S)">
        <CalendarSmallIcon size={13} /> Schedule
      </button>
      <button
        onClick={(e) =>
          menu.open(
            anchorOf(e.currentTarget),
            ([1, 2, 3, 4] as Priority[]).map((n) => ({ label: `Priority ${n}`, icon: <I.flag />, onClick: () => p.onPriority(n) })),
          )
        }
        title="Priority (1–4)"
      >
        <FlagIcon size={12} /> Priority
      </button>
      <button
        onClick={(e) =>
          menu.open(anchorOf(e.currentTarget), [
            { label: "Inbox", icon: <I.inbox />, onClick: () => p.onMove(null) },
            ...app.projectTree().map(({ project, depth }) => ({
              label: `${"   ".repeat(depth)}${project.name}`,
              icon: project.emoji ?? "#",
              onClick: () => p.onMove(project.id),
            })),
          ])
        }
      >
        <FolderIcon size={14} /> Move
      </button>
      <button className="danger" onClick={p.onDelete} title="Delete (⌘⌫)">
        <TrashIcon size={13} />
      </button>
      <span className="bulk-sep" />
      <button onClick={p.onClear} title="Clear selection (Esc)" aria-label="Clear selection">
        <CloseIcon size={12} />
      </button>
      {menu.element}
    </div>
  );
}

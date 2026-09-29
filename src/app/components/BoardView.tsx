import { useState } from "react";
import { askConfirm } from "../confirm";
import type { Group, ViewModel } from "../display";
import { useApp } from "../hooks";
import { PlusIcon } from "../icons";
import { anchorOf, dropProps, useMenu } from "../ui";
import { type ViewCtx, orderBefore, RESCHEDULE_TARGETS } from "./ListView";
import { QuickAdd } from "./QuickAdd";
import { TaskItem } from "./TaskItem";

/** Every view as columns: days, sections, priorities, tags or projects. */
export function BoardView({ vm, ctx, allowSections }: { vm: ViewModel; ctx: ViewCtx; allowSections: boolean }) {
  const app = useApp();
  const [adding, setAdding] = useState<string | null>(null);
  const [newSection, setNewSection] = useState<string | null>(null);
  const projectId = vm.groups.find((g) => g.section)?.section?.projectId ?? null;

  return (
    <div className="board">
      {vm.groups.map((g) => (
        <Column key={g.key} group={g} vm={vm} ctx={ctx} adding={adding === g.key} setAdding={(on) => setAdding(on ? g.key : null)} />
      ))}
      {allowSections && projectId && (
        <div className="new-column">
          {newSection === null ? (
            <button className="add-inline" onClick={() => setNewSection("")}>
              <span className="plus">+</span> Add section
            </button>
          ) : (
            <input
              autoFocus
              placeholder="Section name"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") setNewSection(null);
                if (e.key === "Enter" && newSection.trim()) {
                  void app.addSection(projectId, newSection);
                  setNewSection(null);
                }
              }}
              onBlur={() => setNewSection(null)}
              style={{ width: "100%" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Column({
  group,
  vm,
  ctx,
  adding,
  setAdding,
}: {
  group: Group;
  vm: ViewModel;
  ctx: ViewCtx;
  adding: boolean;
  setAdding: (on: boolean) => void;
}) {
  const app = useApp();
  const menu = useMenu();
  const [renaming, setRenaming] = useState<string | null>(null);
  const sec = group.section;
  const drop = group.patch !== null ? dropProps((id) => ctx.moveTask(id, { ...group.patch!, order: orderBefore(group.tasks, null) })) : {};

  const openMenu = (el: Element) => {
    if (group.overdue) {
      menu.open(
        anchorOf(el),
        RESCHEDULE_TARGETS.flatMap(([t, label]) => [
          ...(t === "none" ? [{ separator: true as const }] : []),
          { label, onClick: () => ctx.reschedule(group.tasks.map((x) => x.id), t) },
        ]),
      );
      return;
    }
    if (!sec?.name) return;
    const name = sec.name;
    menu.open(anchorOf(el), [
      { label: "Rename section", icon: "✎", onClick: () => setRenaming(name) },
      { label: "Move left", icon: "←", onClick: () => void app.moveSection(sec.projectId, name, -1) },
      { label: "Move right", icon: "→", onClick: () => void app.moveSection(sec.projectId, name, 1) },
      { separator: true },
      {
        label: "Delete section",
        icon: "🗑",
        danger: true,
        onClick: () =>
          void askConfirm(`Delete section “${name}”?`, "Delete Section", { detail: "Its tasks stay in the project, without a section." }).then(
            (ok) => void (ok && app.deleteSection(sec.projectId, name)),
          ),
      },
    ]);
  };

  return (
    <div className="column" {...drop}>
      <div className={`column-head ${group.tone ?? ""}`}>
        {renaming !== null ? (
          <input
            autoFocus
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                void app.renameSection(sec!.projectId, sec!.name!, renaming);
                setRenaming(null);
              }
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={() => setRenaming(null)}
          />
        ) : (
          <span onDoubleClick={() => sec?.name && setRenaming(sec.name)}>{group.title}</span>
        )}
        <span className="count">{group.tasks.length}</span>
        {group.overdue && group.tasks.length > 0 && (
          <button className="menu-btn" title={`Move all ${group.tasks.length} overdue tasks to a new date`} onClick={(e) => openMenu(e.currentTarget)}>
            Reschedule
          </button>
        )}
        {sec?.name && (
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={(e) => openMenu(e.currentTarget)} aria-label="Section menu">
            ⋯
          </button>
        )}
      </div>
      <div className="column-body">
        {group.tasks.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            variant="card"
            selected={ctx.selected === t.id || ctx.multi.has(t.id)}
            completing={ctx.completing.has(t.id)}
            showProject={ctx.showProject}
            onSelect={ctx.onSelect}
            onOpen={ctx.onOpen}
            onComplete={ctx.onComplete}
            onContextMenu={ctx.onContextMenu}
            onDropBefore={group.patch !== null ? (id) => ctx.moveTask(id, { ...group.patch!, order: orderBefore(group.tasks, t) }) : undefined}
          />
        ))}
        {group.patch !== null &&
          vm.title !== "Completed" &&
          (adding ? (
            <QuickAdd variant="inline" defaults={{ ...vm.addDefaults, ...group.patch }} onDone={() => setAdding(false)} />
          ) : (
            <button className="add-inline" onClick={() => setAdding(true)}>
              <span className="plus">
                <PlusIcon size={12} />
              </span>
              Add task
            </button>
          ))}
      </div>
      {menu.element}
    </div>
  );
}

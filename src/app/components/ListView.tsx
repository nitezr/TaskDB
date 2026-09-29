import { useState } from "react";
import type { ScheduleTarget } from "../controller";
import type { Group, TaskNode, ViewModel } from "../display";
import { nest } from "../display";
import { useApp } from "../hooks";
import { CheckCircleIcon, I, PlusIcon } from "../icons";
import { anchorOf, dropProps, useMenu } from "../ui";
import { askConfirm } from "../confirm";
import { QuickAdd } from "./QuickAdd";
import { TaskItem, type TaskItemHandlers } from "./TaskItem";
import type { Task, TaskFields } from "../../types";

export interface ViewCtx extends TaskItemHandlers {
  selected: string | null;
  /** Extra tasks picked with ⌘/⇧-click or X; bulk actions apply to all of them. */
  multi: Set<string>;
  completing: Set<string>;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  showProject: boolean;
  /** Applies a group's patch (and optional order) to a dropped task. */
  moveTask: (taskId: string, patch: Partial<TaskFields>) => void;
  reschedule: (ids: string[], target: ScheduleTarget) => void;
}

export const RESCHEDULE_TARGETS: [ScheduleTarget, string][] = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
  ["nextWeek", "Next week"],
  ["none", "Remove due date"],
];

/** Order value that places a task just before `before` within `list`. */
export function orderBefore(list: Task[], before: Task | null): number {
  if (!before) return (list.reduce((m, t) => Math.max(m, t.order), 0) || 0) + 1;
  const i = list.findIndex((t) => t.id === before.id);
  const prev = i > 0 ? list[i - 1]! : null;
  return prev ? (prev.order + before.order) / 2 : before.order - 1;
}

export function ListView({ vm, ctx, allowSections }: { vm: ViewModel; ctx: ViewCtx; allowSections: boolean }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [newSection, setNewSection] = useState<{ after: string | null; name: string } | null>(null);
  const app = useApp();
  const empty = vm.groups.every((g) => g.tasks.length === 0);
  const single = vm.groups.length === 1 && !vm.groups[0]!.title;

  const projectId = vm.groups.find((g) => g.section)?.section?.projectId ?? null;

  return (
    <div className="list">
      {vm.error && <div className="banner error">{vm.error}</div>}
      {vm.groups.map((g, gi) => (
        <div key={g.key}>
          <GroupBlock
            group={g}
            vm={vm}
            ctx={ctx}
            adding={adding === g.key}
            setAdding={(on) => setAdding(on ? g.key : null)}
            hideHeader={single}
          />
          {allowSections && projectId && gi === vm.groups.length - 1 && (
            newSection ? (
              <input
                autoFocus
                className="new-section-input"
                placeholder="Section name"
                value={newSection.name}
                onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setNewSection(null);
                  if (e.key === "Enter" && newSection.name.trim()) {
                    const list = app.sections(projectId);
                    const at = g.section?.name ? list.indexOf(g.section.name) + 1 : 0;
                    const next = [...list];
                    next.splice(at, 0, newSection.name.trim());
                    void app.updateProject(projectId, { sections: [...new Set(next)] });
                    setNewSection(null);
                  }
                }}
                onBlur={() => setNewSection(null)}
                style={{ width: "100%", margin: "6px 0", fontWeight: 600 }}
              />
            ) : (
              <button className="add-section" onClick={() => setNewSection({ after: g.section?.name ?? null, name: "" })}>
                <span className="plus-box">+</span> Add section
              </button>
            )
          )}
        </div>
      ))}
      {/* Views with an "Add task" row already say what to do; the empty state is for the rest. */}
      {empty && !vm.error && !vm.groups.some((g) => g.patch !== null) && vm.title !== "Completed" && <Empty title={vm.title} />}
    </div>
  );
}

function GroupBlock({
  group,
  vm,
  ctx,
  adding,
  setAdding,
  hideHeader,
}: {
  group: Group;
  vm: ViewModel;
  ctx: ViewCtx;
  adding: boolean;
  setAdding: (on: boolean) => void;
  hideHeader: boolean;
}) {
  const app = useApp();
  const menu = useMenu();
  const [renaming, setRenaming] = useState<string | null>(null);
  const nodes = vm.tree ? nest(group.tasks) : group.tasks.map((t) => ({ task: t, children: [] }));
  const canDrop = group.patch !== null;
  const drop = canDrop ? dropProps((id) => ctx.moveTask(id, { ...group.patch!, order: orderBefore(group.tasks, null) })) : {};
  const sec = group.section;

  const headerMenu = (el: Element) => {
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
      { label: "Rename section", icon: <I.edit />, onClick: () => setRenaming(name) },
      { label: "Move up", icon: <I.up />, onClick: () => void app.moveSection(sec.projectId, name, -1) },
      { label: "Move down", icon: <I.down />, onClick: () => void app.moveSection(sec.projectId, name, 1) },
      { separator: true },
      {
        label: "Delete section",
        icon: <I.trash />,
        danger: true,
        onClick: () =>
          void askConfirm(`Delete section “${name}”?`, "Delete Section", { detail: "Its tasks stay in the project, without a section." }).then(
            (ok) => void (ok && app.deleteSection(sec.projectId, name)),
          ),
      },
    ]);
  };

  return (
    <section className="group">
      {group.gap && <div className="gap-label">{group.gap}</div>}
      {!hideHeader && (
        <div className={`group-head ${group.tone ?? ""}`} {...drop}>
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
          {group.overdue && group.tasks.length > 0 && (
            <button
              className="reschedule-btn"
              title={`Move all ${group.tasks.length} overdue tasks to a new date`}
              onClick={(e) => headerMenu(e.currentTarget)}
            >
              Reschedule
            </button>
          )}
          {sec?.name && (
            <span className="head-actions">
              <button className="icon-btn" onClick={(e) => headerMenu(e.currentTarget)} aria-label="Section menu">
                ⋯
              </button>
            </span>
          )}
        </div>
      )}
      <div {...(hideHeader ? drop : {})}>
        {nodes.map((n) => (
          <Rows key={n.task.id} node={n} depth={0} ctx={ctx} group={group} />
        ))}
        {group.repeats?.map((t) => (
          <div key={`r-${t.id}`} className="repeat-row" title={`${t.recurrence} — appears here once the current one is done`} onClick={() => ctx.onSelect(t.id)}>
            <span className="repeat-check" />
            <span className="grow">{t.title}</span>
            <span className="repeat-rule">↻ {t.recurrence}</span>
          </div>
        ))}
      </div>
      {group.patch !== null &&
        vm.title !== "Completed" &&
        (adding ? (
          <QuickAdd variant="inline" defaults={{ ...vm.addDefaults, ...group.patch }} onDone={() => setAdding(false)} />
        ) : (
          <button className="add-inline" onClick={() => setAdding(true)}>
            <span className="plus">
              <PlusIcon size={13} />
            </span>
            Add task
          </button>
        ))}
      {menu.element}
    </section>
  );
}

function Rows({ node, depth, ctx, group }: { node: TaskNode; depth: number; ctx: ViewCtx; group: Group }) {
  const { task, children } = node;
  const collapsed = ctx.collapsed.has(task.id);
  return (
    <>
      <TaskItem
        task={task}
        variant="row"
        depth={depth}
        childCount={children.length}
        collapsed={collapsed}
        onToggleCollapse={() => ctx.toggleCollapse(task.id)}
        selected={ctx.selected === task.id || ctx.multi.has(task.id)}
        completing={ctx.completing.has(task.id)}
        showProject={ctx.showProject}
        groupDay={group.patch?.due && !group.overdue ? group.patch.due : null}
        onSelect={ctx.onSelect}
        onOpen={ctx.onOpen}
        onComplete={ctx.onComplete}
        onContextMenu={ctx.onContextMenu}
        onDropBefore={
          group.patch !== null
            ? (id) => ctx.moveTask(id, { ...group.patch!, order: orderBefore(group.tasks, task), parentId: task.parentId })
            : undefined
        }
      />
      {!collapsed && children.map((c) => <Rows key={c.task.id} node={c} depth={depth + 1} ctx={ctx} group={group} />)}
    </>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <div className="empty">
      <div className="empty-mark"><CheckCircleIcon size={40} /></div>
      <p>{title === "Today" ? "All clear for today. Enjoy the rest of your day!" : "Nothing here yet."}</p>
      <p className="small">
        Press <kbd>Q</kbd> to add a task.
      </p>
    </div>
  );
}

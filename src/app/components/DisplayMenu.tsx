import { useState } from "react";
import { BoardLayoutIcon, CalendarLayoutIcon, ListLayoutIcon } from "../icons";
import {
  DEADLINE_LABELS,
  DEFAULT_PREFS,
  type Deadline,
  type DisplayPrefs,
  GROUP_LABELS,
  type GroupBy,
  type Layout,
  SORT_LABELS,
  type Sorting,
  type View,
} from "../display";
import { useApp } from "../hooks";
import type { Priority } from "../../types";

const LAYOUTS: [Layout, string, JSX.Element][] = [
  ["list", "List", <ListLayoutIcon size={18} />],
  ["board", "Board", <BoardLayoutIcon size={18} />],
  ["calendar", "Calendar", <CalendarLayoutIcon size={18} />],
];

/** How many options differ from the defaults; shown as a badge on the Display button. */
export function changedCount(p: DisplayPrefs): number {
  return [
    p.groupBy !== DEFAULT_PREFS.groupBy,
    p.sorting !== DEFAULT_PREFS.sorting,
    p.showCompleted,
    p.deadline !== "all",
    p.priority !== "all",
    p.label !== "all",
  ].filter(Boolean).length;
}

/** Orange dot after a label whose setting isn't the default (Remit). */
const Changed = ({ on }: { on: boolean }) => (on ? <span className="changed-dot" /> : null);

/** Remit's Display menu: layout, grouping, sorting and quick filters, remembered per view. */
export function DisplayMenu({
  view,
  prefs,
  onChange,
  onReset,
}: {
  view: View;
  prefs: DisplayPrefs;
  onChange: (patch: Partial<DisplayPrefs>) => void;
  onReset: () => void;
}) {
  const app = useApp();
  const [filterName, setFilterName] = useState<string | null>(null);
  const groupOptions = (Object.keys(GROUP_LABELS) as GroupBy[]).filter((g) => g !== "section" || view.kind === "project");
  const hasQuickFilter = prefs.deadline !== "all" || prefs.priority !== "all" || prefs.label !== "all";

  const saveAsFilter = () => {
    const parts: string[] = [];
    if (prefs.deadline === "overdue") parts.push("overdue");
    if (prefs.deadline === "today") parts.push("(today | overdue)");
    if (prefs.deadline === "thisWeek") parts.push("7 days");
    if (prefs.deadline === "noDate") parts.push("no date");
    if (prefs.priority !== "all") parts.push(`p${prefs.priority}`);
    if (prefs.label !== "all") parts.push(`@${prefs.label.replace(/\s+/g, "_")}`);
    if (view.kind === "project") {
      const p = app.project(view.id);
      if (p) parts.push(`#${p.name.replace(/\s+/g, "_")}`);
    }
    const name = (filterName ?? "").trim();
    if (!name || !parts.length) return;
    const id = `f-${Date.now()}`;
    app.saveFilters([...app.filters(), { id, name, query: parts.join(" & ") }]);
    setFilterName(null);
  };

  return (
    <div className="display-menu">
      <h4>Layout</h4>
      <div className="layout-pick">
        {LAYOUTS.map(([l, label, ico]) => (
          <button key={l} className={prefs.layout === l ? "on" : ""} onClick={() => onChange({ layout: l })}>
            <span className="ico">{ico}</span>
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>
          Completed tasks
          <Changed on={prefs.showCompleted} />
        </span>
        <input type="checkbox" checked={prefs.showCompleted} onChange={(e) => onChange({ showCompleted: e.target.checked })} />
      </label>

      <h4>Sort</h4>
      <div className="field">
        <span>
          Grouping
          <Changed on={prefs.groupBy !== DEFAULT_PREFS.groupBy} />
        </span>
        <select value={prefs.groupBy} onChange={(e) => onChange({ groupBy: e.target.value as GroupBy })}>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span>
          Sorting
          <Changed on={prefs.sorting !== DEFAULT_PREFS.sorting} />
        </span>
        <select value={prefs.sorting} onChange={(e) => onChange({ sorting: e.target.value as Sorting })}>
          {(Object.keys(SORT_LABELS) as Sorting[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <h4>Filter</h4>
      <div className="field">
        <span>
          Due date
          <Changed on={prefs.deadline !== "all"} />
        </span>
        <select value={prefs.deadline} onChange={(e) => onChange({ deadline: e.target.value as Deadline })}>
          {(Object.keys(DEADLINE_LABELS) as Deadline[]).map((d) => (
            <option key={d} value={d}>
              {DEADLINE_LABELS[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span>
          Priority
          <Changed on={prefs.priority !== "all"} />
        </span>
        <select
          value={String(prefs.priority)}
          onChange={(e) => onChange({ priority: e.target.value === "all" ? "all" : (Number(e.target.value) as Priority) })}
        >
          <option value="all">All</option>
          {[1, 2, 3, 4].map((p) => (
            <option key={p} value={p}>
              Priority {p}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span>
          Tag
          <Changed on={prefs.label !== "all"} />
        </span>
        <select value={prefs.label} onChange={(e) => onChange({ label: e.target.value })}>
          <option value="all">All</option>
          {app.labels().map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="display-foot">
        {filterName === null ? (
          <button className="link small" disabled={!hasQuickFilter} onClick={() => setFilterName("")} title={hasQuickFilter ? "" : "Pick a deadline, priority or tag first"}>
            Save as Filter…
          </button>
        ) : (
          <input
            autoFocus
            placeholder="Filter name"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") saveAsFilter();
              if (e.key === "Escape") setFilterName(null);
            }}
            style={{ width: "100%" }}
          />
        )}
      </div>
      <button className="reset-all" onClick={onReset}>
        Reset all
      </button>
    </div>
  );
}

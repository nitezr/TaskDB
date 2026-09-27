import { useState } from "react";
import {
  DEADLINE_LABELS,
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

const LAYOUTS: [Layout, string, string][] = [
  ["list", "List", "☰"],
  ["board", "Board", "▥"],
  ["calendar", "Calendar", "▦"],
];

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

      <h4>Sort</h4>
      <div className="field">
        Grouping
        <select value={prefs.groupBy} onChange={(e) => onChange({ groupBy: e.target.value as GroupBy })}>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        Sorting
        <select value={prefs.sorting} onChange={(e) => onChange({ sorting: e.target.value as Sorting })}>
          {(Object.keys(SORT_LABELS) as Sorting[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <label className="field">
        Show completed tasks
        <input type="checkbox" checked={prefs.showCompleted} onChange={(e) => onChange({ showCompleted: e.target.checked })} />
      </label>

      <h4>Filter</h4>
      <div className="field">
        Deadline
        <select value={prefs.deadline} onChange={(e) => onChange({ deadline: e.target.value as Deadline })}>
          {(Object.keys(DEADLINE_LABELS) as Deadline[]).map((d) => (
            <option key={d} value={d}>
              {DEADLINE_LABELS[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        Priority
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
        Tag
        <select value={prefs.label} onChange={(e) => onChange({ label: e.target.value })}>
          <option value="all">All</option>
          {app.labels().map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="ghost small" onClick={onReset}>
          Reset
        </button>
        <span className="grow" />
        {hasQuickFilter &&
          (filterName === null ? (
            <button className="link small" onClick={() => setFilterName("")}>
              Save as filter…
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
              style={{ width: 150 }}
            />
          ))}
      </div>
    </div>
  );
}

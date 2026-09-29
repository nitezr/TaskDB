import { useState } from "react";
import { applyFilter, parseFilter } from "../../core/filters";
import { askConfirm } from "../confirm";
import type { SavedFilter } from "../controller";
import { countFor, type View } from "../display";
import { useApp } from "../hooks";
import { FilterIcon, PencilIcon, TrashIcon } from "../icons";

/** "p1 & (today | overdue)" → "Priority 1 · Today or Overdue", as Remit shows under each filter. */
export function describeQuery(q: string): string {
  const term = (t: string): string => {
    const x = t.trim().replace(/^\(+|\)+$/g, "").trim();
    const m = x.match(/^p([1-4])$/i);
    if (m) return `Priority ${m[1]}`;
    if (x.startsWith("@")) return `#${x.slice(1).replace(/_/g, " ")}`;
    if (x.startsWith("#")) return `in ${x.slice(1).replace(/_/g, " ")}`;
    if (x.startsWith("+")) return `with ${x.slice(1).replace(/_/g, " ")}`;
    if (x.startsWith("!")) return `not ${term(x.slice(1))}`;
    if (/^\d+ days$/.test(x)) return `Next ${x}`;
    return x ? x[0]!.toUpperCase() + x.slice(1) : x;
  };
  const text = q
    .split("&")
    .map((part) => part.split("|").map(term).filter(Boolean).join(" or "))
    .filter(Boolean)
    .join(" · ");
  return text || "Everything";
}

export function FiltersTags({ onNavigate }: { onNavigate: (v: View) => void }) {
  const app = useApp();
  const filters = app.filters();
  const [editing, setEditing] = useState<SavedFilter | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "label" | "person"; from: string; to: string } | null>(null);
  const [newPerson, setNewPerson] = useState("");
  const labels = app.labels();
  const people = app.people();
  const labelCount = (l: string) => app.tasks().filter((t) => !t.done && t.labels.includes(l)).length;
  const personCount = (p: string) => app.tasks().filter((t) => !t.done && t.person === p).length;
  const archived = app.projects.filter((p) => p.archived);
  const templates = app.templates();

  const commitRename = () => {
    if (!renaming) return;
    if (renaming.kind === "label") app.renameLabel(renaming.from, renaming.to);
    else app.renamePerson(renaming.from, renaming.to);
    setRenaming(null);
  };

  const renameInput = (
    <input
      autoFocus
      value={renaming?.to ?? ""}
      onChange={(e) => setRenaming((r) => r && { ...r, to: e.target.value })}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") setRenaming(null);
      }}
      onBlur={commitRename}
      onClick={(e) => e.stopPropagation()}
    />
  );

  return (
    <div className="browse">
      <h3>
        Filters <span className="count">{filters.length}</span>
      </h3>
      <div className="panel-list">
        {!filters.length && (
          <div className="empty-box">
            <FilterIcon />
            <div>
              <b>No saved filters</b>
              <p>A filter is a saved view across every project, like “Priority 1 due this week”. Set one up in the Display menu or here.</p>
            </div>
          </div>
        )}
        {filters.map((f) => (
          <div key={f.id} className="clickable" onClick={() => onNavigate({ kind: "filter", id: f.id })}>
            <span className="row-icon">
              <FilterIcon />
            </span>
            <div className="grow">
              <div>{f.name}</div>
              <div className="sub" title={f.query}>
                {describeQuery(f.query)}
              </div>
            </div>
            <span className="actions">
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(f);
                }}
                aria-label="Edit filter"
              >
                <PencilIcon />
              </button>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void askConfirm(`Delete the filter “${f.name}”?`, "Delete Filter", { detail: "Only the saved filter goes. No tasks change." }).then(
                    (ok) => ok && app.saveFilters(filters.filter((x) => x.id !== f.id)),
                  );
                }}
                aria-label="Delete filter"
              >
                <TrashIcon size={13} />
              </button>
            </span>
            <span className="count">{countFor({ kind: "filter", id: f.id }, app)}</span>
          </div>
        ))}
        <button className="muted" onClick={() => setEditing({ id: `f-${Date.now()}`, name: "", query: "" })}>
          <span>+</span> New filter
        </button>
      </div>

      <h3>
        Tags <span className="count">{labels.length}</span>
      </h3>
      <div className="panel-list">
        {labels.map((l) => (
          <div key={l} className="clickable" onClick={() => onNavigate({ kind: "label", name: l })}>
            <span className="hash">#</span>
            <div className="grow">{renaming?.kind === "label" && renaming.from === l ? renameInput : l}</div>
            <span className="actions">
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming({ kind: "label", from: l, to: l });
                }}
                aria-label="Rename tag"
                title="Rename everywhere"
              >
                <PencilIcon />
              </button>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void askConfirm(`Remove #${l} from every task?`, "Remove Tag", { detail: `The tag comes off ${app.tasks().filter((t) => t.labels.includes(l)).length} task(s) in TaskDB and Notion. The tasks themselves are kept.` }).then((ok) => ok && app.removeLabel(l));
                }}
                aria-label="Remove tag"
                title="Remove from every task"
              >
                <TrashIcon size={13} />
              </button>
            </span>
            <span className="count">{labelCount(l)}</span>
          </div>
        ))}
        {!labels.length && (
          <div className="empty-box">
            <span className="hash">#</span>
            <div>
              <b>No tags yet</b>
              <p>Add one with @name in quick add, or from a task's details. Tags cut across projects.</p>
            </div>
          </div>
        )}
      </div>

      <h3>
        People <span className="count">{people.length}</span>
      </h3>
      <div className="panel-list">
        {people.map((p) => (
          <div key={p} className="clickable" onClick={() => onNavigate({ kind: "person", name: p })}>
            <span>👤</span>
            <div className="grow">{renaming?.kind === "person" && renaming.from === p ? renameInput : p}</div>
            <span className="actions">
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming({ kind: "person", from: p, to: p });
                }}
                aria-label="Rename person"
              >
                <PencilIcon />
              </button>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void askConfirm(`Remove ${p} from every task?`, "Remove Person", { detail: "The tasks themselves are kept." }).then((ok) => ok && app.removePerson(p));
                }}
                aria-label="Remove person"
              >
                <TrashIcon size={13} />
              </button>
            </span>
            <span className="count">{personCount(p)}</span>
          </div>
        ))}
        <div>
          <input
            className="grow"
            placeholder="Add a person…"
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && newPerson.trim()) {
                app.addPerson(newPerson.trim());
                setNewPerson("");
              }
            }}
          />
        </div>
      </div>

      <h3>More</h3>
      <div className="panel-list">
        <button onClick={() => onNavigate({ kind: "completed" })}>
          <span>✓</span>
          <span className="grow">Completed tasks</span>
          <span className="count">{app.tasks().filter((t) => t.done).length || ""}</span>
        </button>
        {archived.map((p) => (
          <div key={p.id}>
            <span>🗄</span>
            <span className="grow">
              {p.emoji} {p.name} <span className="sub">archived</span>
            </span>
            <button className="link small" onClick={() => void app.updateProject(p.id, { archived: false })}>
              Unarchive
            </button>
          </div>
        ))}
        {templates.map((t) => (
          <div key={t.id}>
            <span>⧉</span>
            <span className="grow">
              {t.name} <span className="sub">template · {t.sections.join(", ") || "no sections"}</span>
            </span>
            <button className="icon-btn" onClick={() => app.deleteTemplate(t.id)} aria-label="Delete template">
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <FilterEditor
          filter={editing}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            const exists = filters.some((x) => x.id === f.id);
            app.saveFilters(exists ? filters.map((x) => (x.id === f.id ? f : x)) : [...filters, f]);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Structured criteria build the query; the query stays editable for power users. */
function FilterEditor({ filter, onSave, onClose }: { filter: SavedFilter; onSave: (f: SavedFilter) => void; onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState(filter.name);
  const [deadline, setDeadline] = useState("any");
  const [hardDeadline, setHardDeadline] = useState("any");
  const [priority, setPriority] = useState("any");
  const [label, setLabel] = useState("any");
  const [project, setProject] = useState("any");
  const [person, setPerson] = useState("any");
  const [advanced, setAdvanced] = useState<string | null>(filter.query || null);

  const tok = (s: string) => s.replace(/\s+/g, "_");
  const built = [
    deadline === "overdue" ? "overdue" : deadline === "today" ? "(today | overdue)" : deadline === "week" ? "7 days" : deadline === "none" ? "no date" : "",
    hardDeadline !== "any" ? hardDeadline : "",
    priority !== "any" ? `p${priority}` : "",
    label !== "any" ? `@${tok(label)}` : "",
    project !== "any" ? `#${tok(app.projectName(project) ?? "")}` : "",
    person !== "any" ? `+${tok(person)}` : "",
  ]
    .filter(Boolean)
    .join(" & ");
  const query = advanced ?? built;
  let error: string | null = null;
  let matches = 0;
  try {
    if (query.trim()) {
      parseFilter(query);
      // Same predicate as the sidebar count, so the number here is the number you'll see.
      matches = applyFilter(query, app.tasks(), { now: new Date(), projectName: app.projectName }).filter((t) => !t.done).length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const existing = app.filters().some((f) => f.id === filter.id);

  const select = (value: string, set: (v: string) => void, options: [string, string][]) => (
    <select
      value={value}
      onChange={(e) => {
        set(e.target.value);
        setAdvanced(null);
      }}
    >
      <option value="any">Any</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal filter-editor" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <h2>{existing ? "Edit Filter" : "New Filter"}</h2>
        <div className="field">
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Waiting on others" />
        </div>
        <div className="field">
          Due date
          {select(deadline, setDeadline, [
            ["overdue", "Overdue"],
            ["today", "Today & overdue"],
            ["week", "Next 7 days"],
            ["none", "No date"],
          ])}
        </div>
        <div className="field">
          Deadline
          {select(hardDeadline, setHardDeadline, [
            ["deadline", "Has a deadline"],
            ["deadline today", "Due today"],
            ["deadline 7 days", "Within 7 days"],
            ["missed deadline", "Missed"],
            ["no deadline", "No deadline"],
          ])}
        </div>
        <div className="field">
          Priority
          {select(priority, setPriority, [1, 2, 3, 4].map((p) => [String(p), `Priority ${p}`]))}
        </div>
        <div className="field">
          Tag
          {select(label, setLabel, app.labels().map((l) => [l, l]))}
        </div>
        <div className="field">
          Project
          {select(project, setProject, app.projectTree().map(({ project: p }) => [p.id, `${p.emoji ?? "#"} ${p.name}`]))}
        </div>
        <div className="field">
          Person
          {select(person, setPerson, app.people().map((p) => [p, p]))}
        </div>
        <div className="field">
          Query
          <input className={error ? "invalid" : ""} value={query} onChange={(e) => setAdvanced(e.target.value)} placeholder="p1 & (today | overdue)" />
        </div>
        <p className="small muted" style={{ margin: "4px 0" }}>
          Query terms: today, tomorrow, overdue, no date, 7 days, recurring, deadline, missed deadline, p1–p4, #project, @tag, +person, "text". Combine with &amp; | ! ( ).
        </p>
        {error && <p className="small error-text">{error}</p>}
        {!error && query.trim() && (
          <p className={`match-count ${matches ? "" : "none"}`}>
            <FilterIcon size={12} /> {matches === 1 ? "1 task matches now" : `${matches} tasks match now`}
          </p>
        )}
        <div className="row dialog-foot">
          {existing && (
            <button
              className="danger-link"
              onClick={() => {
                app.saveFilters(app.filters().filter((f) => f.id !== filter.id));
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <span className="grow" />
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!name.trim() || !query.trim() || !!error}
            onClick={() => onSave({ ...filter, name: name.trim(), query: query.trim() })}
          >
            {existing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

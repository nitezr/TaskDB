import { useState } from "react";
import { parseFilter } from "../../core/filters";
import type { SavedFilter } from "../controller";
import { useApp } from "../hooks";
import { countFor, type View } from "../views";

export function Browse({ onNavigate }: { onNavigate: (v: View) => void }) {
  const app = useApp();
  const filters = app.filters();
  const [editing, setEditing] = useState<SavedFilter | null>(null);
  const [person, setPerson] = useState("");

  return (
    <div className="browse">
      <section>
        <div className="browse-head">
          <h3>Filters</h3>
          <button className="ghost icon" onClick={() => setEditing({ id: `f-${Date.now()}`, name: "", query: "" })} aria-label="Add filter">
            +
          </button>
        </div>
        <ul className="browse-list">
          {filters.map((f) => (
            <li key={f.id} onClick={() => onNavigate({ kind: "filter", id: f.id })}>
              <span className="nav-icon">⚲</span>
              <span className="grow">
                {f.name} <code className="muted small">{f.query}</code>
              </span>
              <span className="count">{countFor({ kind: "filter", id: f.id }, app) || ""}</span>
              <button
                className="ghost icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(f);
                }}
                aria-label="Edit filter"
              >
                ✎
              </button>
            </li>
          ))}
        </ul>
        {editing && (
          <FilterEditor
            filter={editing}
            onCancel={() => setEditing(null)}
            onDelete={() => {
              app.saveFilters(filters.filter((f) => f.id !== editing.id));
              setEditing(null);
            }}
            onSave={(f) => {
              const exists = filters.some((x) => x.id === f.id);
              app.saveFilters(exists ? filters.map((x) => (x.id === f.id ? f : x)) : [...filters, f]);
              setEditing(null);
            }}
          />
        )}
      </section>

      <section>
        <h3>Labels</h3>
        <ul className="browse-list">
          {app.labels().map((l) => (
            <li key={l} onClick={() => onNavigate({ kind: "label", name: l })}>
              <span className="nav-icon">@</span>
              <span className="grow">{l}</span>
              <span className="count">{countFor({ kind: "label", name: l }, app) || ""}</span>
            </li>
          ))}
          {!app.labels().length && <li className="muted">Add labels with @name in quick add.</li>}
        </ul>
      </section>

      <section>
        <h3>People</h3>
        <ul className="browse-list">
          {app.people().map((p) => (
            <li key={p} onClick={() => onNavigate({ kind: "person", name: p })}>
              <span className="nav-icon">👤</span>
              <span className="grow">{p}</span>
              <span className="count">{countFor({ kind: "person", name: p }, app) || ""}</span>
            </li>
          ))}
        </ul>
        <input
          className="inline-input"
          placeholder="Add a person…"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && person.trim()) {
              app.addPerson(person.trim());
              setPerson("");
            }
            e.stopPropagation();
          }}
        />
      </section>
    </div>
  );
}

function FilterEditor({
  filter,
  onSave,
  onCancel,
  onDelete,
}: {
  filter: SavedFilter;
  onSave: (f: SavedFilter) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(filter.name);
  const [query, setQuery] = useState(filter.query);
  let error: string | null = null;
  try {
    if (query.trim()) parseFilter(query);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="filter-editor" onKeyDown={(e) => e.stopPropagation()}>
      <input placeholder="Filter name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input
        className={error ? "invalid" : ""}
        placeholder="e.g. (today | overdue) & #Work & !@waiting"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="small muted">
        Terms: today, tomorrow, overdue, no date, 7 days, recurring, p1–p4, #project, @label, +person, "text". Combine with &amp; | ! ( ).
      </p>
      {error && <p className="small error-text">{error}</p>}
      <div className="row">
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
        <span className="grow" />
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={!name.trim() || !query.trim() || !!error} onClick={() => onSave({ ...filter, name: name.trim(), query: query.trim() })}>
          Save
        </button>
      </div>
    </div>
  );
}

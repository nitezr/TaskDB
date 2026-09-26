import { useState } from "react";
import { PROJECT_COLORS } from "../../notion/setup";
import { askConfirm } from "../confirm";
import { useApp } from "../hooks";

/** Project title with rename, colour and archive. Changes go straight to Notion. */
export function ProjectHeader({ id, onGone }: { id: string; onGone: () => void }) {
  const app = useApp();
  const project = app.projects.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!project) return <h1>Project</h1>;

  const save = (fields: Parameters<typeof app.updateProject>[1]) =>
    app.updateProject(id, fields).catch((e) => setError(e instanceof Error ? e.message : String(e)));

  return (
    <div className="project-header" onKeyDown={(e) => e.stopPropagation()}>
      {editing ? (
        <input
          className="project-name-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (name.trim() && name.trim() !== project.name) void save({ name: name.trim() });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(project.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <h1
          title="Click to rename"
          onClick={() => {
            setName(project.name);
            setEditing(true);
          }}
        >
          {project.name}
        </h1>
      )}
      <select
        className="color-select"
        value={project.color}
        onChange={(e) => void save({ color: e.target.value })}
        aria-label="Project colour"
      >
        {PROJECT_COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <span className={`dot c-${project.color}`} />
      <span className="grow" />
      <button
        className="ghost"
        onClick={() => {
          void askConfirm(`Archive "${project.name}"? Its tasks stay in Notion; unarchive from Filters & Labels.`, "Archive").then((ok) => {
            if (!ok) return;
            void save({ archived: true });
            onGone();
          });
        }}
      >
        Archive
      </button>
      {error && <span className="small error-text">{error}</span>}
    </div>
  );
}

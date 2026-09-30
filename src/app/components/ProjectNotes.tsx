import { useEffect, useState } from "react";
import { useApp } from "../hooks";
import { Markdown, toggleChecklistLine } from "../markdown";
import type { Project } from "../../notion/projects";

/** Things-style notes under a project's title: what it is, links, what "done" means. */
export function ProjectNotes({ project }: { project: Project }) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.notes ?? "");
  useEffect(() => {
    setText(project.notes ?? "");
    setEditing(false);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (value: string) => {
    const next = value.trim() || null;
    if (next !== (project.notes ?? null)) void app.updateProject(project.id, { notes: next });
  };

  if (editing || !project.notes) {
    return (
      <div className="project-notes">
        <textarea
          className={`project-notes-input ${editing ? "on" : ""}`}
          placeholder="Notes — what this project is for, links, what done looks like"
          value={text}
          autoFocus={editing}
          rows={editing ? 3 : 1}
          onFocus={() => setEditing(true)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
          }}
          onBlur={() => {
            save(text);
            setEditing(false);
          }}
        />
      </div>
    );
  }
  return (
    <div className="project-notes view" onClick={() => setEditing(true)} title="Click to edit">
      <Markdown
        source={project.notes}
        onOpenUrl={(url) => void app.platform.openUrl(url)}
        onToggle={(line) => {
          const next = toggleChecklistLine(project.notes!, line);
          setText(next);
          save(next);
        }}
      />
    </div>
  );
}

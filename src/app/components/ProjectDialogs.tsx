import { useState } from "react";
import { PROJECT_COLORS } from "../../notion/setup";
import { useApp } from "../hooks";
import { anchorOf, Popover, PROJECT_EMOJI, type Anchor } from "../ui";

/** New project (optionally from a template or under a parent) or edit an existing one. */
export function ProjectDialog({
  id,
  parentId,
  onClose,
  onCreated,
}: {
  id: string | null;
  parentId?: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const app = useApp();
  const existing = id ? app.project(id) : undefined;
  const [name, setName] = useState(existing?.name ?? "");
  const [emoji, setEmoji] = useState<string | null>(existing?.emoji ?? null);
  const [color, setColor] = useState(existing?.color ?? PROJECT_COLORS[(app.projects.length + 5) % PROJECT_COLORS.length]!);
  const [parent, setParent] = useState<string>(existing?.parentId ?? parentId ?? "");
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [template, setTemplate] = useState("");
  const [picker, setPicker] = useState<Anchor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A project can't be nested under itself or its own descendants.
  const blocked = new Set<string>();
  if (id) {
    const walk = (pid: string) => {
      blocked.add(pid);
      app.projects.filter((p) => p.parentId === pid).forEach((p) => walk(p.id));
    };
    walk(id);
  }

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fields = { name: name.trim(), emoji, color, parentId: parent || null, favorite };
      if (existing) {
        await app.updateProject(existing.id, fields);
        onClose();
      } else {
        const sections = app.templates().find((t) => t.id === template)?.sections ?? [];
        const p = await app.addProject({ ...fields, sections });
        onCreated(p.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal project-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <h2>{existing ? "Edit project" : "New project"}</h2>
        <div className="field">
          <label>Name</label>
          <div className="name-row">
            <button className="emoji-btn" onClick={(e) => setPicker(anchorOf(e.currentTarget))} aria-label="Choose emoji" title="Emoji">
              {emoji ?? <span className={`dot c-${color}`} style={{ width: 12, height: 12 }} />}
            </button>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") onClose();
              }}
              placeholder="e.g. Acme Launch"
            />
          </div>
        </div>
        <div className="field">
          <label>Colour</label>
          <div className="color-row">
            {PROJECT_COLORS.map((c) => (
              <button key={c} className={`c-${c} ${color === c ? "on" : ""}`} onClick={() => setColor(c)} aria-label={c} title={c} />
            ))}
          </div>
        </div>
        <div className="field">
          <label>Parent project</label>
          <select value={parent} onChange={(e) => setParent(e.target.value)} style={{ width: "100%" }}>
            <option value="">None (top level)</option>
            {app
              .projectTree()
              .filter(({ project }) => !blocked.has(project.id))
              .map(({ project, depth }) => (
                <option key={project.id} value={project.id}>
                  {"  ".repeat(depth)}
                  {project.emoji ?? "#"} {project.name}
                </option>
              ))}
          </select>
        </div>
        {!existing && app.templates().length > 0 && (
          <div className="field">
            <label>Start from template</label>
            <select value={template} onChange={(e) => setTemplate(e.target.value)} style={{ width: "100%" }}>
              <option value="">Blank project</option>
              {app.templates().map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.sections.length} sections)
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="toggle">
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
          Add to favorites
        </label>
        {error && <p className="small error-text">{error}</p>}
        <div className="row">
          <span className="grow" />
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!name.trim() || busy} onClick={() => void save()}>
            {existing ? "Save" : "Add project"}
          </button>
        </div>
        {picker && (
          <Popover anchor={picker} onClose={() => setPicker(null)}>
            <div className="emoji-grid">
              {PROJECT_EMOJI.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setEmoji(e);
                    setPicker(null);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
            <button
              className="menu-item"
              onClick={() => {
                setEmoji(null);
                setPicker(null);
              }}
            >
              No emoji (use colour dot)
            </button>
          </Popover>
        )}
      </div>
    </div>
  );
}

export function SaveTemplateDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const app = useApp();
  const project = app.project(projectId);
  const [name, setName] = useState(project ? `${project.name} template` : "");
  const sections = app.sections(projectId);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal project-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <h2>Save as template</h2>
        <p className="small muted">
          Saves this project's structure — {sections.length ? sections.join(", ") : "no sections yet"}. Tasks are not copied.
        </p>
        <div className="field">
          <label>Template name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div className="row">
          <span className="grow" />
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              app.saveTemplate(projectId, name);
              onSaved();
            }}
          >
            Save template
          </button>
        </div>
      </div>
    </div>
  );
}

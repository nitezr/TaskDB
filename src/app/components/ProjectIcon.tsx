import type { Project } from "../../notion/projects";

/** A project's emoji, or the image icon of a linked Notion page. Null when it has neither. */
export function ProjectIcon({ project, size = 14 }: { project: Pick<Project, "emoji" | "iconUrl" | "name">; size?: number }) {
  if (project.emoji) return <span className="emoji">{project.emoji}</span>;
  if (project.iconUrl)
    return <img className="project-img" src={project.iconUrl} alt="" width={size} height={size} draggable={false} referrerPolicy="no-referrer" />;
  return null;
}

export const hasIcon = (p: Pick<Project, "emoji" | "iconUrl">) => Boolean(p.emoji || p.iconUrl);

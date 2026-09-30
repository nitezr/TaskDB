/**
 * A small, safe Markdown renderer for task descriptions: React nodes only, never raw HTML.
 * Covers what people paste into tasks: headings, bullet / numbered lists, [ ] checklists,
 * **bold**, *italic*, `code`, [links](https://…) and bare URLs.
 */
import type { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s)]+/;
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

function inline(text: string, open: (url: string) => void, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const tok = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const [, label, url] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      out.push(link(url!, label!, open, k));
    } else if (URL_RE.test(tok) && tok.startsWith("http")) {
      // Trailing punctuation belongs to the sentence, not the link.
      const clean = tok.replace(/[.,;:!?]+$/, "");
      out.push(link(clean, prettyUrl(clean), open, k));
      if (clean.length < tok.length) out.push(tok.slice(clean.length));
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, "") : "";
    const s = `${u.host.replace(/^www\./, "")}${path}`;
    return s.length > 48 ? `${s.slice(0, 46)}…` : s;
  } catch {
    return url;
  }
}

function link(url: string, label: string, open: (url: string) => void, key: string) {
  const safe = /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
  return safe ? (
    <a
      key={key}
      href={url}
      title={url}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(url);
      }}
    >
      {label}
    </a>
  ) : (
    <span key={key}>{label}</span>
  );
}

/** Line index of each checklist item, so ticking one can rewrite the source. */
export function toggleChecklistLine(source: string, line: number): string {
  const lines = source.split("\n");
  const l = lines[line];
  if (l === undefined) return source;
  lines[line] = l.replace(/^(\s*[-*]\s+)\[( |x|X)\]/, (_, pre, mark) => `${pre}[${mark === " " ? "x" : " "}]`);
  return lines.join("\n");
}

export function Markdown({ source, onOpenUrl, onToggle }: { source: string; onOpenUrl: (url: string) => void; onToggle?: (line: number) => void }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    blocks.push(list.ordered ? <ol key={`l${blocks.length}`}>{list.items}</ol> : <ul key={`l${blocks.length}`}>{list.items}</ul>);
    list = null;
  };

  lines.forEach((raw, n) => {
    const k = `b${n}`;
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/))) {
      if (!list || list.ordered) {
        flush();
        list = { ordered: false, items: [] };
      }
      const done = m[1] !== " ";
      list.items.push(
        <li key={k} className={`md-check ${done ? "done" : ""}`}>
          <button
            className={`md-box ${done ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(n);
            }}
            aria-label={done ? "Untick" : "Tick"}
          />
          <span>{inline(m[2]!, onOpenUrl, k)}</span>
        </li>,
      );
      return;
    }
    if ((m = raw.match(/^\s*[-*•]\s+(.*)$/)) || (m = raw.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      const ordered = /^\s*\d/.test(raw);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(<li key={k}>{inline(ordered ? m[2]! : m[1]!, onOpenUrl, k)}</li>);
      return;
    }
    flush();
    if ((m = raw.match(/^(#{1,3})\s+(.*)$/))) {
      blocks.push(
        <div key={k} className={`md-h md-h${m[1]!.length}`}>
          {inline(m[2]!, onOpenUrl, k)}
        </div>,
      );
    } else if (!raw.trim()) {
      blocks.push(<div key={k} className="md-gap" />);
    } else {
      blocks.push(<p key={k}>{inline(raw, onOpenUrl, k)}</p>);
    }
  });
  flush();
  return <div className="markdown">{blocks}</div>;
}

/** One-line preview for task rows: Markdown syntax removed. */
export function plainPreview(source: string): string {
  return source
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^\s*[-*]\s+\[( |x|X)\]\s*/gm, "")
    .replace(/^\s*(#{1,3}|[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\s*\n+\s*/g, " · ")
    .trim();
}

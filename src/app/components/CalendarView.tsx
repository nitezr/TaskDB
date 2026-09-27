import { useState } from "react";
import { addDays, addMonths, dueDay, formatDue, hasTime, parseDue, startOfDay, toDateStr } from "../../core/dates";
import type { Task, TaskFields } from "../../types";
import type { CalendarRange } from "../display";
import { useApp } from "../hooks";
import { dragProps, dropProps } from "../ui";

interface Props {
  tasks: Task[];
  range: CalendarRange;
  onRange: (r: CalendarRange) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  moveTask: (id: string, patch: Partial<TaskFields>) => void;
  onAddOn: (day: string) => void;
}

const RANGES: [CalendarRange, string][] = [
  ["day", "Day"],
  ["threeDays", "3 Days"],
  ["week", "Week"],
  ["month", "Month"],
];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function CalendarView(p: Props) {
  const app = useApp();
  const settings = app.settings();
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const today = toDateStr(new Date());

  const step = (dir: -1 | 1) => {
    if (p.range === "month") setAnchor((a) => addMonths(new Date(a.getFullYear(), a.getMonth(), 1), dir));
    else setAnchor((a) => addDays(a, dir * (p.range === "day" ? 1 : p.range === "threeDays" ? 3 : 7)));
  };

  const byDay = new Map<string, Task[]>();
  for (const t of p.tasks) {
    if (!t.due) continue;
    const k = dueDay(t.due);
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  for (const list of byDay.values()) list.sort((a, b) => parseDue(a.due!).getTime() - parseDue(b.due!).getTime() || a.priority - b.priority);

  /** Moving to another day keeps a task's time; dropping on an hour sets it. */
  const moveTo = (id: string, day: string, hour?: number) => {
    const t = app.task(id);
    if (!t) return;
    const d = parseDue(day);
    if (hour !== undefined) {
      d.setHours(hour, t.due && hasTime(t.due) ? parseDue(t.due).getMinutes() : 0, 0, 0);
      p.moveTask(id, { due: formatDue(d, true) });
    } else if (t.due && hasTime(t.due)) {
      const old = parseDue(t.due);
      d.setHours(old.getHours(), old.getMinutes(), 0, 0);
      p.moveTask(id, { due: formatDue(d, true) });
    } else {
      p.moveTask(id, { due: day });
    }
  };

  const title =
    p.range === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric", day: p.range === "day" ? "numeric" : undefined });

  const item = (t: Task, showTime = true) => {
    const project = app.project(t.projectId);
    return (
      <div
        key={t.id}
        className={`cal-item ${t.done ? "done" : ""}`}
        style={p.selected === t.id ? { boxShadow: "0 0 0 2px var(--accent)" } : undefined}
        title={t.title}
        onClick={(e) => {
          e.stopPropagation();
          p.onSelect(t.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          p.onOpen(t.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          p.onSelect(t.id);
          p.onContextMenu(t.id, e);
        }}
        {...dragProps(t.id)}
      >
        <span className={`dot ${project ? `c-${project.color}` : ""}`} style={!project ? { background: `var(--p${t.priority})` } : undefined} />
        {showTime && t.due && hasTime(t.due) && (
          <span className="time">{parseDue(t.due).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
      </div>
    );
  };

  return (
    <div className="cal">
      <div className="cal-toolbar">
        <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
          ‹
        </button>
        <h2>{title}</h2>
        <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
          ›
        </button>
        <button className="link" onClick={() => setAnchor(startOfDay(new Date()))}>
          Today
        </button>
        <span className="grow" />
        <div className="segmented">
          {RANGES.map(([r, label]) => (
            <button key={r} className={p.range === r ? "on" : ""} onClick={() => p.onRange(r)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {p.range === "month" ? (
        <MonthGrid anchor={anchor} today={today} byDay={byDay} item={item} moveTo={moveTo} onAddOn={p.onAddOn} onShowDay={(d) => {
          setAnchor(parseDue(d));
          p.onRange("day");
        }} />
      ) : (
        <HourGrid
          days={daysFor(anchor, p.range)}
          today={today}
          byDay={byDay}
          item={item}
          moveTo={moveTo}
          hours={visibleHours(settings.hideSleep, settings.sleepStart, settings.sleepEnd)}
          onAddOn={p.onAddOn}
        />
      )}
    </div>
  );
}

function daysFor(anchor: Date, range: CalendarRange): string[] {
  if (range === "day") return [toDateStr(anchor)];
  if (range === "threeDays") return [0, 1, 2].map((i) => toDateStr(addDays(anchor, i)));
  const sunday = addDays(anchor, -anchor.getDay());
  return [0, 1, 2, 3, 4, 5, 6].map((i) => toDateStr(addDays(sunday, i)));
}

/** Sleeping hours narrow the axis rather than hiding tasks; late tasks sit in the nearest slot. */
export function visibleHours(hide: boolean, sleepStart: number, sleepEnd: number): number[] {
  if (!hide) return Array.from({ length: 24 }, (_, i) => i);
  if (sleepEnd < sleepStart) return Array.from({ length: sleepStart - sleepEnd }, (_, i) => sleepEnd + i);
  return Array.from({ length: 24 }, (_, i) => i).filter((h) => h < sleepStart || h >= sleepEnd);
}

function MonthGrid({
  anchor,
  today,
  byDay,
  item,
  moveTo,
  onAddOn,
  onShowDay,
}: {
  anchor: Date;
  today: string;
  byDay: Map<string, Task[]>;
  item: (t: Task, showTime?: boolean) => JSX.Element;
  moveTo: (id: string, day: string) => void;
  onAddOn: (day: string) => void;
  onShowDay: (day: string) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <>
      <div className="cal-dow">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="cal-month" style={{ gridTemplateRows: `repeat(${weeks}, minmax(110px, 1fr))` }}>
        {cells.map((d) => {
          const key = toDateStr(d);
          const list = byDay.get(key) ?? [];
          const other = d.getMonth() !== anchor.getMonth();
          return (
            <div key={key} className={`cal-cell ${other ? "other" : ""}`} onDoubleClick={() => onAddOn(key)} {...dropProps((id) => moveTo(id, key))}>
              <div className="cal-date">
                <span className={key === today ? "cal-date today" : ""}>{d.getDate()}</span>
              </div>
              {list.slice(0, 3).map((t) => item(t, false))}
              {list.length > 3 && (
                <button className="cal-more" onClick={() => onShowDay(key)}>
                  +{list.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function HourGrid({
  days,
  today,
  byDay,
  item,
  moveTo,
  hours,
  onAddOn,
}: {
  days: string[];
  today: string;
  byDay: Map<string, Task[]>;
  item: (t: Task, showTime?: boolean) => JSX.Element;
  moveTo: (id: string, day: string, hour?: number) => void;
  hours: number[];
  onAddOn: (day: string) => void;
}) {
  const style = { "--days": days.length } as React.CSSProperties;
  const first = hours[0] ?? 0;
  const last = hours[hours.length - 1] ?? 23;
  const slotFor = (h: number) => Math.min(last, Math.max(first, h));
  return (
    <div className="cal-week">
      <div className="cal-week-head" style={style}>
        <div />
        {days.map((d) => {
          const date = parseDue(d);
          return (
            <div key={d} className={d === today ? "is-today" : ""}>
              {date.toLocaleDateString(undefined, { weekday: "short" })}
              <span className="num">{date.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="allday-row" style={style}>
        <div className="allday-label">all-day</div>
        {days.map((d) => (
          <div key={d} className="allday-cell" onDoubleClick={() => onAddOn(d)} {...dropProps((id) => moveTo(id, d))}>
            {(byDay.get(d) ?? []).filter((t) => !hasTime(t.due!)).map((t) => item(t, false))}
          </div>
        ))}
      </div>
      <div className="hour-grid" style={style}>
        {hours.map((h) => (
          <HourRow key={h} h={h} days={days} byDay={byDay} item={item} moveTo={moveTo} slotFor={slotFor} />
        ))}
      </div>
    </div>
  );
}

function HourRow({
  h,
  days,
  byDay,
  item,
  moveTo,
  slotFor,
}: {
  h: number;
  days: string[];
  byDay: Map<string, Task[]>;
  item: (t: Task, showTime?: boolean) => JSX.Element;
  moveTo: (id: string, day: string, hour?: number) => void;
  slotFor: (h: number) => number;
}) {
  const label = new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
  return (
    <>
      <div className="hour-label">{label}</div>
      {days.map((d) => (
        <div key={d} className="hour-slot" {...dropProps((id) => moveTo(id, d, h))}>
          {(byDay.get(d) ?? [])
            .filter((t) => hasTime(t.due!) && slotFor(parseDue(t.due!).getHours()) === h)
            .map((t) => item(t))}
        </div>
      ))}
    </>
  );
}


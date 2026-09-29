import { useEffect, useState } from "react";
import { addDays, addMonths, dueDay, formatDue, hasTime, parseDue, startOfDay, toDateStr } from "../../core/dates";
import type { Task, TaskFields } from "../../types";
import type { CalendarRange } from "../display";
import { useApp } from "../hooks";
import { ChevronIcon, MoonIcon } from "../icons";
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

  const days = daysFor(anchor, p.range, settings.weekStart);
  const short = (d: string) => parseDue(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  /** The span actually on screen, not just the month (Remit: "Sep 29 – Oct 5"). */
  const title =
    p.range === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : p.range === "day"
        ? anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
        : `${short(days[0]!)} – ${short(days[days.length - 1]!)}`;
  const undated = p.tasks.filter((t) => !t.due && !t.done);

  const item = (t: Task, showTime = true, style?: React.CSSProperties, cls = "") => {
    const project = app.project(t.projectId);
    return (
      <div
        key={t.id}
        className={`cal-item ${cls} ${t.done ? "done" : ""} ${p.selected === t.id ? "selected" : ""}`}
        title={t.title}
        style={style}
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
        <span className="dot" style={{ background: `var(--p${t.priority})` }} title={project?.name} />
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
        <h2>{title}</h2>
        <div className="board-nav">
          <button onClick={() => step(-1)} aria-label="Previous">
            <ChevronIcon size={10} className="flip" />
          </button>
          <button className="today-btn" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </button>
          <button onClick={() => step(1)} aria-label="Next">
            <ChevronIcon size={10} />
          </button>
        </div>
        <span className="grow" />
        {p.range !== "month" && (
          <button
            className={`icon-btn moon ${settings.hideSleep ? "on" : ""}`}
            onClick={() => app.updateSettings({ hideSleep: !settings.hideSleep })}
            title={settings.hideSleep ? "Showing waking hours only — click to show the full day" : "Hide sleeping hours"}
            aria-label="Toggle sleeping hours"
          >
            <MoonIcon filled={settings.hideSleep} />
          </button>
        )}
        <div className="segmented">
          {RANGES.map(([r, label]) => (
            <button key={r} className={p.range === r ? "on" : ""} onClick={() => p.onRange(r)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {p.range === "month" ? (
        <>
          <MonthGrid weekStart={settings.weekStart} anchor={anchor} today={today} byDay={byDay} item={item} moveTo={moveTo} onAddOn={p.onAddOn} onShowDay={(d) => {
            setAnchor(parseDue(d));
            p.onRange("day");
          }} />
          {undated.length > 0 && (
            <div className="cal-undated">
              <h5>No date</h5>
              <div className="cal-undated-row">{undated.map((t) => item(t, false))}</div>
            </div>
          )}
        </>
      ) : (
        <HourGrid
          days={days}
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

function daysFor(anchor: Date, range: CalendarRange, weekStart: 0 | 1): string[] {
  if (range === "day") return [toDateStr(anchor)];
  if (range === "threeDays") return [0, 1, 2].map((i) => toDateStr(addDays(anchor, i)));
  const first = addDays(anchor, -((anchor.getDay() - weekStart + 7) % 7));
  return [0, 1, 2, 3, 4, 5, 6].map((i) => toDateStr(addDays(first, i)));
}

/** Sleeping hours narrow the axis; tasks timed outside it move to the All-day row. */
export function visibleHours(hide: boolean, sleepStart: number, sleepEnd: number): number[] {
  if (!hide) return Array.from({ length: 24 }, (_, i) => i);
  if (sleepEnd < sleepStart) return Array.from({ length: sleepStart - sleepEnd }, (_, i) => sleepEnd + i);
  return Array.from({ length: 24 }, (_, i) => i).filter((h) => h < sleepStart || h >= sleepEnd);
}

function MonthGrid({
  weekStart,
  anchor,
  today,
  byDay,
  item,
  moveTo,
  onAddOn,
  onShowDay,
}: {
  weekStart: 0 | 1;
  anchor: Date;
  today: string;
  byDay: Map<string, Task[]>;
  item: (t: Task, showTime?: boolean, style?: React.CSSProperties) => JSX.Element;
  moveTo: (id: string, day: string) => void;
  onAddOn: (day: string) => void;
  onShowDay: (day: string) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  const weeks = Math.ceil((lead + new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <>
      <div className="cal-dow">
        {[...DOW.slice(weekStart), ...DOW.slice(0, weekStart)].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="cal-month" style={{ gridTemplateRows: `repeat(${weeks}, minmax(74px, 1fr))` }}>
        {cells.map((d) => {
          const key = toDateStr(d);
          const list = byDay.get(key) ?? [];
          const other = d.getMonth() !== anchor.getMonth();
          return (
            <div key={key} className={`cal-cell ${other ? "other" : ""}`} onDoubleClick={() => onAddOn(key)} {...dropProps((id) => moveTo(id, key))}>
              <div className="cal-date">
                <span className={key === today ? "today" : ""}>{d.getDate()}</span>
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

const HOUR = 48;

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
  item: (t: Task, showTime?: boolean, style?: React.CSSProperties, cls?: string) => JSX.Element;
  moveTo: (id: string, day: string, hour?: number) => void;
  hours: number[];
  onAddOn: (day: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const style = { "--days": days.length } as React.CSSProperties;
  const visible = new Set(hours);
  /** Timed tasks outside the visible hours go to All-day rather than showing at a wrong time. */
  const inGrid = (t: Task) => hasTime(t.due!) && visible.has(parseDue(t.due!).getHours());
  const allDay = days.map((d) => (byDay.get(d) ?? []).filter((t) => !inGrid(t)));
  const busiest = Math.max(0, ...allDay.map((l) => l.length));
  const nowIdx = hours.indexOf(now.getHours());

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
      <div className="allday-row" style={{ ...style, height: Math.min(96, Math.max(30, busiest * 24 + 8)) }}>
        <div className="allday-label">All-day</div>
        {days.map((d, i) => (
          <div key={d} className={`allday-cell ${d === today ? "today" : ""}`} onDoubleClick={() => onAddOn(d)} {...dropProps((id) => moveTo(id, d))}>
            {allDay[i]!.map((t) => item(t, hasTime(t.due!)))}
          </div>
        ))}
      </div>
      <div className="hour-scroll">
        <div className="hour-grid" style={style}>
          {hours.map((h) => (
            <HourRow key={h} h={h} days={days} today={today} moveTo={moveTo} />
          ))}
          {/* Tasks sit at their exact minute, above the hour cells that take drops. */}
          <div className="hour-layer" style={style}>
            <div />
            {days.map((d) => {
              // Blocks sit at their start time and are as tall as their duration; one that starts
              // while another is still running is indented, like overlapping calendar events.
              const ends: number[] = [];
              return (
                <div key={d} className="hour-col">
                  {(byDay.get(d) ?? []).filter(inGrid).map((t) => {
                    const at = parseDue(t.due!);
                    const top = hours.indexOf(at.getHours()) * HOUR + (at.getMinutes() / 60) * HOUR;
                    const height = Math.max(20, ((t.duration ?? 0) / 60) * HOUR - 2);
                    const depth = ends.filter((e) => e > top + 1).length;
                    ends.push(top + height);
                    return item(t, true, { top, height, left: 3 + depth * 14, zIndex: 1 + depth }, height >= 34 ? "tall" : "");
                  })}
                  {d === today && nowIdx >= 0 && <div className="now-line" style={{ top: nowIdx * HOUR + (now.getMinutes() / 60) * HOUR }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function HourRow({ h, days, today, moveTo }: { h: number; days: string[]; today: string; moveTo: (id: string, day: string, hour?: number) => void }) {
  const label = new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
  return (
    <>
      <div className="hour-label">{label}</div>
      {days.map((d) => (
        <div key={d} className={`hour-slot ${d === today ? "today" : ""}`} {...dropProps((id) => moveTo(id, d, h))} />
      ))}
    </>
  );
}

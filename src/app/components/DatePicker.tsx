import { useState } from "react";
import { addDays, addMonths, dueDay, formatDue, hasTime, parseDue, startOfDay, toDateStr } from "../../core/dates";
import { parseQuickAdd } from "../../core/quickAdd";
import { useApp } from "../hooks";
import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, MoonIcon, NoDateIcon, StarIcon, SunIcon } from "../icons";
import { type Anchor, Popover } from "../ui";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

/**
 * Todoist's scheduler, Things' When picker: type a date, pick a quick option, or click a day.
 * Each day shows how busy it already is, so you can spread work out while scheduling.
 */
export function DatePicker({
  anchor,
  value,
  onChange,
  onClose,
  mode = "due",
  duration,
  onDuration,
}: {
  anchor: Anchor;
  value: string | null;
  onChange: (v: string | null) => void;
  onClose: () => void;
  /** Deadlines are date-only and have no duration. */
  mode?: "due" | "deadline";
  duration?: number | null;
  onDuration?: (minutes: number | null) => void;
}) {
  const app = useApp();
  const weekStart = app.settings().weekStart;
  const today = startOfDay(new Date());
  const current = value ? parseDue(value) : null;
  const [month, setMonth] = useState(() => new Date((current ?? today).getFullYear(), (current ?? today).getMonth(), 1));
  const [text, setText] = useState("");
  const timed = !!value && hasTime(value);
  const [showTime, setShowTime] = useState(timed);

  const load = new Map<string, number>();
  for (const t of app.tasks()) if (!t.done && t.due) load.set(dueDay(t.due), (load.get(dueDay(t.due)) ?? 0) + 1);

  /** Keeps the time of day when only the date changes. */
  const pickDay = (d: Date) => {
    if (mode === "due" && current && timed) {
      const x = new Date(d);
      x.setHours(current.getHours(), current.getMinutes(), 0, 0);
      onChange(formatDue(x, true));
    } else onChange(toDateStr(d));
    onClose();
  };

  const weekday = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" });
  const short = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const saturday = addDays(today, (6 - today.getDay() + 7) % 7 || 7);
  const monday = addDays(today, (8 - today.getDay()) % 7 || 7);
  const currentDay = current ? toDateStr(current) : null;
  // Colour carries meaning, as in Things: yellow-ish today, orange tomorrow, blue weekend.
  const quick: [string, React.ReactNode, Date, string][] = [
    currentDay === toDateStr(today) || currentDay === toDateStr(addDays(today, 1))
      ? ["Later this week", <ArrowRightIcon className="c-later" />, addDays(today, 2), weekday(addDays(today, 2))]
      : ["Today", <StarIcon className="c-today" />, today, weekday(today)],
    ["Tomorrow", <SunIcon className="c-tomorrow" />, addDays(today, 1), weekday(addDays(today, 1))],
    ["This weekend", <MoonIcon className="c-weekend" />, saturday, weekday(saturday)],
    ["Next week", <ArrowRightIcon className="c-next" />, monday, short(monday)],
  ];

  const lead = (month.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => addDays(month, i - lead));
  const dow = ["S", "M", "T", "W", "T", "F", "S"];

  const setTime = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = current ? new Date(current) : new Date(today);
    d.setHours(h ?? 9, m ?? 0, 0, 0);
    onChange(formatDue(d, true));
  };

  return (
    <Popover anchor={anchor} onClose={onClose} className="date-picker">
      <input
        autoFocus
        className="dp-input"
        placeholder={mode === "deadline" ? "Deadline: fri, oct 5, in 2 weeks…" : "Type a date: tomorrow 5pm, next fri…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          if (e.key !== "Enter") return;
          const r = parseQuickAdd(`x ${text}`);
          if (r.due) {
            onChange(mode === "deadline" ? r.due.slice(0, 10) : r.due);
            onClose();
          }
        }}
      />
      {text && (
        <div className="dp-preview">
          {(() => {
            const r = parseQuickAdd(`x ${text}`);
            return r.due ? `↵ ${short(parseDue(r.due))}${hasTime(r.due) && mode === "due" ? ` ${parseDue(r.due).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}` : "Keep typing…";
          })()}
        </div>
      )}
      <div className="dp-quick">
        {quick.map(([label, icon, d, hint]) => (
          <button key={label} className="menu-item" onClick={() => pickDay(d)}>
            <span className="dp-icon">{icon}</span>
            <span className="grow">{label}</span>
            <span className="muted small">{hint}</span>
          </button>
        ))}
        {value && (
          <button
            className="menu-item"
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            <span className="dp-icon">
              <NoDateIcon />
            </span>
            <span className="grow">{mode === "deadline" ? "Remove deadline" : "No date"}</span>
          </button>
        )}
      </div>
      <div className="dp-month">
        <div className="dp-month-head">
          <b>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
          <span className="grow" />
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <ChevronUpIcon size={12} />
          </button>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <ChevronDownIcon size={12} />
          </button>
        </div>
        <div className="dp-grid">
          {[...dow.slice(weekStart), ...dow.slice(0, weekStart)].map((d, i) => (
            <span key={i} className="dp-dow">
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const key = toDateStr(d);
            const n = load.get(key) ?? 0;
            const cls = [
              "dp-day",
              d.getMonth() !== month.getMonth() ? "other" : "",
              key === toDateStr(today) ? "today" : "",
              key === currentDay ? "on" : "",
              d < today ? "past" : "",
            ].join(" ");
            return (
              <button key={key} className={cls} onClick={() => pickDay(d)} title={n ? `${n} task${n === 1 ? "" : "s"} due` : "Nothing due"}>
                {d.getDate()}
                {n > 0 && <i className={n >= 5 ? "busy" : ""} />}
              </button>
            );
          })}
        </div>
      </div>
      {mode === "due" && (
        <div className="dp-foot">
          {showTime || timed ? (
            <div className="dp-row">
              <span className="grow">Time</span>
              <input
                type="time"
                value={timed && current ? `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}` : ""}
                onChange={(e) => e.target.value && setTime(e.target.value)}
              />
              {timed && (
                <button
                  className="icon-btn"
                  onClick={() => {
                    onChange(toDateStr(current!));
                    setShowTime(false);
                  }}
                  aria-label="Remove time"
                >
                  ×
                </button>
              )}
            </div>
          ) : (
            <button className="dp-add-time" onClick={() => setShowTime(true)}>
              <ClockIcon size={12} /> Add time
            </button>
          )}
          {onDuration && (
            <div className="dp-row">
              <span className="grow">Duration</span>
              <select value={duration ?? ""} onChange={(e) => onDuration(e.target.value ? Number(e.target.value) : null)}>
                <option value="">None</option>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

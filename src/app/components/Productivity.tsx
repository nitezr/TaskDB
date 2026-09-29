import { useEffect, useState } from "react";
import { addDays, startOfDay, toDateStr } from "../../core/dates";
import type { AppController } from "../controller";
import { useApp } from "../hooks";
import { CloseIcon } from "../icons";

const DAY_LETTERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export interface Stats {
  today: number;
  dailyGoal: number;
  week: number;
  weeklyGoal: number;
  /** Completions for each of the last 7 days, oldest first. */
  last7: { day: string; count: number }[];
  /** Completions for each of the last 8 weeks (week = 7 days ending today), oldest first. */
  last8Weeks: number[];
  streak: number;
  longest: number;
}

/**
 * Todoist's Productivity view, without the gamified points: a daily goal, a weekly goal and a
 * streak of days that met the daily goal. Days off neither count nor break a streak.
 */
export function productivityStats(app: AppController, now = new Date()): Stats {
  const s = app.settings();
  const byDay = app.completedByDay();
  const count = (d: Date) => byDay.get(toDateStr(d))?.length ?? 0;
  const today = startOfDay(now);
  const off = new Set(s.daysOff);
  const met = (d: Date) => count(d) >= Math.max(1, s.dailyGoal);

  let streak = 0;
  // Today still counts if met; if not, it's in progress and doesn't break the run.
  for (let i = met(today) ? 0 : 1; i < 3650; i++) {
    const d = addDays(today, -i);
    if (off.has(d.getDay()) && !met(d)) continue;
    if (!met(d)) break;
    streak++;
  }
  let longest = 0;
  let run = 0;
  for (let i = 400; i >= 0; i--) {
    const d = addDays(today, -i);
    if (met(d)) run++;
    else if (!off.has(d.getDay())) run = 0;
    longest = Math.max(longest, run);
  }
  const sumDays = (from: number, n: number) => {
    let t = 0;
    for (let i = from; i < from + n; i++) t += count(addDays(today, -i));
    return t;
  };
  return {
    today: count(today),
    dailyGoal: s.dailyGoal,
    week: sumDays(0, 7),
    weeklyGoal: s.weeklyGoal,
    last7: Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return { day: toDateStr(d), count: count(d) };
    }),
    last8Weeks: Array.from({ length: 8 }, (_, i) => sumDays((7 - i) * 7, 7)),
    streak,
    longest: Math.max(longest, streak),
  };
}

export function Ring({ value, goal, size = 18, stroke = 2.5 }: { value: number; goal: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`ring ${pct >= 1 ? "full" : ""}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-track" />
      {pct > 0 && <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="ring-fill"
      />}
    </svg>
  );
}

export function Productivity({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const s = app.settings();
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const st = productivityStats(app);
  const todayList = app.completedByDay().get(toDateStr(new Date())) ?? [];
  const daily = tab === "daily";
  const value = daily ? st.today : st.week;
  const goal = daily ? st.dailyGoal : st.weeklyGoal;
  const bars = daily ? st.last7.map((d) => d.count) : st.last8Weeks;
  const barGoal = daily ? st.dailyGoal : st.weeklyGoal;
  const max = Math.max(barGoal, ...bars, 1);
  const labels = daily
    ? st.last7.map((d) => new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: "short" }))
    : st.last8Weeks.map((_, i) => (i === 7 ? "This wk" : `−${7 - i}w`));
  const left = Math.max(0, goal - value);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal productivity" onMouseDown={(e) => e.stopPropagation()}>
        <div className="prod-head">
          <h2>Productivity</h2>
          <div className="segmented">
            <button className={daily ? "on" : ""} onClick={() => setTab("daily")}>
              Daily
            </button>
            <button className={!daily ? "on" : ""} onClick={() => setTab("weekly")}>
              Weekly
            </button>
          </div>
          <span className="grow" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="prod-hero">
          <div className="prod-ring">
            <Ring value={value} goal={goal} size={112} stroke={9} />
            <div className="prod-ring-label">
              <b>{value}</b>
              <span>of {goal}</span>
            </div>
          </div>
          <div className="prod-copy">
            <h3>{left ? `${left} more to reach your ${daily ? "daily" : "weekly"} goal` : `${daily ? "Daily" : "Weekly"} goal reached`}</h3>
            <p className="muted">
              {daily ? "Tasks completed today" : "Tasks completed in the last 7 days"}, including each round of a repeating task.
            </p>
            <div className="prod-streaks">
              <div>
                <b>{st.streak}</b>
                <span>day streak</span>
              </div>
              <div>
                <b>{st.longest}</b>
                <span>longest</span>
              </div>
            </div>
          </div>
        </div>

        <div className="prod-chart" style={{ "--goal-frac": barGoal / max } as React.CSSProperties}>
          {bars.map((n, i) => (
            <div key={i} className="prod-bar-col">
              <div className="prod-bar-track">
                <div className={`prod-bar ${n === 0 ? "zero" : n >= barGoal ? "met" : ""} ${i === bars.length - 1 && n ? "now" : ""}`} style={{ height: `${(n / max) * 100}%` }}>
                  {n > 0 && <span>{n}</span>}
                </div>
              </div>
              <span className="prod-bar-label">{labels[i]}</span>
            </div>
          ))}
        </div>

        {daily && (
          <div className="prod-list">
            <h4>Completed today</h4>
            {todayList.length ? (
              todayList
                .slice()
                .reverse()
                .map((c, i) => (
                  <div key={`${c.id}${i}`} className="prod-item">
                    <span className="check done p4">
                      <span>✓</span>
                    </span>
                    <span className="grow">{c.title}</span>
                    <span className="muted small">{app.projectName(c.projectId) ?? "Inbox"}</span>
                  </div>
                ))
            ) : (
              <p className="muted small">Nothing yet. Press E on a task to complete it.</p>
            )}
          </div>
        )}

        <div className="prod-foot">
          <label>
            Daily goal
            <input
              type="number"
              min={0}
              max={99}
              value={s.dailyGoal}
              onChange={(e) => app.updateSettings({ dailyGoal: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
            />
          </label>
          <label>
            Weekly goal
            <input
              type="number"
              min={0}
              max={999}
              value={s.weeklyGoal}
              onChange={(e) => app.updateSettings({ weeklyGoal: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })}
            />
          </label>
          <span className="grow" />
          <span className="muted small">Days off</span>
          <div className="days-off">
            {DAY_LETTERS.map((l, d) => (
              <button
                key={d}
                className={s.daysOff.includes(d) ? "on" : ""}
                onClick={() => app.updateSettings({ daysOff: s.daysOff.includes(d) ? s.daysOff.filter((x) => x !== d) : [...s.daysOff, d] })}
                title={s.daysOff.includes(d) ? "Day off — doesn't break a streak" : "Working day"}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

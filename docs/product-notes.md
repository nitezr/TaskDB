# TaskDB product notes: what we took from Todoist and Things 3

TaskDB competes on speed and taste for people who keep their life in Notion. The bar is Things 3 for feel and Todoist for power. This file records what we borrowed, what we skipped, and why.

## Built

### From Todoist
| Feature | Where | Why it matters |
|---|---|---|
| Deadlines (`{oct 5}`) separate from due dates | Quick add, row flag, details, date picker, filters, sort | "When I'll do it" vs "when it must be done" is the most requested planning distinction. |
| Durations (`for 45m`) | Quick add, rows, details, calendar block height | Makes the calendar a real time-blocking view. |
| Advanced repeats: `every!`, `every 15th`, `every last day`, `every 1st mon`, `every jan 15`, `until …` | Quick add, completion | Covers bills, reviews and chores that simple "every week" can't. |
| Skip an occurrence | Task menu | Move a repeating task on without marking it done. |
| Scheduler popover | `S`, task menu, details | Typed dates, quick options with weekday hints, a month grid with a dot per day showing how busy it already is, time and duration. |
| Multi-select and a bulk toolbar | ⌘/⇧-click, `X`, ⇧↑↓ | Triage many tasks at once. |
| Productivity | `O`, sidebar ring | Daily and weekly goals, streaks, days off, charts. The completion log keeps each round of a repeating task, which Notion alone can't. |
| `/Section` in quick add; paste a list to add many | Quick add | Faster capture. |
| Highlighted tokens while typing | Quick add | You see exactly what was understood. |
| Themes | Settings, palette | Todoist's set (Classic, Moonstone, Tangerine, Kale, Blueberry, Lavender, Raspberry), plus Graphite, Sand, Nord, Solarized and a true-black Midnight. |
| Import from Todoist CSV | Settings › Import, palette | Removes the biggest barrier to switching. |
| Copy link (⌘⇧C), Open in Notion, Duplicate (⌘D) | Task menu | Links to the Notion page. |

### From Things 3
| Feature | Where | Why |
|---|---|---|
| Deadline countdown flag ("3 days left", red when due) | Rows | Calm until it matters. |
| Deadline tasks appear in Today when due | Today | Nothing with a deadline slips. |
| Project progress ring and % done | Project title bar | A sense of progress. |
| Future repeats shown faded in Upcoming | Upcoming | You can see what's coming without clutter. |
| Space adds a task next to the selection | Keyboard | Things' fastest capture gesture. |
| ⌥↑/⌥↓ reorder | Keyboard | Reordering without the mouse switches the view to manual order, as in Todoist. |
| Dock badge with Today's count | Dock (setting) | Glanceable. |

### Second batch
- **This Evening and Someday (Things):** a When property, an evening group at the bottom of Today, and a Someday list in the sidebar kept out of the Inbox. Set them with ⇧E / ⇧S, "this evening" / "someday" in quick add, or the task menu.
- **Markdown descriptions:** lists, checklists you can tick, bold, code and clickable links; rows show a clean preview.
- **Relative reminders:** "15 min before", "Day before, 9 AM" and so on. A reminder keeps its distance from the date when the task moves.
- **⌘F:** find within the current view.
- **Project notes (Things):** notes shown under the project title, stored in Notion.
- **Quick add destination picker:** choose a project or section without typing #.

### Settings added
- Theme
- Density: comfortable or compact
- Week starts Sunday or Monday
- View to open on
- Dock badge
- Daily and weekly goals
- Days off

## Deliberately not built (yet)
- **Karma points and levels.** Gamification that doesn't suit a calm, premium tool. Goals and streaks give most of the motivation.
- **Comments and activity log.** TaskDB is single-player and descriptions cover notes.
- **Calendar events inline.** Needs a calendar integration. A strong v2 item (EventKit through Tauri).
- **Type Travel (typing jumps to a list).** Conflicts with single-key shortcuts; ⌘K covers it.
- **Location reminders, share extension, Siri, Shortcuts.** Need native macOS extensions. Revisit once the app is signed and notarized.

## Next candidates
1. Calendar events next to tasks in Today and the calendar (EventKit).
3. Menu-bar mini window listing today's tasks, with quick complete.
4. Several reminders per task.

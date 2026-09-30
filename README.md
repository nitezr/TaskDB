# TaskDB

Todoist-style task manager for macOS that keeps every task in your own Notion workspace.

- **List, Board and Calendar** for every view; the Display menu sets layout, grouping, sorting and filters, remembered per view
- **Board columns** by day, section, priority, label or project; drag cards between them; reschedule all overdue in one step
- **Calendar**: day, 3-day, week and month; drag a task to a day or hour; sleeping hours hidden
- **Quick add in one line**: `Call Priya tomorrow 5pm p1 #Work @waiting +Priya every mon`, with #, @ and + autocomplete
- **Projects** with emoji, colours, nesting, favourites, sections and templates
- **Details panel**: title, notes, project, section, date/time, repeat, priority, labels, person; step through tasks with ↑/↓
- **Keyboard-first**: every action is one key and remappable; ⌘K palette; ⌘Z undo; ⌘[ ⌘] back/forward
- **Filters & Labels**: saved filters with live counts; rename or remove a label everywhere
- Recurring tasks, reminders, global quick-add hotkey (⌘⇧Space), welcome tour with a practice project, dark mode
- Local-first sync designed around Notion's rate limit — see [SPEC.md](SPEC.md)

## Try it

**Browser demo (fake Notion, sample data):**

```bash
npm install
npm run dev        # open http://localhost:1420
```

**Desktop app (real Notion):**

```bash
npm run tauri dev
```

## Install the test DMG

Every push builds a DMG in GitHub Actions → **Build macOS DMG** → artifact **TaskDB-macOS**.

The build is not notarized yet (no Apple Developer account), so macOS blocks it the first time:

1. Open the DMG and drag **TaskDB** to Applications.
2. Double-click TaskDB. When macOS says it can't verify the developer, click **Done**.
3. Open **System Settings → Privacy & Security**, scroll down, click **Open Anyway**.

If macOS says the app is "damaged", run `xattr -cr /Applications/TaskDB.app` once in Terminal.

## Development

```bash
npm test           # sync engine, quick-add parser, recurrence, filters
npm run typecheck
```

| Path | What |
|---|---|
| `src/sync` | Rate limiter, outbox, sync engine, poll scheduler |
| `src/notion` | Notion API client, property mapping, database setup |
| `src/core` | Quick-add parser, recurrence, filter language, dates |
| `src/app` | React UI and the controller it talks to |
| `src-tauri` | macOS shell: Keychain, menu bar, notifications, hotkey |

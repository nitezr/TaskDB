# TaskDB

Todoist-style task manager for macOS that keeps every task in your own Notion workspace.

- Quick add in plain language: `Call Ravi tomorrow 5pm #Sales +Ravi @urgent p1 every mon`
- Inbox, Today, Upcoming, Projects, Labels, People, saved Filters
- Sub-tasks, recurring tasks, reminders, global quick-add hotkey (⌘⇧Space), dark mode
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

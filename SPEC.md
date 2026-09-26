# TaskDB — Product Spec (v1)

Todoist-style desktop app for solo Notion users. All task data lives in the buyer's own Notion workspace.
Sold as a yearly license. Nothing is hosted by the seller.

## Decisions (from interview, 2026-09-26)

| Area | Decision |
|---|---|
| Delivery | Tauri desktop app (small, native, fast) |
| OS at launch | macOS only (Windows/Linux later — same codebase) |
| Mobile | v2. Until then, use Notion mobile |
| Hosting | None. App talks to Notion API and Lemon Squeezy directly |
| Buyer | Solo Notion users |
| Pricing | Pay once per year; renew for next year |
| Store | Lemon Squeezy (subscriptions, license keys, VAT) |
| Hierarchy | Project → Task → Sub-task |
| People | Single-select property on Task |
| Notion setup | App auto-creates the databases on first run |
| Name | TBD — see candidates below |

## v1 features

- Natural-language quick add: `Call Ravi tomorrow 5pm #Sales +Ravi @urgent p1 every mon`
- Views: Inbox, Today (incl. overdue), Upcoming, per-Project
- Labels (multi-select), People (select), Priority p1–p4
- Saved Filters (e.g. `p1 & today`, `@waiting & +Ravi`)
- Recurring tasks (the app creates the next task when one is completed)
- Sub-tasks (Notion "Parent item" self-relation)
- Keyboard shortcuts (q add, e complete, t today, / search, etc.)
- Global quick-add hotkey (works system-wide)
- Desktop reminders (native notifications; app stays in the menu bar)
- Two-way sync (polls Notion; edits made in Notion appear in the app)
- Dark mode + accent themes

## Architecture

- **Frontend:** React + TypeScript + Tailwind, running inside Tauri
- **Backend (local):** Rust layer in Tauri. Calls the Notion API (no CORS issue) and caches data in a local SQLite database
- **Notion auth:** the buyer creates an internal integration and pastes its token
  - Public OAuth would need a server (client secret + redirect), so it's excluded
  - Token is stored in the macOS Keychain
- **Setup flow:** paste token → share one parent page with the integration → app creates the Tasks, Projects and Filters databases
- **Sync:** local-first. Writes are queued; the app polls `last_edited_time` every ~10s and on focus; stays under Notion's ~3 requests/sec limit
- **License:** Lemon Squeezy License API (activate / validate)
  - Checked at launch and daily
  - 7-day offline grace period
  - Read-only mode after the license expires. Data stays safe in Notion
- **Updates:** Tauri updater. Update files are hosted on GitHub Releases (free, not your server)
- **Distribution:** signed and notarized `.dmg` (needs an Apple Developer account, $99/yr)

## Notion schema (auto-created)

**Tasks**
- Name (title)
- Done (checkbox)
- Due (date)
- Priority (select p1–p4)
- Project (relation → Projects)
- Labels (multi-select)
- Person (select)
- Recurrence (text)
- Parent item / Sub-items (self-relation)
- Reminder (date)
- Order (number)
- Completed at (date)

**Projects**
- Name
- Color (select)
- Archived (checkbox)
- Order (number)
- Tasks (relation)

**Filters**
- Name
- Query (text)
- Order (number)

## Name candidates (not yet checked for domain/trademark)

Rule: avoid "Notion" in the name. Notion's brand guidelines restrict it.

1. **Ordo**
2. **Taskloom**
3. **Tickwise**
4. **Dosync**
5. **Nudgely**

## Open items

- [ ] Pick a name
- [ ] Set yearly price (suggested: $39/yr)
- [ ] Apple Developer account ($99/yr)
- [ ] Lemon Squeezy store + product setup

## Build plan

1. Scaffold Tauri + React; Notion client; auto-create schema
2. Local cache + sync engine
3. Views: Inbox/Today/Upcoming/Project; task editor; sub-tasks
4. Quick-add parser; labels/people/priority; filters
5. Recurrence; reminders; global hotkey; menu bar
6. Themes; keyboard shortcuts; onboarding wizard
7. Lemon Squeezy licensing; signing/notarization; auto-update
8. Landing page copy + Lemon Squeezy listing

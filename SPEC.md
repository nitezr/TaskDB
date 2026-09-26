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
| Pricing | $29/year, 14-day free trial; renew each year |
| Store | Lemon Squeezy (subscriptions, license keys, VAT) |
| Signing | Phase 1: ad-hoc signed test DMG. Apple Developer account ($99/yr) before public launch |
| Hierarchy | Project → Task → Sub-task |
| People | Single-select property on Task |
| Notion setup | App auto-creates the databases on first run |
| Name | TaskDB |

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
- **Sync engine:** TypeScript. Calls Notion through the Tauri HTTP plugin (no CORS issue) and caches data in local SQLite (tauri-plugin-sql)
- **Notion auth:** the buyer creates an internal integration and pastes its token
  - Public OAuth would need a server (client secret + redirect), so it's excluded
  - Token is stored in the macOS Keychain
- **Setup flow:** paste token → share one parent page with the integration → app creates the Tasks and Projects databases
- **Sync:** local-first, designed around Notion's rate limit — see next section
- **License:** Lemon Squeezy License API (activate / validate)
  - Checked at launch and daily
  - 7-day offline grace period
  - Read-only mode after the license expires. Data stays safe in Notion
- **Updates:** Tauri updater. Update files are hosted on GitHub Releases (free, not your server)
- **Distribution:**
  - Now: ad-hoc signed `.dmg` built by GitHub Actions (`.github/workflows/build-macos.yml`) for testing
  - Launch: signed and notarized `.dmg` (needs an Apple Developer account, $99/yr)
- **Trial:** 14 days from first connect, no card needed; after that a Lemon Squeezy key is required (read-only without one)

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

Saved filters, extra People and settings are kept locally (not in Notion) in v1.

## Sync & rate-limit design

Notion allows ~3 requests/sec per integration, and each call takes 0.5–2s. The design assumes this from day one.

- **Local copy is the source for the UI:** the app opens instantly and works offline. Code: `src/store`
- **Optimistic writes:** the local copy and the screen update at once, and the change is queued in a saved outbox
- **Coalescing:** repeated edits to one task are merged into a single request, and a task created then deleted offline costs 0 requests. Code: `src/sync/outbox.ts`
- **One shared pacer:** a token bucket at 2.5 req/s (burst 3) covers every Notion call
  - On a 429, the app pauses everyone for the Retry-After window
  - It retries 5xx/network errors with backoff and never retries validation errors
  - Code: `src/sync/rateLimiter.ts`, `src/notion/client.ts`
- **Delta pull:** one query filtered by `last_edited_time` fetches only what changed
  - An idle workspace costs 1 request per poll, however many tasks it has
  - It looks back 2 min because Notion rounds timestamps to the minute
- **Adaptive polling:** every 15s when the window is focused, 2 min in the background, 5 min when the user is idle, plus an immediate pull on focus. Code: `src/sync/scheduler.ts`
- **Reconcile pass:** a full scan at launch and every 30 min catches pages deleted in Notion, which delta queries don't return
- **Conflicts:** local edits that haven't been sent win until they're pushed; otherwise the newer version wins
- **Budget:** focused polling ≈ 4 req/min, about 2% of the limit. A 1,000-task first sync takes 10 requests (~4s)

**Webhooks: not used.**
- Notion webhooks need a public server to receive them, which conflicts with "no hosting"
- Delta polling gets close to real-time at a fraction of the rate limit

## Open items

- [x] Name: TaskDB
- [x] Price: $29/yr with 14-day trial
- [ ] Apple Developer account ($99/yr) — after DMG testing
- [ ] First live test against a real Notion workspace (database-creation request shape unverified)
- [ ] Lemon Squeezy store + product setup

## Build plan

1. ✅ Sync engine: rate limiter, outbox, delta pull, reconcile (17 tests)
2. ✅ Tauri + React scaffold; SQLite store; auto-create schema
3. ✅ Views: Inbox/Today/Upcoming/Project; task editor; sub-tasks
4. ✅ Quick-add parser; labels/people/priority; filters
5. ✅ Recurrence; reminders; global hotkey; menu bar
6. ✅ Themes; keyboard shortcuts; onboarding wizard
7. Lemon Squeezy licensing + 14-day trial; signing/notarization; auto-update
8. Landing page copy + Lemon Squeezy listing

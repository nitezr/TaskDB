# TaskDB launch checklist

## 1. Lemon Squeezy product

Create in Lemon Squeezy → Store → Products → New product:

| Field | Value |
|---|---|
| Name | TaskDB for Mac |
| Pricing | Subscription · $29 · yearly |
| Free trial | None in Lemon Squeezy — the app has its own 14-day, no-card trial |
| License keys | On · activation limit **2** · key length default |
| License expiry | Follows the subscription (key expires if the subscription lapses) |
| File | Attach the notarized `TaskDB_x.y.z_universal.dmg` |

Then in GitHub → repo → Settings → Secrets and variables → Actions → **Variables**:

| Variable | Where to find it |
|---|---|
| `LS_STORE_ID` | Lemon Squeezy → Settings → Stores (number in the store URL/API) |
| `LS_PRODUCT_ID` | Product page → ⋯ → Copy ID |
| `LS_CHECKOUT_URL` | Product page → Share → checkout link |

The next DMG build picks them up. Without them the app accepts keys from any Lemon Squeezy product (fine for testing only).

## 2. Product listing copy

**Title:** TaskDB — Todoist speed, Notion storage

**Short description:**
A fast Mac to-do app that keeps every task in your own Notion workspace.

**Description:**

TaskDB gives you the quick, keyboard-first task management of Todoist — but every task lives in a Notion database you own.

- **Quick add in plain language:** “Call Ravi tomorrow 5pm #Sales +Ravi @urgent p1”
- **Today, Upcoming, Inbox, Projects** — with overdue tasks where you can see them
- **Recurring tasks** Notion can't do on its own: every weekday, every 2 weeks, every Mon & Thu
- **Labels, people and saved filters** like `p1 & (today | overdue)`
- **⌘⇧Space quick add** from any app, **reminders** as native notifications
- **Instant and offline** — a local copy syncs with Notion in the background
- **Private by design** — no TaskDB servers; your Notion key stays in your Mac's Keychain

$29/year. Try free for 14 days, no card needed. If you stop paying, your tasks stay in Notion.

Requires macOS 11+ and a Notion account (free plan works).

**Thank-you / receipt note:**
Open TaskDB → Settings → License → paste the key from this email. The key works on 2 Macs; use “Deactivate” in Settings to move it.

## 3. Before public launch

- [ ] Apple Developer account ($99/yr) → Developer ID certificate → notarize DMG in CI
- [ ] Test on a real Notion workspace: onboarding, create/edit/complete, edits made in Notion appear in the app
- [ ] Test license: buy with a Lemon Squeezy test-mode card, activate, deactivate, expired subscription → read-only
- [ ] Host `site/index.html` (GitHub Pages or Lemon Squeezy storefront); point “Download” at the DMG
- [ ] Check the “Todoist” comparison wording is fine for your market (the site carries a non-affiliation note)

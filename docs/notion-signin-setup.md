# Set up "Connect with Notion" (one-time, ~15 minutes)

Buyers get a one-click **Connect with Notion** button instead of copying a secret.
A free Cloudflare Worker (`worker/auth.js`) holds TaskDB's Notion secret. Cost: $0.

## 1. Deploy the worker

```bash
cd worker
npx wrangler login      # opens the browser; free Cloudflare account
npx wrangler deploy
```

It prints a URL like `https://taskdb-auth.<your-name>.workers.dev`. Keep it.

## 2. Create TaskDB's public Notion integration

1. Open **notion.so/profile/integrations** → **New integration** → type **Public**.
2. Fill in:
   - **Name:** TaskDB, plus the logo (`app-icon.svg`)
   - **Redirect URI:** `https://taskdb-auth.<your-name>.workers.dev/callback`
   - **Website / Privacy policy / Terms:** your landing page, plus `site/privacy.html` and `site/terms.html` once hosted
   - **Capabilities:** Read content, Update content, Insert content
3. **Optional, but recommended:** under **Notion URL for optional template**, paste the link of a public Notion page (an empty page titled "TaskDB" shared to the web).
   - During sign-in, Notion copies it into the buyer's workspace.
   - TaskDB then builds its databases inside the copy, so the buyer never picks a page.
4. Save. Copy the **OAuth client ID** and **OAuth client secret**.

## 3. Give the worker the keys

```bash
cd worker
# Put the client ID in wrangler.toml (NOTION_CLIENT_ID), then:
npx wrangler secret put NOTION_CLIENT_SECRET   # paste the secret when asked
npx wrangler deploy
```

## 4. Turn it on in the app

GitHub → repo → Settings → Secrets and variables → Actions → **Variables** → New:

| Name | Value |
|---|---|
| `NOTION_AUTH_URL` | `https://taskdb-auth.<your-name>.workers.dev` |

The next DMG build shows **Connect with Notion**. Without this variable the app falls back to the paste-secret flow.

## How it stays safe

- The Notion client secret lives only in Cloudflare, never in the app.
- The worker only hands tokens to `127.0.0.1` (the buyer's own Mac). The app opens a one-time local listener for this, and it expires after 10 minutes.
- Each sign-in carries a random `state` value, and the app ignores any reply that doesn't match it.

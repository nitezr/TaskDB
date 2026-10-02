# TaskDB: working agreement

## Feedback and releases
- When the owner gives feedback or asks for a change, ask first: **"Fix now, or note it for the next release?"** Default to noting it.
- Noted items go into the owner's Notion **TaskDB Tasks** database as tasks with Project = **TaskDB** (a page in the 📦 Products database, id `3ed97467-6b9b-81ad-a09d-efc05e401dd7`). Title prefix: `Bug:`, `Idea:`, `Chore:` or `Decide:`; label `claude`.
- Fix now only when the owner says so, or when the app is broken for daily use.
- A release happens when the owner says "release" (once or twice a week): fix every open task in the TaskDB project, bump the version, build the DMG on demand, and send the run link plus a short "what changed" list.

## Versions
- 0.2, 0.3, … one per release; 0.2.1 for an urgent fix between releases; 1.0 at public launch.
- Bump `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` together.

## Builds
- The macOS DMG builds only on demand (Actions › Build macOS DMG › Run workflow on branch `claude/nifty-franklin-wnwwbq`) or for a `v*` tag. Mac minutes are 10× on a private repo, so don't build on every push.
- Before a push: `npm run typecheck` and `npm test`.

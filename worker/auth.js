/**
 * TaskDB Notion sign-in — Cloudflare Worker.
 *
 * Holds the Notion OAuth client secret so it never ships inside the app.
 * Flow: app opens /start → Notion consent → /callback exchanges the code →
 * redirects to the app's one-time listener on 127.0.0.1 with the token.
 *
 * Env: NOTION_CLIENT_ID (var), NOTION_CLIENT_SECRET (secret).
 */

// "<port>.<random>" — the app encodes its loopback port in the OAuth state.
const STATE_RE = /^(\d{4,5})\.[A-Za-z0-9_-]{16,128}$/;

export async function handle(request, env, fetchFn = fetch) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/callback`;

  if (url.pathname === "/start") {
    const state = url.searchParams.get("state") ?? "";
    if (!STATE_RE.test(state)) return text("Invalid request", 400);
    const auth = new URL("https://api.notion.com/v1/oauth/authorize");
    auth.searchParams.set("client_id", env.NOTION_CLIENT_ID);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("owner", "user");
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("state", state);
    return Response.redirect(auth.toString(), 302);
  }

  if (url.pathname === "/callback") {
    const state = url.searchParams.get("state") ?? "";
    const match = STATE_RE.exec(state);
    // Only ever hand results to a loopback listener on this same machine.
    if (!match) return text("Invalid request", 400);
    const back = new URL(`http://127.0.0.1:${match[1]}/callback`);
    back.searchParams.set("state", state);

    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (error || !code) {
      back.searchParams.set("error", error ?? "missing_code");
      return Response.redirect(back.toString(), 302);
    }

    const res = await fetchFn("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`,
        "Content-Type": "application/json",
        "Notion-Version": "2025-09-03",
      },
      body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      back.searchParams.set("error", data.error ?? `token_exchange_${res.status}`);
      return Response.redirect(back.toString(), 302);
    }
    back.searchParams.set("token", data.access_token);
    if (data.duplicated_template_id) back.searchParams.set("template", data.duplicated_template_id);
    if (data.workspace_name) back.searchParams.set("workspace", data.workspace_name);
    return Response.redirect(back.toString(), 302);
  }

  return text("TaskDB sign-in service", 200);
}

function text(body, status) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export default { fetch: (request, env) => handle(request, env) };

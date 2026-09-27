import { describe, expect, it } from "vitest";
import { handle } from "./auth.js";

const env = { NOTION_CLIENT_ID: "cid", NOTION_CLIENT_SECRET: "shh" };
const STATE = "53123.abcdefghijklmnop";
const req = (path) => new Request(`https://auth.example.dev${path}`);

describe("auth worker", () => {
  it("sends the user to Notion's consent screen", async () => {
    const res = await handle(req(`/start?state=${STATE}`), env);
    const loc = new URL(res.headers.get("Location"));
    expect(loc.origin + loc.pathname).toBe("https://api.notion.com/v1/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("cid");
    expect(loc.searchParams.get("redirect_uri")).toBe("https://auth.example.dev/callback");
    expect(loc.searchParams.get("state")).toBe(STATE);
  });

  it("exchanges the code and returns the token to the local app only", async () => {
    let sent;
    const fetchFn = async (url, init) => {
      sent = { url, init };
      return new Response(JSON.stringify({ access_token: "ntn_tok", duplicated_template_id: "tpl", workspace_name: "Home" }));
    };
    const res = await handle(req(`/callback?code=abc&state=${STATE}`), env, fetchFn);
    const loc = new URL(res.headers.get("Location"));
    expect(loc.origin).toBe("http://127.0.0.1:53123");
    expect(loc.searchParams.get("token")).toBe("ntn_tok");
    expect(loc.searchParams.get("template")).toBe("tpl");
    expect(sent.init.headers.Authorization).toBe(`Basic ${btoa("cid:shh")}`);
    expect(JSON.parse(sent.init.body)).toMatchObject({ code: "abc", redirect_uri: "https://auth.example.dev/callback" });
  });

  it("passes a denied consent back as an error", async () => {
    const res = await handle(req(`/callback?error=access_denied&state=${STATE}`), env);
    expect(new URL(res.headers.get("Location")).searchParams.get("error")).toBe("access_denied");
  });

  it("refuses states that could redirect anywhere else", async () => {
    for (const bad of ["evil.com.abcdefghijklmnop", "80.short", "", "53123.abc/../x"]) {
      expect((await handle(req(`/callback?code=x&state=${encodeURIComponent(bad)}`), env)).status).toBe(400);
    }
  });
});

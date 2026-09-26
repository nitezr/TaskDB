import { describe, expect, it } from "vitest";
import { computeState, LemonSqueezy, LicenseError, type LicenseRecord } from "./license";

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");

const rec = (f: Partial<LicenseRecord> = {}): LicenseRecord => ({
  key: "KEY",
  instanceId: "inst",
  status: "active",
  expiresAt: "2027-09-01T00:00:00Z",
  lastValidatedAt: T0,
  ...f,
});

describe("computeState", () => {
  it("counts down the 14-day trial", () => {
    expect(computeState(T0, null, T0)).toEqual({ kind: "trial", daysLeft: 14 });
    expect(computeState(T0, null, T0 + 13.5 * DAY)).toEqual({ kind: "trial", daysLeft: 1 });
    expect(computeState(T0, null, T0 + 14 * DAY)).toEqual({ kind: "expired", reason: "trial" });
  });

  it("is licensed while validated recently", () => {
    expect(computeState(T0, rec(), T0 + DAY)).toEqual({ kind: "licensed", expiresAt: "2027-09-01T00:00:00Z" });
  });

  it("expires when the yearly term ends or Lemon Squeezy says so", () => {
    expect(computeState(T0, rec({ expiresAt: "2026-09-02T00:00:00Z" }), T0 + 2 * DAY).kind).toBe("expired");
    expect(computeState(T0, rec({ status: "expired" }), T0)).toEqual({ kind: "expired", reason: "license" });
  });

  it("allows a 7-day offline grace period", () => {
    expect(computeState(T0, rec(), T0 + 3 * DAY)).toEqual({ kind: "offline", daysLeft: 4 });
    expect(computeState(T0, rec(), T0 + 7 * DAY)).toEqual({ kind: "expired", reason: "offline" });
  });
});

function fakeLs(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; body: string }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  return { ls: new LemonSqueezy(fetchFn), calls };
}

describe("LemonSqueezy", () => {
  it("activates a key", async () => {
    const { ls, calls } = fakeLs([
      {
        status: 200,
        body: {
          activated: true,
          license_key: { status: "active", expires_at: "2027-09-26T00:00:00Z" },
          instance: { id: "i-1" },
          meta: { store_id: 1, product_id: 2 },
        },
      },
    ]);
    const r = await ls.activate(" KEY-1 ", "Test Mac", T0);
    expect(r).toEqual({ key: "KEY-1", instanceId: "i-1", status: "active", expiresAt: "2027-09-26T00:00:00Z", lastValidatedAt: T0 });
    expect(calls[0]!.url).toMatch(/licenses\/activate$/);
    expect(calls[0]!.body).toContain("license_key=KEY-1");
  });

  it("reports a bad key as definitive", async () => {
    const { ls } = fakeLs([{ status: 404, body: { activated: false, error: "license_key not found." } }]);
    await expect(ls.activate("NOPE", "Mac")).rejects.toMatchObject({ definitive: true, message: "license_key not found." });
  });

  it("reports outages as non-definitive", async () => {
    const { ls } = fakeLs([{ status: 503, body: {} }]);
    const err = await ls.validate(rec()).catch((e) => e);
    expect(err).toBeInstanceOf(LicenseError);
    expect(err.definitive).toBe(false);
  });

  it("marks a revoked key as disabled", async () => {
    const { ls } = fakeLs([{ status: 200, body: { valid: false, license_key: { status: "active", expires_at: null } } }]);
    expect((await ls.validate(rec(), T0)).status).toBe("disabled");
  });
});

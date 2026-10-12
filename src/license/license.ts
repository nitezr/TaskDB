import type { FetchLike } from "../notion/client";

export const TRIAL_DAYS = 14;
/** How long TaskDB keeps working without reaching Lemon Squeezy. */
export const OFFLINE_GRACE_DAYS = 7;
/** Re-validate a stored key at most this often. */
export const VALIDATE_EVERY_MS = 24 * 3_600_000;
const DAY = 86_400_000;

/** Set at build time; empty in dev, which skips the store/product check. */
export const LS_STORE_ID = Number(import.meta.env?.VITE_LS_STORE_ID || 0);
export const LS_PRODUCT_ID = Number(import.meta.env?.VITE_LS_PRODUCT_ID || 0);
export const CHECKOUT_URL: string = import.meta.env?.VITE_LS_CHECKOUT_URL || "https://taskdb.lemonsqueezy.com";

export interface LicenseRecord {
  key: string;
  instanceId: string;
  status: "active" | "inactive" | "expired" | "disabled";
  expiresAt: string | null;
  lastValidatedAt: number;
}

export type LicenseState =
  | { kind: "trial"; daysLeft: number }
  | { kind: "licensed"; expiresAt: string | null }
  | { kind: "offline"; daysLeft: number }
  | { kind: "expired"; reason: "trial" | "license" | "offline" };

/**
 * SHA-256 of the owner's key. It unlocks TaskDB without Lemon Squeezy (for the developer's own
 * Macs and before the store exists); only the hash ships, so the key can't be read from the app.
 */
const OWNER_KEY_SHA256 = "6ba725146f89e4f82a0a5dfd96dedcdc4ab13c091c3ec27f46e5db694d7c6717";
export const OWNER_INSTANCE = "owner";

export async function isOwnerKey(key: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(key.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === OWNER_KEY_SHA256;
}

export function computeState(trialStartedAt: number, license: LicenseRecord | null, now: number): LicenseState {
  if (license?.instanceId === OWNER_INSTANCE) return { kind: "licensed", expiresAt: null };
  if (license) {
    const lapsed = license.expiresAt !== null && Date.parse(license.expiresAt) <= now;
    if (license.status === "expired" || license.status === "disabled" || lapsed) return { kind: "expired", reason: "license" };
    const sinceCheck = now - license.lastValidatedAt;
    if (sinceCheck <= VALIDATE_EVERY_MS * 2) return { kind: "licensed", expiresAt: license.expiresAt };
    const daysLeft = OFFLINE_GRACE_DAYS - Math.floor(sinceCheck / DAY);
    return daysLeft > 0 ? { kind: "offline", daysLeft } : { kind: "expired", reason: "offline" };
  }
  const daysLeft = TRIAL_DAYS - Math.floor((now - trialStartedAt) / DAY);
  return daysLeft > 0 ? { kind: "trial", daysLeft } : { kind: "expired", reason: "trial" };
}

export const canEdit = (s: LicenseState) => s.kind !== "expired";

export class LicenseError extends Error {
  /** False when the key itself is fine but Lemon Squeezy couldn't be reached. */
  constructor(
    message: string,
    readonly definitive: boolean,
  ) {
    super(message);
  }
}

interface LsResponse {
  activated?: boolean;
  valid?: boolean;
  error?: string | null;
  license_key?: { status: LicenseRecord["status"]; expires_at: string | null };
  instance?: { id: string } | null;
  meta?: { store_id: number; product_id: number };
}

/**
 * Lemon Squeezy License API. These endpoints need no API key, so the app
 * talks to Lemon Squeezy directly and nothing is hosted by the seller.
 */
export class LemonSqueezy {
  constructor(private readonly fetchFn: FetchLike) {}

  async activate(key: string, instanceName: string, now = Date.now()): Promise<LicenseRecord> {
    const res = await this.call("activate", { license_key: key.trim(), instance_name: instanceName });
    if (!res.activated || !res.instance || !res.license_key) {
      throw new LicenseError(res.error ?? "This key could not be activated.", true);
    }
    this.checkProduct(res);
    return {
      key: key.trim(),
      instanceId: res.instance.id,
      status: res.license_key.status,
      expiresAt: res.license_key.expires_at,
      lastValidatedAt: now,
    };
  }

  /** Refreshes status/expiry. Throws LicenseError(definitive=false) when offline. */
  async validate(record: LicenseRecord, now = Date.now()): Promise<LicenseRecord> {
    const res = await this.call("validate", { license_key: record.key, instance_id: record.instanceId });
    if (!res.license_key) throw new LicenseError(res.error ?? "License not found.", true);
    this.checkProduct(res);
    return {
      ...record,
      status: res.valid ? res.license_key.status : res.license_key.status === "active" ? "disabled" : res.license_key.status,
      expiresAt: res.license_key.expires_at,
      lastValidatedAt: now,
    };
  }

  /** Frees the activation slot so the key can move to another Mac. */
  async deactivate(record: LicenseRecord): Promise<void> {
    await this.call("deactivate", { license_key: record.key, instance_id: record.instanceId });
  }

  private checkProduct(res: LsResponse): void {
    if (!LS_STORE_ID || !res.meta) return;
    if (res.meta.store_id !== LS_STORE_ID || (LS_PRODUCT_ID && res.meta.product_id !== LS_PRODUCT_ID)) {
      throw new LicenseError("This key is for a different product.", true);
    }
  }

  private async call(action: string, body: Record<string, string>): Promise<LsResponse> {
    let res: Response;
    try {
      res = await this.fetchFn(`https://api.lemonsqueezy.com/v1/licenses/${action}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
      });
    } catch {
      throw new LicenseError("Couldn't reach Lemon Squeezy. Check your connection.", false);
    }
    const json = (await res.json().catch(() => ({}))) as LsResponse;
    if (res.status >= 500 || res.status === 429) throw new LicenseError("Lemon Squeezy is unavailable right now.", false);
    if (!res.ok && !json.license_key) throw new LicenseError(json.error ?? `License check failed (${res.status}).`, true);
    return json;
  }
}

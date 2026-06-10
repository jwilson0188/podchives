/**
 * Single-user beta gate.
 *
 * One env var controls everything:
 *   BETA_PASSWORD — set in real-mode deploys. If unset, the app is open
 *                   (used for local dev and pure-demo deploys).
 *
 * The session cookie is `sha256(BETA_PASSWORD)` (hex). Anyone holding the
 * cookie is in. If the password rotates, every existing cookie is invalidated.
 *
 * This is intentionally dumb. When real auth ships (Supabase Auth + RLS),
 * `middleware.ts`, `lib/auth.ts`, `app/login`, and `app/api/auth` get deleted
 * and replaced.
 */

export const BETA_COOKIE_NAME = "podchives_beta_session";
export const BETA_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Bytes → lowercase hex (Edge-runtime safe, no Buffer). */
function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < u8.length; i++) {
    out += u8[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Compute the canonical session token for a given password.
 * Edge-runtime-safe — uses Web Crypto, not Node `crypto`.
 */
export async function deriveSessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`podchives-beta-v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Is the gate active? It activates iff `BETA_PASSWORD` is set in the
 * environment. Local dev (no env var) and demo-mode deploys (no env var)
 * remain open.
 */
export function isGateActive(): boolean {
  return Boolean(process.env.BETA_PASSWORD);
}

/**
 * Validate a session cookie value against `BETA_PASSWORD`. Returns true
 * only when the gate is active AND the cookie matches.
 */
export async function validateSessionCookie(
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  const password = process.env.BETA_PASSWORD;
  if (!password) return false;
  const expected = await deriveSessionToken(password);
  return safeEqual(cookieValue, expected);
}

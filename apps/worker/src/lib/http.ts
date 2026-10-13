import type { Context } from "hono";

/** Uniform error body: `{ error, message, ...extra }`. */
export function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 504, error: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ error, message, ...extra }, status);
}

export function clientIp(c: Context): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Lowercase hex SHA-256 of a string. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type BodyResult = { ok: true; json: unknown } | { ok: false; reason: "too_large" | "bad_json" };

/** Read a JSON body, refusing anything over `maxBytes` before parsing it. */
export async function readJsonBody(c: Context, maxBytes: number): Promise<BodyResult> {
  const declared = Number.parseInt(c.req.header("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "bad_json" };
  }
}

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Origins allowed to call the API. Localhost dev origins are only included when
 * PUBLIC_WEB_ORIGIN is unset or itself a localhost origin, so a production
 * deploy does not trust whatever is running on a visitor's machine.
 */
export function allowedOrigins(publicOrigin: string | undefined): string[] {
  const origin = (publicOrigin ?? "").trim();
  if (origin && !LOCAL_ORIGIN.test(origin)) return [origin];
  return [...new Set([origin, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean))];
}

import type { Context } from "hono";

/** Uniform error body: `{ error, message, ...extra }`. */
export function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 504, error: string, message: string, extra: Record<string, unknown> = {}) {
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

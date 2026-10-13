/**
 * Daily quota bookkeeping on KV.
 *
 * Keys:
 *   quota:YYYY-MM-DD           global roast counter
 *   ip:YYYY-MM-DD:<sha256>     per-IP roast counter
 *
 * Counters are stored as plain integers with a ~48h TTL so yesterday's keys
 * vanish on their own. KV is eventually consistent, so the global cap is soft
 * by a handful of requests; that is fine for a free-tier guardrail.
 */

export const KEY_TTL_SECONDS = 48 * 60 * 60;

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function quotaKey(now: Date = new Date()): string {
  return `quota:${utcDay(now)}`;
}

export function ipKey(ipHash: string, now: Date = new Date()): string {
  return `ip:${utcDay(now)}:${ipHash}`;
}

/** Midnight UTC after `now`, as an ISO string. */
export function nextResetIso(now: Date = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`portfolio-roast|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function parseCount(value: string | null): number {
  const n = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export interface QuotaSnapshot {
  used: number;
  limit: number;
  resetsAt: string;
}

export async function readGlobal(kv: KVNamespace, limit: number, now = new Date()): Promise<QuotaSnapshot> {
  const used = parseCount(await kv.get(quotaKey(now)));
  return { used, limit, resetsAt: nextResetIso(now) };
}

export async function readIp(kv: KVNamespace, ipHash: string, now = new Date()): Promise<number> {
  return parseCount(await kv.get(ipKey(ipHash, now)));
}

export async function incrementBoth(kv: KVNamespace, ipHash: string, now = new Date()): Promise<void> {
  const gKey = quotaKey(now);
  const iKey = ipKey(ipHash, now);
  const [g, i] = await Promise.all([kv.get(gKey), kv.get(iKey)]);
  await Promise.all([
    kv.put(gKey, String(parseCount(g) + 1), { expirationTtl: KEY_TTL_SECONDS }),
    kv.put(iKey, String(parseCount(i) + 1), { expirationTtl: KEY_TTL_SECONDS }),
  ]);
}

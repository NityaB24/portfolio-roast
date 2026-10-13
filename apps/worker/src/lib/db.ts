import type { RoastItem, RoastRecord, Signals } from "./schema";

interface Row {
  id: string;
  url: string;
  normalizedUrl: string;
  score: number;
  verdict: string;
  roastsJson: string;
  complimentsJson: string;
  signalsJson: string;
  promptVersion: string;
  blocked: number;
  createdAt: string;
  optInLeaderboard: number;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToRecord(row: Row): RoastRecord {
  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalizedUrl,
    score: row.score,
    verdict: row.verdict,
    roasts: parseJson<RoastItem[]>(row.roastsJson, []),
    compliments: parseJson<string[]>(row.complimentsJson, []),
    signals: parseJson<Signals | null>(row.signalsJson, null),
    promptVersion: row.promptVersion,
    blocked: row.blocked === 1,
    createdAt: row.createdAt,
    optInLeaderboard: row.optInLeaderboard === 1,
  };
}

export async function getById(db: D1Database, id: string): Promise<RoastRecord | null> {
  const row = await db.prepare("SELECT * FROM roasts WHERE id = ?1").bind(id).first<Row>();
  return row ? rowToRecord(row) : null;
}

export async function getFreshByUrl(db: D1Database, normalizedUrl: string, maxAgeMs: number): Promise<RoastRecord | null> {
  const since = new Date(Date.now() - maxAgeMs).toISOString();
  const row = await db
    .prepare("SELECT * FROM roasts WHERE normalizedUrl = ?1 AND createdAt > ?2 ORDER BY createdAt DESC LIMIT 1")
    .bind(normalizedUrl, since)
    .first<Row>();
  return row ? rowToRecord(row) : null;
}

export async function insert(db: D1Database, rec: RoastRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO roasts (id, url, normalizedUrl, score, verdict, roastsJson, complimentsJson, signalsJson, promptVersion, blocked, createdAt, optInLeaderboard)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      rec.id,
      rec.url,
      rec.normalizedUrl,
      rec.score,
      rec.verdict,
      JSON.stringify(rec.roasts),
      JSON.stringify(rec.compliments),
      JSON.stringify(rec.signals),
      rec.promptVersion,
      rec.blocked ? 1 : 0,
      rec.createdAt,
      rec.optInLeaderboard ? 1 : 0,
    )
    .run();
}

export interface LeaderboardEntry {
  id: string;
  normalizedUrl: string;
  domain: string;
  score: number;
  verdict: string;
  createdAt: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Top or bottom N, deduped by normalizedUrl keeping the latest roast per URL.
 * `period` = "week" restricts to the last 7 days.
 */
export async function leaderboard(
  db: D1Database,
  opts: { order: "desc" | "asc"; period: "week" | "all"; limit: number },
): Promise<LeaderboardEntry[]> {
  const since = opts.period === "week" ? new Date(Date.now() - 7 * 86_400_000).toISOString() : "0000";
  const dir = opts.order === "desc" ? "DESC" : "ASC";
  const { results } = await db
    .prepare(
      `WITH latest AS (
         SELECT normalizedUrl, MAX(createdAt) AS createdAt
         FROM roasts
         WHERE optInLeaderboard = 1 AND blocked = 0 AND createdAt > ?1
         GROUP BY normalizedUrl
       )
       SELECT r.id, r.normalizedUrl, r.score, r.verdict, r.createdAt
       FROM roasts r
       JOIN latest l ON l.normalizedUrl = r.normalizedUrl AND l.createdAt = r.createdAt
       WHERE r.optInLeaderboard = 1 AND r.blocked = 0
       ORDER BY r.score ${dir}, r.createdAt DESC
       LIMIT ?2`,
    )
    .bind(since, opts.limit)
    .all<Omit<LeaderboardEntry, "domain">>();
  return results.map((r) => ({ ...r, domain: domainOf(r.normalizedUrl) }));
}

export async function history(db: D1Database, normalizedUrl: string): Promise<Array<{ id: string; score: number; createdAt: string }>> {
  const { results } = await db
    .prepare("SELECT id, score, createdAt FROM roasts WHERE normalizedUrl = ?1 AND optInLeaderboard = 1 ORDER BY createdAt ASC LIMIT 50")
    .bind(normalizedUrl)
    .all<{ id: string; score: number; createdAt: string }>();
  return results;
}

export async function optOut(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("UPDATE roasts SET optInLeaderboard = 0 WHERE id = ?1").bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

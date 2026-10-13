import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { roastWithAI, AIError } from "./ai/groq";
import { blockedRoast, BLOCKED_PROMPT_VERSION } from "./ai/fixture";
import { PROMPT_VERSION } from "./ai/prompt";
import { captureSite, renderHtmlToPng } from "./capture";
import { intVar, type Env } from "./env";
import * as db from "./lib/db";
import { bytesToBase64, clientIp, fail } from "./lib/http";
import * as quota from "./lib/quota";
import type { RoastRecord } from "./lib/schema";
import { GUARD_MESSAGES, guardUrl } from "./lib/url-guard";
import { ogHtml } from "./og";

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SHOT_CACHE = "public, max-age=31536000, immutable";

type AppEnv = { Bindings: Env };
const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const origin = c.env.PUBLIC_WEB_ORIGIN ?? "";
  const allowed = [origin, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean);
  return cors({
    origin: (reqOrigin) => (allowed.includes(reqOrigin) ? reqOrigin : allowed[0] ?? ""),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
    maxAge: 86_400,
  })(c, next);
});

app.onError((err, c) => {
  console.error("unhandled", err);
  return fail(c, 500, "internal", "Something broke on our side. Try again in a minute.");
});

app.notFound((c) => fail(c, 404, "not_found", "No such route."));

app.get("/", (c) => c.json({ name: "portfolio-roast-api", ok: true, promptVersion: PROMPT_VERSION }));

app.get("/api/quota", async (c) => {
  const limit = intVar(c.env.DAILY_QUOTA, 300);
  const snap = await quota.readGlobal(c.env.QUOTA, limit);
  c.header("cache-control", "no-store");
  return c.json(snap);
});

app.post("/api/roast", async (c) => {
  let body: { url?: unknown };
  try {
    body = (await c.req.json()) as { url?: unknown };
  } catch {
    return fail(c, 400, "bad_json", "Body must be JSON: { \"url\": \"https://...\" }");
  }
  if (typeof body.url !== "string") return fail(c, 400, "bad_url", GUARD_MESSAGES.empty);

  const guard = guardUrl(body.url);
  if (!guard.ok) return fail(c, 400, "bad_url", GUARD_MESSAGES[guard.reason], { reason: guard.reason });
  const normalizedUrl = guard.url;

  // 1. Cache hit?
  const cached = await db.getFreshByUrl(c.env.DB, normalizedUrl, CACHE_TTL_MS);
  if (cached) return c.json({ ...cached, cached: true });

  // 2. Quotas (checked before the expensive work, incremented after success).
  const limit = intVar(c.env.DAILY_QUOTA, 300);
  const perIp = intVar(c.env.PER_IP_DAILY, 5);
  const ipHash = await quota.hashIp(clientIp(c));
  const [global, mine] = await Promise.all([quota.readGlobal(c.env.QUOTA, limit), quota.readIp(c.env.QUOTA, ipHash)]);
  if (global.used >= limit) {
    return fail(c, 429, "quota_exhausted", "Today's roasts are all used up. Come back after midnight UTC.", { resetsAt: global.resetsAt });
  }
  if (mine >= perIp) {
    return fail(c, 429, "ip_limit", `You have used your ${perIp} roasts for today.`, { resetsAt: global.resetsAt });
  }

  // 3. Capture + signals.
  const id = nanoid(12);
  const createdAt = new Date().toISOString();
  const shot = await captureSite(c.env, normalizedUrl);

  let record: RoastRecord;
  if (!shot.ok) {
    const r = blockedRoast(normalizedUrl, shot.reason);
    record = {
      id,
      url: body.url,
      normalizedUrl,
      score: 0,
      verdict: r.verdict,
      roasts: r.roasts,
      compliments: r.compliments,
      signals: null,
      promptVersion: BLOCKED_PROMPT_VERSION,
      blocked: true,
      createdAt,
      optInLeaderboard: true,
    };
    await db.insert(c.env.DB, record);
    // Blocked attempts still cost Browser Rendering minutes, so they count.
    await quota.incrementBoth(c.env.QUOTA, ipHash);
    return c.json({ ...record, cached: false, blockedReason: shot.reason });
  }

  // 4. Store screenshots.
  await Promise.all([
    c.env.SHOTS.put(`shots/${id}/desktop.webp`, shot.capture.desktop, { httpMetadata: { contentType: "image/webp" } }),
    c.env.SHOTS.put(`shots/${id}/mobile.webp`, shot.capture.mobile, { httpMetadata: { contentType: "image/webp" } }),
  ]);

  // 5. AI.
  let result;
  try {
    result = await roastWithAI({
      url: normalizedUrl,
      signals: shot.capture.signals,
      desktopDataUrl: `data:image/webp;base64,${bytesToBase64(shot.capture.desktop)}`,
      mobileDataUrl: `data:image/webp;base64,${bytesToBase64(shot.capture.mobile)}`,
      apiKey: c.env.GROQ_API_KEY,
    });
  } catch (err) {
    console.error("ai failed", err);
    if (err instanceof AIError && err.status === 429) {
      return fail(c, 429, "ai_rate_limited", "The critic is out of breath (AI rate limit). Try again in a minute.");
    }
    return fail(c, 502, "ai_failed", "The critic choked on this page. Try again.");
  }

  record = {
    id,
    url: body.url,
    normalizedUrl,
    score: result.score,
    verdict: result.verdict,
    roasts: result.roasts,
    compliments: result.compliments,
    signals: shot.capture.signals,
    promptVersion: PROMPT_VERSION,
    blocked: false,
    createdAt,
    optInLeaderboard: true,
  };
  await db.insert(c.env.DB, record);
  await quota.incrementBoth(c.env.QUOTA, ipHash);
  return c.json({ ...record, cached: false });
});

app.get("/api/roast/:id", async (c) => {
  const rec = await db.getById(c.env.DB, c.req.param("id"));
  if (!rec || !rec.optInLeaderboard) return fail(c, 404, "not_found", "That roast does not exist or was removed.");
  c.header("cache-control", "public, max-age=60");
  return c.json(rec);
});

app.get("/api/shots/:id/:viewport", async (c) => {
  const id = c.req.param("id");
  const vp = c.req.param("viewport").replace(/\.webp$/, "");
  if (vp !== "desktop" && vp !== "mobile") return fail(c, 404, "not_found", "Viewport must be desktop or mobile.");
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return fail(c, 404, "not_found", "Bad id.");
  const rec = await db.getById(c.env.DB, id);
  if (!rec || !rec.optInLeaderboard) return fail(c, 404, "not_found", "Removed.");
  const obj = await c.env.SHOTS.get(`shots/${id}/${vp}.webp`);
  if (!obj) return fail(c, 404, "not_found", "No screenshot stored.");
  return new Response(obj.body, {
    headers: { "content-type": "image/webp", "cache-control": SHOT_CACHE, etag: obj.httpEtag },
  });
});

app.get("/api/top", async (c) => {
  const period = c.req.query("period") === "week" ? "week" : "all";
  const rows = await db.leaderboard(c.env.DB, { order: "desc", period, limit: 50 });
  c.header("cache-control", "public, max-age=120");
  return c.json({ period, entries: rows });
});

app.get("/api/bottom", async (c) => {
  const period = c.req.query("period") === "week" ? "week" : "all";
  const rows = await db.leaderboard(c.env.DB, { order: "asc", period, limit: 50 });
  c.header("cache-control", "public, max-age=120");
  return c.json({ period, entries: rows });
});

app.get("/api/history", async (c) => {
  const raw = c.req.query("url") ?? "";
  const guard = guardUrl(raw);
  if (!guard.ok) return fail(c, 400, "bad_url", GUARD_MESSAGES[guard.reason]);
  const rows = await db.history(c.env.DB, guard.url);
  c.header("cache-control", "no-store");
  return c.json({ normalizedUrl: guard.url, entries: rows });
});

app.post("/api/remove/:id", async (c) => {
  // Intentionally unauthenticated one-click removal. See README "Known limitations".
  const ok = await db.optOut(c.env.DB, c.req.param("id"));
  if (!ok) return fail(c, 404, "not_found", "Nothing to remove.");
  return c.json({ ok: true });
});

app.get("/og/:file", async (c) => {
  const id = c.req.param("file").replace(/\.png$/, "");
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return fail(c, 404, "not_found", "Bad id.");
  const key = `og/${id}.png`;
  const existing = await c.env.SHOTS.get(key);
  if (existing) {
    return new Response(existing.body, { headers: { "content-type": "image/png", "cache-control": SHOT_CACHE } });
  }
  const rec = await db.getById(c.env.DB, id);
  if (!rec || !rec.optInLeaderboard) return fail(c, 404, "not_found", "Removed.");
  const png = await renderHtmlToPng(c.env, ogHtml(rec));
  await c.env.SHOTS.put(key, png, { httpMetadata: { contentType: "image/png" } });
  return new Response(png, { headers: { "content-type": "image/png", "cache-control": SHOT_CACHE } });
});

export default app;

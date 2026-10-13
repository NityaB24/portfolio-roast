import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { roastWithAI, AIError } from "./ai/groq";
import { blockedRoast, BLOCKED_PROMPT_VERSION } from "./ai/fixture";
import { PROMPT_VERSION, promptVersionFor } from "./ai/prompt";
import { captureSite, renderHtmlToPng } from "./capture";
import { intVar, type Env } from "./env";
import * as db from "./lib/db";
import { allowedOrigins, bytesToBase64, clientIp, fail, readJsonBody, sha256Hex } from "./lib/http";
import * as quota from "./lib/quota";
import { RoastModeSchema, type RoastRecord } from "./lib/schema";
import { GUARD_MESSAGES, guardUrl } from "./lib/url-guard";
import { ogHtml } from "./og";

/** Roasts younger than this are served from D1 instead of re-rendered. Not exported: a Worker entry module may only export handlers. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SHOT_CACHE = "public, max-age=31536000, immutable";

type AppEnv = { Bindings: Env };
const app = new Hono<AppEnv>();

const MAX_BODY_BYTES = 4096;
const ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

app.use("*", async (c, next) => {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
});

app.use("*", async (c, next) => {
  const allowed = allowedOrigins(c.env.PUBLIC_WEB_ORIGIN);
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
  const parsedBody = await readJsonBody(c, MAX_BODY_BYTES);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") return fail(c, 413, "too_large", "Request body is too large.");
    return fail(c, 400, "bad_json", "Body must be JSON: { \"url\": \"https://...\", \"mode\": \"brutal\" | \"comedy\" }");
  }
  const body = (parsedBody.json && typeof parsedBody.json === "object" ? parsedBody.json : {}) as { url?: unknown; mode?: unknown };
  if (typeof body.url !== "string") return fail(c, 400, "bad_url", GUARD_MESSAGES.empty);
  const modeParsed = RoastModeSchema.safeParse(body.mode ?? undefined);
  if (!modeParsed.success) return fail(c, 400, "bad_mode", 'mode must be "brutal" or "comedy".');
  const mode = modeParsed.data;

  const guard = guardUrl(body.url);
  if (!guard.ok) return fail(c, 400, "bad_url", GUARD_MESSAGES[guard.reason], { reason: guard.reason });
  const normalizedUrl = guard.url;

  // 1. Cache hit?
  const cached = await db.getFreshByUrl(c.env.DB, normalizedUrl, mode, CACHE_TTL_MS);
  if (cached) return c.json({ ...cached, cached: true });

  // 2. Quotas. Checked, then reserved up front: the expensive work below takes 15-25 s,
  //    and counting only afterwards would let one client fan out parallel requests past the caps.
  const limit = intVar(c.env.DAILY_QUOTA, 300);
  const perIp = intVar(c.env.PER_IP_DAILY, 5);
  const ipHash = await quota.hashIp(clientIp(c));
  if (c.env.ROAST_LIMITER && !(await c.env.ROAST_LIMITER.limit({ key: ipHash })).success) {
    return fail(c, 429, "rate_limited", "Slow down. Try again in a minute.");
  }
  const [global, mine] = await Promise.all([quota.readGlobal(c.env.QUOTA, limit), quota.readIp(c.env.QUOTA, ipHash)]);
  if (global.used >= limit) {
    return fail(c, 429, "quota_exhausted", "Today's roasts are all used up. Come back after midnight UTC.", { resetsAt: global.resetsAt });
  }
  if (mine >= perIp) {
    return fail(c, 429, "ip_limit", `You have used your ${perIp} roasts for today.`, { resetsAt: global.resetsAt });
  }

  await quota.incrementBoth(c.env.QUOTA, ipHash);

  // 3. Capture + signals.
  const id = nanoid(12);
  const removeToken = nanoid(24);
  const removeTokenHash = await sha256Hex(removeToken);
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
      mode,
      blocked: true,
      createdAt,
      optInLeaderboard: true,
    };
    await db.insert(c.env.DB, record, removeTokenHash);
    return c.json({ ...record, cached: false, blockedReason: shot.reason, removeToken });
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
      mode,
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
    promptVersion: promptVersionFor(mode),
    mode,
    blocked: false,
    createdAt,
    optInLeaderboard: true,
  };
  await db.insert(c.env.DB, record, removeTokenHash);
  return c.json({ ...record, cached: false, removeToken });
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
  // Requires the removal token returned once, in the response that created the roast.
  const parsedBody = await readJsonBody(c, 1024);
  const token = parsedBody.ok && parsedBody.json && typeof parsedBody.json === "object" ? (parsedBody.json as { token?: unknown }).token : undefined;
  const id = c.req.param("id");
  if (typeof token !== "string" || token.length < 16 || token.length > 64 || !ID_PATTERN.test(id)) {
    return fail(c, 404, "not_found", "Nothing to remove.");
  }
  const ok = await db.optOut(c.env.DB, id, await sha256Hex(token));
  if (!ok) return fail(c, 404, "not_found", "Nothing to remove.");
  return c.json({ ok: true });
});

app.get("/og/:file", async (c) => {
  const id = c.req.param("file").replace(/\.png$/, "");
  if (!ID_PATTERN.test(id)) return fail(c, 404, "not_found", "Bad id.");
  const key = `og/${id}.png`;
  const existing = await c.env.SHOTS.get(key);
  if (existing) {
    return new Response(existing.body, { headers: { "content-type": "image/png", "cache-control": SHOT_CACHE } });
  }
  const rec = await db.getById(c.env.DB, id);
  if (!rec || !rec.optInLeaderboard) return fail(c, 404, "not_found", "Removed.");
  // Only cache misses launch a browser, so only they are rate limited.
  if (c.env.ROAST_LIMITER && !(await c.env.ROAST_LIMITER.limit({ key: `og:${await quota.hashIp(clientIp(c))}` })).success) {
    return fail(c, 429, "rate_limited", "Slow down. Try again in a minute.");
  }
  const png = await renderHtmlToPng(c.env, ogHtml(rec));
  await c.env.SHOTS.put(key, png, { httpMetadata: { contentType: "image/png" } });
  return new Response(png, { headers: { "content-type": "image/png", "cache-control": SHOT_CACHE } });
});

export default app;

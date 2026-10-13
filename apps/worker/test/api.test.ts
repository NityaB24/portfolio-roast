import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("../src/capture", () => ({
  captureSite: (...args: unknown[]) => captureMock(...args),
  renderHtmlToPng: vi.fn(),
}));

import app from "../src/index";
import { sha256Hex } from "../src/lib/http";
import { quotaKey } from "../src/lib/quota";

function fakeKv() {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    store,
  };
}

interface Call {
  sql: string;
  args: unknown[];
}

function fakeDb(opts: { changes?: number } = {}) {
  const calls: Call[] = [];
  const db = {
    calls,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const call = { sql, args };
          return {
            first: async () => (calls.push(call), null),
            run: async () => (calls.push(call), { meta: { changes: opts.changes ?? 1 } }),
            all: async () => (calls.push(call), { results: [] }),
          };
        },
      };
    },
  };
  return db;
}

const signals = {
  title: "t", h1: "h", metaDescription: "", fontFamilies: [], imageCount: 1, linkCount: 1, hasDarkModeToggle: false,
  loadMs: 1, wordCount: 1, usesCommonTemplate: false, templateHints: [], finalUrl: "https://jane.dev",
};

function makeEnv(over: Record<string, unknown> = {}) {
  const kv = fakeKv();
  const db = fakeDb();
  const puts: string[] = [];
  const env = {
    DB: db,
    QUOTA: kv,
    SHOTS: { put: async (k: string) => void puts.push(k), get: async () => null },
    BROWSER: {},
    PUBLIC_WEB_ORIGIN: "https://roast.example",
    DAILY_QUOTA: "300",
    PER_IP_DAILY: "5",
    ...over,
  };
  return { env, kv, db, puts };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://api.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.5", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => captureMock.mockReset());

describe("request limits", () => {
  it("rejects oversized bodies with 413 before parsing", async () => {
    const { env } = makeEnv();
    const res = await app.fetch(post("/api/roast", { url: "https://jane.dev", pad: "x".repeat(5000) }), env);
    expect(res.status).toBe(413);
    expect(captureMock).not.toHaveBeenCalled();
  });
  it("rejects bad JSON", async () => {
    const { env } = makeEnv();
    const res = await app.fetch(post("/api/roast", "{nope"), env);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_json");
  });
  it("rejects very long URLs", async () => {
    const { env } = makeEnv();
    const res = await app.fetch(post("/api/roast", { url: `https://jane.dev/${"a".repeat(3000)}` }), env);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe("too_long");
  });
  it("still rejects private addresses", async () => {
    const { env } = makeEnv();
    const res = await app.fetch(post("/api/roast", { url: "http://169.254.169.254/latest" }), env);
    expect(res.status).toBe(400);
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("roast flow", () => {
  it("reserves quota before the slow capture starts", async () => {
    const { env, kv } = makeEnv();
    let usedDuringCapture = -1;
    captureMock.mockImplementation(async () => {
      usedDuringCapture = Number(kv.store.get(quotaKey()) ?? 0);
      return { ok: false, blocked: true, reason: "HTTP 403" };
    });
    const res = await app.fetch(post("/api/roast", { url: "https://jane.dev" }), env);
    expect(res.status).toBe(200);
    expect(usedDuringCapture).toBe(1);
    expect(kv.store.get(quotaKey())).toBe("1");
  });

  it("returns a removeToken once and stores only its hash", async () => {
    const { env, db } = makeEnv();
    captureMock.mockResolvedValue({ ok: true, capture: { desktop: new Uint8Array([1]), mobile: new Uint8Array([2]), signals } });
    const res = await app.fetch(post("/api/roast", { url: "https://jane.dev" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { removeToken: string; id: string };
    expect(body.removeToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const insert = db.calls.find((c) => c.sql.startsWith("INSERT"));
    expect(insert?.args).toContain(await sha256Hex(body.removeToken));
    expect(insert?.args).not.toContain(body.removeToken);
  });

  it("enforces the per-IP cap", async () => {
    const { env } = makeEnv({ PER_IP_DAILY: "1" });
    captureMock.mockResolvedValue({ ok: false, blocked: true, reason: "x" });
    expect((await app.fetch(post("/api/roast", { url: "https://a.dev" }), env)).status).toBe(200);
    const second = await app.fetch(post("/api/roast", { url: "https://b.dev" }), env);
    expect(second.status).toBe(429);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("honours the optional burst limiter", async () => {
    const { env } = makeEnv({ ROAST_LIMITER: { limit: async () => ({ success: false }) } });
    const res = await app.fetch(post("/api/roast", { url: "https://jane.dev" }), env);
    expect(res.status).toBe(429);
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/remove/:id", () => {
  it("refuses requests without a token", async () => {
    const { env, db } = makeEnv();
    const res = await app.fetch(post("/api/remove/abc123XYZ789", {}), env);
    expect(res.status).toBe(404);
    expect(db.calls).toHaveLength(0);
  });
  it("hashes the token and updates only on a match", async () => {
    const { env, db } = makeEnv();
    const token = "t".repeat(24);
    const res = await app.fetch(post("/api/remove/abc123XYZ789", { token }), env);
    expect(res.status).toBe(200);
    expect(db.calls[0]?.args).toEqual(["abc123XYZ789", await sha256Hex(token)]);
  });
  it("404s when the token does not match", async () => {
    const { env } = makeEnv();
    (env.DB as ReturnType<typeof fakeDb>) = fakeDb({ changes: 0 });
    const res = await app.fetch(post("/api/remove/abc123XYZ789", { token: "w".repeat(24) }), env);
    expect(res.status).toBe(404);
  });
});

describe("headers and CORS", () => {
  it("sets nosniff on every response", async () => {
    const { env } = makeEnv();
    const res = await app.fetch(new Request("https://api.example/nope"), env);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("allows only the configured origin in production", async () => {
    const { env } = makeEnv();
    const req = (origin: string) => app.fetch(new Request("https://api.example/api/quota", { headers: { origin } }), env);
    expect((await req("https://roast.example")).headers.get("access-control-allow-origin")).toBe("https://roast.example");
    expect((await req("http://localhost:5173")).headers.get("access-control-allow-origin")).toBe("https://roast.example");
    expect((await req("https://evil.example")).headers.get("access-control-allow-origin")).toBe("https://roast.example");
  });
  it("keeps localhost working when PUBLIC_WEB_ORIGIN is a dev origin", async () => {
    const { env } = makeEnv({ PUBLIC_WEB_ORIGIN: "http://localhost:5173" });
    const res = await app.fetch(new Request("https://api.example/api/quota", { headers: { origin: "http://127.0.0.1:5173" } }), env);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
  });
});

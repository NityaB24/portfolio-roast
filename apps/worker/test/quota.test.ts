import { describe, expect, it } from "vitest";
import { hashIp, incrementBoth, ipKey, KEY_TTL_SECONDS, nextResetIso, parseCount, quotaKey, readGlobal, readIp, utcDay } from "../src/lib/quota";

function fakeKv() {
  const store = new Map<string, { value: string; ttl?: number }>();
  const kv = {
    get: async (key: string) => store.get(key)?.value ?? null,
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, { value, ttl: opts?.expirationTtl });
    },
    store,
  };
  return kv as unknown as KVNamespace & { store: typeof store };
}

describe("quota keys", () => {
  const now = new Date("2026-10-13T23:59:30.000Z");
  it("uses the UTC day", () => {
    expect(utcDay(now)).toBe("2026-10-13");
    expect(quotaKey(now)).toBe("quota:2026-10-13");
    expect(ipKey("abc", now)).toBe("ip:2026-10-13:abc");
  });
  it("rolls over at midnight UTC", () => {
    const later = new Date(now.getTime() + 60_000);
    expect(quotaKey(later)).toBe("quota:2026-10-14");
    expect(nextResetIso(now)).toBe("2026-10-14T00:00:00.000Z");
    expect(nextResetIso(later)).toBe("2026-10-15T00:00:00.000Z");
  });
  it("parses counters defensively", () => {
    expect(parseCount(null)).toBe(0);
    expect(parseCount("12")).toBe(12);
    expect(parseCount("-4")).toBe(0);
    expect(parseCount("nope")).toBe(0);
  });
  it("hashes IPs to a stable, non-reversible token", async () => {
    const a = await hashIp("203.0.113.9");
    const b = await hashIp("203.0.113.9");
    const c = await hashIp("203.0.113.10");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
  });
});

describe("quota counters", () => {
  it("increments both keys with a ~48h TTL", async () => {
    const kv = fakeKv();
    const now = new Date("2026-10-13T10:00:00Z");
    await incrementBoth(kv, "h1", now);
    await incrementBoth(kv, "h1", now);
    await incrementBoth(kv, "h2", now);
    const snap = await readGlobal(kv, 300, now);
    expect(snap).toEqual({ used: 3, limit: 300, resetsAt: "2026-10-14T00:00:00.000Z" });
    expect(await readIp(kv, "h1", now)).toBe(2);
    expect(await readIp(kv, "h2", now)).toBe(1);
    expect(kv.store.get("quota:2026-10-13")?.ttl).toBe(KEY_TTL_SECONDS);
    expect(KEY_TTL_SECONDS).toBe(172_800);
  });
  it("starts fresh on a new day", async () => {
    const kv = fakeKv();
    await incrementBoth(kv, "h1", new Date("2026-10-13T10:00:00Z"));
    expect((await readGlobal(kv, 300, new Date("2026-10-14T00:00:01Z"))).used).toBe(0);
  });
});

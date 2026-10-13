import { describe, expect, it } from "vitest";
import { formatCountdown, msUntilReroast, shareText, xShareUrl } from "./share";

describe("share helpers", () => {
  it("writes a score-aware share line", () => {
    expect(shareText("jane.example", 91)).toContain("survived");
    expect(shareText("jane.example", 30)).toContain("destroyed");
    expect(shareText("jane.example", 30)).toContain("30/100");
  });
  it("encodes the X intent URL", () => {
    const u = xShareUrl("a b", "https://x.example/r/1");
    expect(u).toContain("text=a%20b");
    expect(u).toContain("url=https%3A%2F%2Fx.example%2Fr%2F1");
  });
  it("computes the re-roast cooldown", () => {
    const created = "2026-10-13T00:00:00.000Z";
    expect(msUntilReroast(created, Date.parse("2026-10-13T12:00:00.000Z"))).toBe(12 * 3600 * 1000);
    expect(msUntilReroast(created, Date.parse("2026-10-15T00:00:00.000Z"))).toBe(0);
    expect(formatCountdown(3661 * 1000)).toBe("01:01:01");
  });
});

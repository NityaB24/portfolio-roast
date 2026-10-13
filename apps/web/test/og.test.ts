import { describe, expect, it } from "vitest";
import { buildOgTags, injectOg } from "../functions/r/[id]";

describe("Pages Function OG injection", () => {
  const rec = { id: "abc123DEF456", score: 58, verdict: 'A "fine" portfolio <3', normalizedUrl: "https://www.jane.example", blocked: false };
  it("builds escaped tags with the OG image URL", () => {
    const tags = buildOgTags(rec, "https://api.example", "https://roast.example/r/abc123DEF456");
    expect(tags).toContain("https://api.example/og/abc123DEF456.png");
    expect(tags).toContain("jane.example scored 58/100");
    expect(tags).toContain("&quot;fine&quot;");
    expect(tags).not.toContain("<3");
  });
  it("replaces the placeholder block in the shell", () => {
    const shell = '<html><head><title>Portfolio Roast</title>\n<meta name="description" content="x" />\n<!--OG-->\n<meta property="og:title" content="old" />\n<!--/OG--></head><body></body></html>';
    const out = injectOg(shell, "<meta property=\"og:title\" content=\"new\" />");
    expect(out).toContain('content="new"');
    expect(out).not.toContain('content="old"');
    expect(out).not.toContain("<title>Portfolio Roast</title>");
  });
});

import { describe, expect, it } from "vitest";
import { parseRoastJson, roastWithAI } from "../src/ai/groq";
import { fixtureRoast } from "../src/ai/fixture";
import { RoastResultSchema, type Signals } from "../src/lib/schema";

const signals: Signals = {
  title: "Jane Doe – Designer",
  h1: "Hi, I'm Jane",
  metaDescription: "",
  fontFamilies: ["Inter", "Georgia"],
  imageCount: 14,
  linkCount: 22,
  hasDarkModeToggle: true,
  loadMs: 3120,
  wordCount: 410,
  usesCommonTemplate: false,
  templateHints: [],
  finalUrl: "https://jane.example",
};

const sampleBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.1, viewport: "desktop" };
const sampleItem = (i: number) => ({
  severity: "med",
  category: "copy",
  title: `Roast ${i}`,
  detail: "Detail that is specific.",
  fix: "Do the thing.",
  box: sampleBox,
});

describe("RoastResultSchema", () => {
  it("accepts a well-formed response and rounds the score", () => {
    const parsed = RoastResultSchema.parse({
      score: 61.6,
      verdict: "Fine, I guess.",
      roasts: [1, 2, 3, 4, 5].map(sampleItem),
      compliments: ["Nice type."],
    });
    expect(parsed.score).toBe(62);
    expect(parsed.roasts).toHaveLength(5);
  });
  it("coerces numeric strings the model sometimes emits", () => {
    const parsed = RoastResultSchema.parse({
      score: "77",
      verdict: "ok",
      roasts: [1, 2, 3, 4, 5].map((i) => ({ ...sampleItem(i), box: { x: "0.1", y: "0.2", w: "0.3", h: "0.4", viewport: "mobile" } })),
      compliments: ["a"],
    });
    expect(parsed.score).toBe(77);
    expect(parsed.roasts[0]?.box.x).toBe(0.1);
  });
  it("rejects too few roasts, bad enums and out-of-range values", () => {
    expect(RoastResultSchema.safeParse({ score: 10, verdict: "x", roasts: [sampleItem(1)], compliments: ["a"] }).success).toBe(false);
    expect(RoastResultSchema.safeParse({ score: 101, verdict: "x", roasts: [1, 2, 3, 4, 5].map(sampleItem), compliments: ["a"] }).success).toBe(false);
    expect(
      RoastResultSchema.safeParse({ score: 50, verdict: "x", roasts: [1, 2, 3, 4, 5].map((i) => ({ ...sampleItem(i), severity: "nuclear" })), compliments: ["a"] }).success,
    ).toBe(false);
    expect(RoastResultSchema.safeParse({ score: 50, verdict: "x", roasts: [1, 2, 3, 4, 5].map(sampleItem), compliments: [] }).success).toBe(false);
  });
});

describe("parseRoastJson", () => {
  const good = JSON.stringify({ score: 44, verdict: "Meh.", roasts: [1, 2, 3, 4, 5, 6].map(sampleItem), compliments: ["ok", "fine"] });
  it("parses raw JSON", () => {
    expect(parseRoastJson(good).score).toBe(44);
  });
  it("tolerates code fences and prose", () => {
    expect(parseRoastJson("Here you go:\n```json\n" + good + "\n```\nHope that helps!").score).toBe(44);
  });
  it("clamps boxes inside the image", () => {
    const r = parseRoastJson(JSON.stringify({ score: 1, verdict: "x", roasts: [1, 2, 3, 4, 5].map((i) => ({ ...sampleItem(i), box: { x: 0.9, y: 0.95, w: 0.5, h: 0.5, viewport: "desktop" } })), compliments: ["a"] }));
    const b = r.roasts[0]!.box;
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y + b.h).toBeLessThanOrEqual(1);
  });
  it("throws on no JSON", () => {
    expect(() => parseRoastJson("I refuse.")).toThrow();
  });
});

describe("roastWithAI", () => {
  it("returns the deterministic fixture in mock mode", async () => {
    const a = await roastWithAI({ url: "https://jane.example", signals, desktopDataUrl: "", mobileDataUrl: "" });
    const b = await roastWithAI({ url: "https://jane.example", signals, desktopDataUrl: "", mobileDataUrl: "" });
    expect(a).toEqual(b);
    expect(RoastResultSchema.safeParse(a).success).toBe(true);
    expect(fixtureRoast("https://other.example", signals).score).not.toBe(a.score);
  });
  it("calls Groq with JSON mode and both images when a key is present", async () => {
    let captured: unknown;
    const fetchImpl: typeof fetch = async (_url, init) => {
      captured = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 90, verdict: "Hire.", roasts: [1, 2, 3, 4, 5].map(sampleItem), compliments: ["wow"] }) } }] }), {
        headers: { "content-type": "application/json" },
      });
    };
    const r = await roastWithAI({ url: "https://jane.example", signals, desktopDataUrl: "data:image/webp;base64,AAAA", mobileDataUrl: "data:image/webp;base64,BBBB", apiKey: "k", fetchImpl });
    expect(r.score).toBe(90);
    const body = captured as { response_format: { type: string }; temperature: number; messages: Array<{ content: unknown }> };
    expect(body.response_format.type).toBe("json_object");
    expect(body.temperature).toBe(0.4);
    const parts = body.messages[1]!.content as Array<{ type: string }>;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
  });
});

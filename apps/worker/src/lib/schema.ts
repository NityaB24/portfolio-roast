import { z } from "zod";

export const Severity = z.enum(["high", "med", "low"]);
export const Category = z.enum(["hierarchy", "copy", "performance", "mobile", "originality", "accessibility"]);
export const Viewport = z.enum(["desktop", "mobile"]);
/** "brutal" = senior design lead (default). "comedy" = roast-battle headliner, maximum jokes, same facts. */
export const RoastModeSchema = z.enum(["brutal", "comedy"]).default("brutal");
export type RoastMode = z.infer<typeof RoastModeSchema>;

const fraction = z.coerce.number().min(0).max(1);

export const BoxSchema = z.object({
  x: fraction,
  y: fraction,
  w: fraction,
  h: fraction,
  viewport: Viewport,
});

export const RoastItemSchema = z.object({
  severity: Severity,
  category: Category,
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(600),
  fix: z.string().min(1).max(400),
  box: BoxSchema,
});

export const RoastResultSchema = z.object({
  score: z.coerce.number().min(0).max(100).transform((n) => Math.round(n)),
  verdict: z.string().min(1).max(200),
  roasts: z.array(RoastItemSchema).min(5).max(7),
  compliments: z.array(z.string().min(1).max(200)).min(1).max(2),
});

export type RoastItem = z.infer<typeof RoastItemSchema>;
export type RoastResult = z.infer<typeof RoastResultSchema>;

/** Facts scraped from the live page and handed to the model. */
export const SignalsSchema = z.object({
  title: z.string(),
  h1: z.string(),
  metaDescription: z.string(),
  fontFamilies: z.array(z.string()),
  imageCount: z.number(),
  linkCount: z.number(),
  hasDarkModeToggle: z.boolean(),
  loadMs: z.number(),
  wordCount: z.number(),
  usesCommonTemplate: z.boolean(),
  templateHints: z.array(z.string()).default([]),
  finalUrl: z.string().default(""),
});

export type Signals = z.infer<typeof SignalsSchema>;

/** Row shape stored in D1 and returned by the API. */
export interface RoastRecord {
  id: string;
  url: string;
  normalizedUrl: string;
  score: number;
  verdict: string;
  roasts: RoastItem[];
  compliments: string[];
  signals: Signals | null;
  promptVersion: string;
  mode: RoastMode;
  blocked: boolean;
  createdAt: string;
  optInLeaderboard: boolean;
}

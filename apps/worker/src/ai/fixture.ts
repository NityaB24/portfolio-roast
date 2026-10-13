import type { RoastResult, Signals } from "../lib/schema";

/**
 * Deterministic roast used when GROQ_API_KEY is absent (mock mode) so the
 * frontend can be developed without burning AI credits. Seeded from the URL
 * so different inputs get different scores.
 */
export function fixtureRoast(url: string, signals: Signals): RoastResult {
  let seed = 0;
  for (const ch of url) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const score = 35 + (seed % 50);
  const fonts = signals.fontFamilies.length;
  return {
    score,
    verdict: `A ${score}/100 portfolio that is trying very hard to be every other portfolio. (mock mode)`,
    roasts: [
      {
        severity: "high",
        category: "hierarchy",
        title: "The hero cannot decide what it is for",
        detail: `The headline, the avatar and the nav all fight for attention in the top 30% of the desktop view. ${signals.h1 ? `"${signals.h1}" ` : "The H1 "}is doing none of the work a headline should.`,
        fix: "Pick one: a 7-word statement of what you do and for whom. Make it 2x larger than anything else above the fold.",
        box: { x: 0.08, y: 0.18, w: 0.84, h: 0.3, viewport: "desktop" },
      },
      {
        severity: "high",
        category: "copy",
        title: `${signals.wordCount} words and none of them say what you shipped`,
        detail: `Visible copy is ${signals.wordCount} words and reads like a LinkedIn summary. Visitors scan for outcomes, not adjectives.`,
        fix: "Replace the bio paragraph with three bullets: project, your role, measurable result.",
        box: { x: 0.08, y: 0.5, w: 0.5, h: 0.2, viewport: "desktop" },
      },
      {
        severity: "med",
        category: "performance",
        title: `${signals.loadMs} ms to the load event`,
        detail: `With ${signals.imageCount} images on the page and ${fonts} font families, the load event lands at ${signals.loadMs} ms on a datacentre connection. On a phone that is a coffee break.`,
        fix: "Convert hero imagery to WebP/AVIF, lazy-load everything below the fold, and preload the one font you actually need.",
        box: { x: 0.55, y: 0.15, w: 0.4, h: 0.45, viewport: "desktop" },
      },
      {
        severity: "med",
        category: "mobile",
        title: "Mobile nav is a tap-target lottery",
        detail: "Links in the mobile header sit under 32px apart. Thumbs are not that precise.",
        fix: "Collapse the nav into a single menu button with 44px targets, or drop it and let the page scroll.",
        box: { x: 0.0, y: 0.0, w: 1, h: 0.12, viewport: "mobile" },
      },
      {
        severity: "low",
        category: "originality",
        title: signals.usesCommonTemplate ? `Spotted: ${signals.templateHints.join(", ") || "a template"}` : "Default dark-mode-gradient-card layout",
        detail: "Rounded cards, a purple gradient and a 'Get in touch' button. I have seen this exact page 400 times this week.",
        fix: "Change one structural thing: a different grid, a real photograph, or a typeface that is not Inter.",
        box: { x: 0.05, y: 0.4, w: 0.9, h: 0.5, viewport: "mobile" },
      },
      {
        severity: "low",
        category: "accessibility",
        title: signals.hasDarkModeToggle ? "Dark mode toggle, no contrast check" : "Grey-on-dark body text",
        detail: "Secondary text appears to sit below a 4.5:1 contrast ratio against the background.",
        fix: "Bump body text to at least #c8c8c8 on #0a0a0a and re-run a contrast checker.",
        box: { x: 0.08, y: 0.72, w: 0.6, h: 0.18, viewport: "desktop" },
      },
    ],
    compliments: [
      `The <title> "${signals.title || "(empty)"}" is at least honest about what the page is.`,
      "The colour palette is restrained; nothing is screaming.",
    ],
  };
}

export const BLOCKED_PROMPT_VERSION = "blocked.1";

export function blockedRoast(url: string, reason: string): RoastResult {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // keep raw
  }
  return {
    score: 0,
    verdict: `${host} is so afraid of feedback it blocks headless browsers. Bold strategy.`,
    roasts: [
      {
        severity: "high",
        category: "performance",
        title: "The page never finished loading for a bot",
        detail: `The headless browser gave up: ${reason}. Google's crawler is also a headless browser, so this is not just my problem.`,
        fix: "Allow well-behaved automated agents, or at least respond with real HTML within 15 seconds.",
        box: { x: 0, y: 0, w: 1, h: 1, viewport: "desktop" },
      },
      {
        severity: "high",
        category: "accessibility",
        title: "A wall is not a first impression",
        detail: "Challenge pages, CAPTCHAs and anti-bot interstitials are what visitors with privacy browsers see too.",
        fix: "Turn down bot protection for the homepage; it is a static portfolio, not a bank.",
        box: { x: 0, y: 0, w: 1, h: 1, viewport: "mobile" },
      },
      {
        severity: "med",
        category: "copy",
        title: "No title, no H1, no words to roast",
        detail: "Zero visible copy was extracted. Either the page is empty or it requires JavaScript that never ran.",
        fix: "Server-render the critical content so it exists before scripts run.",
        box: { x: 0.1, y: 0.2, w: 0.8, h: 0.2, viewport: "desktop" },
      },
      {
        severity: "med",
        category: "hierarchy",
        title: "The hierarchy is: nothing",
        detail: "Hard to critique hierarchy on a blank or blocked page, which is itself the critique.",
        fix: "Ship a page that renders.",
        box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2, viewport: "desktop" },
      },
      {
        severity: "low",
        category: "originality",
        title: "Even the error is generic",
        detail: "Blocking bots with a default challenge page is the least original thing a portfolio can do.",
        fix: "If you must block, at least make the block page look like you.",
        box: { x: 0.1, y: 0.6, w: 0.8, h: 0.2, viewport: "desktop" },
      },
    ],
    compliments: ["Your bot protection works. Congratulations, I guess."],
  };
}

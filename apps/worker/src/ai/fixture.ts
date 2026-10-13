import type { RoastMode, RoastResult, Signals } from "../lib/schema";

/**
 * Deterministic roast used when GROQ_API_KEY is absent (mock mode) so the
 * frontend can be developed without burning AI credits. Seeded from the URL
 * so different inputs get different scores.
 */
export function fixtureRoast(url: string, signals: Signals, mode: RoastMode = "brutal"): RoastResult {
  let seed = 0;
  for (const ch of url) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const score = 35 + (seed % 50);
  const fonts = signals.fontFamilies.length;
  if (mode === "comedy") return comedyFixture(score, signals);
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

function comedyFixture(score: number, signals: Signals): RoastResult {
  const h1 = signals.h1 || "the headline";
  return {
    score,
    verdict: `${score}/100. The site loads in ${signals.loadMs} ms, which is the fastest anything on this page moves. (mock mode)`,
    roasts: [
      {
        severity: "high",
        category: "hierarchy",
        title: "The hero has the confidence of a goldfish at a job interview",
        detail: `"${h1}" sits there in the top third of the desktop view, same size as the nav, same weight as the bio, hoping someone notices it. Nobody notices it. The nav, the avatar and the headline are three people talking at once in a very quiet room, and the headline is losing.`,
        fix: "One statement of what you do and for whom, at least twice the size of anything else above the fold.",
        box: { x: 0.08, y: 0.18, w: 0.84, h: 0.3, viewport: "desktop" },
      },
      {
        severity: "high",
        category: "copy",
        title: `${signals.wordCount} words, zero shipped things`,
        detail: `I read all ${signals.wordCount} words. I now know you are "passionate" and "detail-oriented", which is also what every microwave manual says about itself. Not one sentence names a thing you built, what it did, or who it did it for. This is a bio that could be legally reused by 40,000 other people.`,
        fix: "Replace the adjectives with three bullets: project, your role, one measurable result.",
        box: { x: 0.08, y: 0.5, w: 0.5, h: 0.2, viewport: "desktop" },
      },
      {
        severity: "med",
        category: "performance",
        title: `${signals.imageCount} images and ${fontsLabel(signals.fontFamilies.length)} walked into a browser`,
        detail: `The load event lands at ${signals.loadMs} ms on a datacentre connection. On a phone on a train that number grows a beard. ${signals.fontFamilies.length} font families is not a type system, it is a group chat.`,
        fix: "Ship WebP/AVIF, lazy-load everything below the fold, preload the one font you actually use.",
        box: { x: 0.55, y: 0.15, w: 0.4, h: 0.45, viewport: "desktop" },
      },
      {
        severity: "med",
        category: "mobile",
        title: "The mobile nav is a game of Operation",
        detail: "Links in the header sit so close together that tapping 'About' is a 50/50 coin flip with 'Contact'. Thumbs are not surgical instruments. Your visitors will meet your contact form by accident, which is still probably your best conversion funnel.",
        fix: "Collapse the nav into one menu button with 44px targets, or drop it and let the page scroll.",
        box: { x: 0.0, y: 0.0, w: 1, h: 0.12, viewport: "mobile" },
      },
      {
        severity: "low",
        category: "originality",
        title: signals.usesCommonTemplate ? `Spotted: ${signals.templateHints.join(", ") || "a template"}. Spotted it from orbit.` : "Dark background, gradient button, rounded cards. Groundbreaking.",
        detail: "I have seen this exact layout so many times this week that my browser autocompleted it. Rounded cards, a purple-to-pink gradient and a 'Get in touch' button: the three-piece suit of portfolios that want to be taken seriously by other portfolios.",
        fix: "Change one structural thing: a different grid, a real photograph, or a typeface that is not Inter.",
        box: { x: 0.05, y: 0.4, w: 0.9, h: 0.5, viewport: "mobile" },
      },
      {
        severity: "low",
        category: "accessibility",
        title: signals.hasDarkModeToggle ? "A dark mode toggle for a page that is already a cave" : "Grey text on a black background: the stealth bomber of readability",
        detail: "Secondary text sits at a contrast ratio that makes it less 'read' and more 'suspect'. It is technically there, in the way that a whisper at a concert is technically audio.",
        fix: "Bump body text to at least #c8c8c8 on #0a0a0a and re-run a contrast checker.",
        box: { x: 0.08, y: 0.72, w: 0.6, h: 0.18, viewport: "desktop" },
      },
    ],
    compliments: [
      `The <title> "${signals.title || "(empty)"}" is clear and honest about what the page is.`,
      "The palette is restrained and nothing clashes. That is rarer than it should be.",
    ],
  };
}

function fontsLabel(n: number): string {
  return n === 1 ? "a font" : `${n} fonts`;
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

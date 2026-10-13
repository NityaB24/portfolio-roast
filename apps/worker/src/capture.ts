import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import type { Env } from "./env";
import { SignalsSchema, type Signals } from "./lib/schema";

export const DESKTOP = { width: 1440, height: 900 } as const;
export const MOBILE = { width: 390, height: 844 } as const;
const NAV_TIMEOUT_MS = 15_000;
const WEBP_QUALITY = 70;

export interface Capture {
  desktop: Uint8Array;
  mobile: Uint8Array;
  signals: Signals;
}

export type CaptureResult = { ok: true; capture: Capture } | { ok: false; blocked: true; reason: string };

const BLOCK_PATTERNS = [/just a moment/i, /checking your browser/i, /access denied/i, /verify you are human/i, /captcha/i, /attention required/i, /enable javascript and cookies/i];

/**
 * Browser-side extraction. Shipped as a source string because the Worker's
 * TypeScript config has no DOM lib (it conflicts with workers-types). The
 * result is validated with zod on the way back.
 */
export const EXTRACT_SIGNALS_SCRIPT = `(() => {
  const doc = document;
  const text = (el) => (el && el.textContent ? el.textContent : "").replace(/\\s+/g, " ").trim();
  const fontSet = new Set();
  const sample = [doc.body].concat(Array.from(doc.querySelectorAll("h1, h2, h3, p, a, button, li")).slice(0, 200));
  for (const el of sample) {
    if (!el) continue;
    const ff = getComputedStyle(el).fontFamily;
    if (ff) fontSet.add((ff.split(",")[0] || ff).trim().replace(/^["']|["']$/g, ""));
  }
  const bodyText = (doc.body && doc.body.innerText ? doc.body.innerText : "").trim();
  const wordCount = bodyText ? bodyText.split(/\\s+/).length : 0;
  const nav = performance.getEntriesByType("navigation")[0];
  let loadMs = 0;
  if (nav && nav.loadEventEnd > 0) loadMs = Math.round(nav.loadEventEnd - nav.startTime);
  else if (nav && nav.domContentLoadedEventEnd > 0) loadMs = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
  else loadMs = Math.round(performance.now());

  const darkToggle = Array.from(doc.querySelectorAll("button, [role=switch], [role=button], input[type=checkbox]")).some((el) => {
    const label = ((el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "") + " " + el.id + " " + (typeof el.className === "string" ? el.className : "") + " " + text(el)).toLowerCase();
    return /\\b(theme|dark|light)\\b/.test(label);
  });

  const html = doc.documentElement.outerHTML;
  const hints = [];
  if (/lorem ipsum/i.test(bodyText)) hints.push("lorem ipsum");
  if (/Get started by editing/i.test(bodyText) || /create-next-app/i.test(html)) hints.push("default Next.js starter");
  if (/Edit <code>src\\/App/i.test(html) || (/Learn React/i.test(bodyText) && /App-logo/i.test(html))) hints.push("create-react-app boilerplate");
  if (/Vite \\+ React/i.test(bodyText) || /count is \\d+/i.test(bodyText)) hints.push("Vite starter");
  if (doc.querySelector(".container > .row > .col-md-4, .navbar-expand-lg, .jumbotron, .btn-primary.btn-lg")) hints.push("Bootstrap default classes");
  if (/Welcome to Gatsby/i.test(bodyText)) hints.push("Gatsby starter");
  if (/Start Bootstrap|HTML5 UP|Templated\\.co|themeforest/i.test(html)) hints.push("off-the-shelf HTML template");
  if (/John Doe|Jane Doe|Your Name/i.test(bodyText)) hints.push("placeholder name");

  const meta = doc.querySelector('meta[name="description"]');
  return {
    title: doc.title || "",
    h1: text(doc.querySelector("h1")),
    metaDescription: meta && meta.getAttribute("content") ? meta.getAttribute("content").trim() : "",
    fontFamilies: Array.from(fontSet).slice(0, 12),
    imageCount: doc.images.length,
    linkCount: doc.links.length,
    hasDarkModeToggle: darkToggle,
    loadMs,
    wordCount,
    usesCommonTemplate: hints.length > 0,
    templateHints: hints,
    finalUrl: location.href,
  };
})()`;

const BODY_TEXT_SCRIPT = `(document.body && document.body.innerText ? document.body.innerText : "").slice(0, 2000)`;

async function gotoWithFallback(page: Page, url: string): Promise<{ status: number | null }> {
  try {
    const res = await page.goto(url, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT_MS });
    return { status: res?.status() ?? null };
  } catch (err) {
    // Sites with long-polling never hit networkidle0; try a cheaper signal.
    if (err instanceof Error && /timeout/i.test(err.message)) {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8_000 });
      return { status: res?.status() ?? null };
    }
    throw err;
  }
}

function toBytes(buf: Uint8Array | string): Uint8Array {
  if (typeof buf === "string") {
    const bin = atob(buf);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return buf;
}

async function shoot(page: Page): Promise<Uint8Array> {
  const buf = await page.screenshot({ type: "webp", quality: WEBP_QUALITY, fullPage: false });
  return toBytes(buf);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function captureSite(env: Env, url: string): Promise<CaptureResult> {
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 PortfolioRoast/1.0");
    await page.setViewport({ ...DESKTOP, deviceScaleFactor: 1 });

    const { status } = await gotoWithFallback(page, url);
    if (status !== null && (status === 401 || status === 403 || status === 429 || status === 503)) {
      return { ok: false, blocked: true, reason: `HTTP ${status}` };
    }
    const bodyText = String(await page.evaluate(BODY_TEXT_SCRIPT));
    if (BLOCK_PATTERNS.some((re) => re.test(bodyText)) && bodyText.length < 600) {
      return { ok: false, blocked: true, reason: "anti-bot challenge page" };
    }

    // Let fonts and above-the-fold animations settle a touch.
    await sleep(600);
    const desktop = await shoot(page);
    const raw: unknown = await page.evaluate(EXTRACT_SIGNALS_SCRIPT);
    const parsed = SignalsSchema.safeParse(raw);
    const signals: Signals = parsed.success
      ? parsed.data
      : {
          title: "",
          h1: "",
          metaDescription: "",
          fontFamilies: [],
          imageCount: 0,
          linkCount: 0,
          hasDarkModeToggle: false,
          loadMs: 0,
          wordCount: bodyText.split(/\s+/).filter(Boolean).length,
          usesCommonTemplate: false,
          templateHints: [],
          finalUrl: page.url(),
        };

    await page.setViewport({ ...MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    // Reload at mobile width so responsive layouts (and mobile-only nav) render properly.
    try {
      await page.reload({ waitUntil: "networkidle0", timeout: 10_000 });
    } catch {
      // keep whatever rendered
    }
    await sleep(400);
    const mobile = await shoot(page);

    return { ok: true, capture: { desktop, mobile, signals } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, blocked: true, reason: msg.slice(0, 200) };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/** Render an HTML string to a 1200x630 PNG (used for OG share cards). */
export async function renderHtmlToPng(env: Env, html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 10_000 });
    const buf = await page.screenshot({ type: "png", fullPage: false });
    return toBytes(buf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

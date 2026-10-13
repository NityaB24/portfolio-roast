import type { RoastRecord } from "./lib/schema";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function scoreTone(score: number): { accent: string; label: string } {
  if (score >= 85) return { accent: "#7CFF6B", label: "HIRE-WORTHY" };
  if (score >= 70) return { accent: "#FFD166", label: "SOLID" };
  if (score >= 50) return { accent: "#FF8A3D", label: "MID" };
  if (score > 0) return { accent: "#FF3B3B", label: "ROASTED" };
  return { accent: "#9A9A9A", label: "BLOCKED" };
}

/** 1200x630 share card. Self-contained HTML, system fonts only (no network). */
export function ogHtml(rec: RoastRecord): string {
  const domain = domainOf(rec.normalizedUrl);
  const tone = scoreTone(rec.score);
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: #0B0B0C;
    color: #F4F1EA;
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    position: relative;
  }
  .grain { position: absolute; inset: 0; background:
    repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,.015) 2px 3px); }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 28px; background: ${tone.accent}; }
  .wrap { position: absolute; inset: 0; padding: 56px 64px 56px 92px; display: flex; flex-direction: column; justify-content: space-between; }
  .top { display: flex; align-items: center; gap: 16px; font-size: 26px; letter-spacing: .02em; color: #B8B4AB; }
  .top img { width: 36px; height: 36px; border-radius: 8px; background: #222; }
  .score { display: flex; align-items: baseline; gap: 28px; }
  .num { font-size: 300px; line-height: .85; font-weight: 900; letter-spacing: -0.06em; color: ${tone.accent}; font-variant-numeric: tabular-nums; }
  .outof { font-size: 44px; font-weight: 700; color: #6F6B63; }
  .label { display: inline-block; font-size: 30px; font-weight: 800; letter-spacing: .22em; color: #0B0B0C; background: ${tone.accent}; padding: 8px 18px; border-radius: 6px; margin-bottom: 18px; }
  .verdict { font-size: 44px; line-height: 1.12; font-weight: 700; letter-spacing: -0.02em; max-width: 1000px; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; font-size: 24px; color: #6F6B63; }
  .brand { font-weight: 900; letter-spacing: -0.03em; color: #F4F1EA; font-size: 30px; }
  .brand span { color: #FF3B3B; }
</style></head>
<body>
  <div class="grain"></div>
  <div class="bar"></div>
  <div class="wrap">
    <div class="top"><img src="${esc(favicon)}" alt="" onerror="this.style.display='none'"><span>${esc(domain)}</span></div>
    <div>
      <div class="score"><div class="num">${rec.score}</div><div class="outof">/100</div></div>
    </div>
    <div>
      <div class="label">${tone.label}</div>
      <div class="verdict">${esc(rec.verdict)}</div>
    </div>
    <div class="foot"><div class="brand">PORTFOLIO<span>ROAST</span></div><div>Paste yours. If you dare.</div></div>
  </div>
</body></html>`;
}

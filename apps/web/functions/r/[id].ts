/**
 * Cloudflare Pages Function: pre-renders OG meta tags for /r/:id so crawlers
 * (X, LinkedIn, Slack, iMessage) get a real share card. Humans receive the
 * same static shell; React takes over client-side.
 */
interface Env {
  API_BASE?: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface RoastRecord {
  id: string;
  score: number;
  verdict: string;
  normalizedUrl: string;
  blocked: boolean;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

export function buildOgTags(rec: RoastRecord, apiBase: string, pageUrl: string): string {
  let domain = rec.normalizedUrl;
  try {
    domain = new URL(rec.normalizedUrl).hostname.replace(/^www\./, "");
  } catch {
    // keep as is
  }
  const title = `${domain} scored ${rec.score}/100 on Portfolio Roast`;
  const desc = rec.verdict;
  const img = `${apiBase}/og/${rec.id}.png`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
  ].join("\n    ");
}

export function injectOg(html: string, tags: string): string {
  // Replace the default <title> and the <!--OG-->...<!--/OG--> block from index.html.
  const withoutTitle = html.replace(/<title>[^<]*<\/title>\s*/, "").replace(/<meta name="description"[^>]*>\s*/, "");
  if (/<!--OG-->[\s\S]*?<!--\/OG-->/.test(withoutTitle)) {
    return withoutTitle.replace(/<!--OG-->[\s\S]*?<!--\/OG-->/, tags);
  }
  return withoutTitle.replace("</head>", `${tags}\n  </head>`);
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = String(ctx.params.id ?? "");
  const url = new URL(ctx.request.url);
  // Serve the SPA shell from the static assets.
  const shellRes = await ctx.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin).toString(), ctx.request));
  const shell = await shellRes.text();
  const apiBase = (ctx.env.API_BASE ?? "").replace(/\/$/, "");
  if (!apiBase || !/^[A-Za-z0-9_-]{6,32}$/.test(id)) {
    return new Response(shell, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  try {
    const res = await fetch(`${apiBase}/api/roast/${id}`, { cf: { cacheTtl: 60 } } as RequestInit);
    if (!res.ok) throw new Error(String(res.status));
    const rec = (await res.json()) as RoastRecord;
    const html = injectOg(shell, buildOgTags(rec, apiBase, url.toString()));
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
  } catch {
    return new Response(shell, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};

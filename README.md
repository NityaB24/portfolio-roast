# Portfolio Roast

Paste a portfolio URL. Get an annotated screenshot with a brutal but useful AI critique, a score out of 100, a shareable result page with an OG card, and a rank on a public leaderboard. Everything runs on free tiers at zero cost to the owner.

```
https://yourname.dev  ->  58/100  "A dark-mode template wearing a trench coat."
                           6 roasts pinned to the screenshot, each with a fix
                           /r/abc123 share page + 1200x630 OG card
                           #14 on the weekly leaderboard
```

## Architecture

```
                 Cloudflare Pages (static Vite + React)
   browser ───► apps/web  ─────────────────────────────────────────┐
                 │  /r/:id is pre-rendered by a Pages Function     │
                 │  (functions/r/[id].ts) that injects OG tags     │
                 │                                                 │ fetch (CORS)
                 ▼                                                 ▼
          Cloudflare Worker  apps/worker  (Hono, TypeScript)
          ┌──────────────────────────────────────────────────────────────┐
          │ POST /api/roast                                              │
          │   1. url-guard   normalize + SSRF block (private IPs, .local)│
          │   2. D1 cache    same normalized URL < 24h ⇒ cached: true    │
          │   3. KV quota    quota:YYYY-MM-DD, ip:YYYY-MM-DD:<sha256>    │
          │   4. Browser Rendering (puppeteer)                           │
          │        desktop 1440x900 + mobile 390x844 WebP q70           │
          │        page signals: title, h1, fonts, counts, loadMs, ...  │
          │   5. R2          shots/<id>/{desktop,mobile}.webp           │
          │   6. Groq vision roastWithAI() → zod-validated JSON         │
          │   7. D1          INSERT roasts                               │
          │ GET  /api/roast/:id  /api/top  /api/bottom  /api/history     │
          │ GET  /api/quota  /api/shots/:id/:vp  /og/:id.png            │
          │ POST /api/remove/:id                                         │
          └───────┬──────────────┬──────────────┬──────────────┬─────────┘
                  ▼              ▼              ▼              ▼
                 D1 (DB)       KV (QUOTA)     R2 (SHOTS)    Browser Rendering (BROWSER)
                                                                  │
                                                                  ▼
                                                        Groq API (GROQ_API_KEY)
```

Monorepo layout (pnpm workspaces):

```
apps/web      Vite + React 18 + TypeScript + Tailwind v4 (Cloudflare Pages)
apps/worker   Cloudflare Worker, Hono, D1 / KV / R2 / Browser Rendering
```

## Free-tier budget and guardrails

| Resource | Free tier (per day unless noted) | What one roast costs | Guardrail |
| --- | --- | --- | --- |
| Workers requests | 100,000 | ~5 (roast, shots x2, quota, history) | n/a |
| Browser Rendering | 10 browser-minutes, 3 concurrent | ~15-25 s (two viewports) + ~3 s for the OG card | `DAILY_QUOTA` (default 300) is the hard ceiling; realistically ~25-40 fresh roasts fit in 10 minutes, so set it lower if you want a predictable day |
| D1 | 5M reads, 100k writes, 5 GB | 1 write, a few reads | 24h cache per URL, dedupe on leaderboard |
| KV | 100k reads, 1k writes | 2 reads, 2 writes | counters only; ~48h TTL |
| R2 | 10 GB, 1M class-A ops/month | ~150 KB (2 WebP) + ~60 KB PNG | immutable cache headers, served by the Worker |
| Groq | rate-limited free tier (tokens/min, requests/day vary by model) | 1 vision request (~2 images, ~1.5k output tokens) | `PER_IP_DAILY` (default 5) and `DAILY_QUOTA`; 429 from Groq is surfaced as `ai_rate_limited` |
| Pages | 500 builds/month, unlimited requests | n/a | n/a |

Browser Rendering minutes are the real bottleneck. See "Known limitations".

Other guardrails:

- SSRF guard (`apps/worker/src/lib/url-guard.ts`): only http/https, no credentials, allowlisted ports, blocks `localhost`, `*.local`, `*.internal`, single-label hosts, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, 0/8, multicast, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped IPv6, decimal/hex IP disguises.
- Quotas are checked before any expensive work and incremented only after a roast is persisted (blocked attempts count too, since they burn browser minutes).
- Cached results never touch Browser Rendering or Groq.
- All errors are JSON `{ error, message, ... }` with `429` for `quota_exhausted`, `ip_limit`, `ai_rate_limited`.

## Local setup

Prerequisites: Node 20+, pnpm 9+, a Cloudflare account (free), optionally a Groq API key.

```bash
git clone https://github.com/NityaB24/portfolio-roast.git
cd portfolio-roast
pnpm install

# Cloudflare resources (one time)
cd apps/worker
npx wrangler login
npx wrangler d1 create portfolio-roast          # paste database_id into wrangler.toml
npx wrangler kv namespace create QUOTA         # paste id into wrangler.toml
npx wrangler r2 bucket create portfolio-roast-shots

# Schema
pnpm db:migrate:local                          # for wrangler dev
pnpm db:migrate                                # remote D1

# Secrets (skip for mock mode)
cp .dev.vars.example .dev.vars                 # local: edit GROQ_API_KEY
npx wrangler secret put GROQ_API_KEY           # remote

# Frontend env
cd ../web && cp .env.example .env              # VITE_API_BASE=http://localhost:8787

# Run both apps
cd ../.. && pnpm dev                           # worker on :8787, web on :5173
```

D1, KV and R2 are simulated locally by Miniflare. Browser Rendering is the exception and depends on the wrangler major:

- **wrangler 3** (what `package.json` pins, so the committed lockfile stays valid): the `BROWSER` binding cannot be simulated. Run the worker against your real account with `cd apps/worker && npx wrangler dev --remote` (spends real Browser Rendering minutes, uses the remote D1/KV/R2 too).
- **wrangler 4**: `cd apps/worker && npx wrangler@4 dev` simulates the binding by downloading a pinned Chrome build (~150 MB, once, into `~/.cache/.wrangler/chrome`) and driving it locally. The same `wrangler.toml` works unchanged. If you run as root (Docker, Codespaces, cloud sandboxes) Chrome refuses to start without `--no-sandbox`; Miniflare only adds that flag when `CI` is set, so use `CI=1 npx wrangler@4 dev`. The local Chrome needs real DNS and outbound network; without them every roast comes back `blocked: true`.

Upgrading the repo itself is one command when you are ready: `pnpm -r add -D wrangler@^4 @cloudflare/workers-types@latest` (the tsconfigs already reference the un-dated `@cloudflare/workers-types` entry, which both majors ship).

### Mock mode

If `GROQ_API_KEY` is not set, `roastWithAI()` returns a deterministic fixture seeded from the URL (`apps/worker/src/ai/fixture.ts`). Screenshots and signals are still real. Use this to develop the frontend without burning AI credits. The record is stored with the normal `promptVersion`, so delete your local D1 rows before testing a real key.

### Local smoke test

With the worker running in mock mode you can exercise the whole pipeline (capture, signals, R2, D1, OG card) without a Groq key or a public site:

```bash
# 1. serve any HTML page on an allowed port under a public-looking hostname
echo "127.0.0.1 fixture.example.org" | sudo tee -a /etc/hosts
npx http-server ./some-folder -p 3000

# 2. roast it
curl -X POST http://localhost:8787/api/roast -H 'content-type: application/json' \
  -d '{"url":"http://fixture.example.org:3000/"}'

# 3. look at what came back
curl -o desktop.webp http://localhost:8787/api/shots/<id>/desktop.webp
curl -o card.png    http://localhost:8787/og/<id>.png
```

Loopback addresses and `localhost` are rejected by the SSRF guard on purpose, which is why the hosts-file alias is needed.

### Scripts

```bash
pnpm dev      # both apps
pnpm build    # tsc --noEmit for worker + web + functions, vite build
pnpm lint     # eslint (flat config, typescript-eslint, no `any`)
pnpm test     # vitest: url guard / SSRF, URL normalization, quota keys, zod schema, Groq adapter, OG injection, share helpers
pnpm deploy   # wrangler deploy (worker) + wrangler pages deploy (web)
```

## Deployment

### Worker

1. Fill the `# TODO: replace` IDs in `apps/worker/wrangler.toml` and set `PUBLIC_WEB_ORIGIN` to your Pages URL (for CORS).
2. `cd apps/worker && pnpm db:migrate && npx wrangler secret put GROQ_API_KEY && pnpm deploy`.
3. Note the `*.workers.dev` URL.

### Pages

1. Create a Pages project named `portfolio-roast` (connect the GitHub repo or use direct upload).
2. Build settings: root directory `apps/web`, build command `pnpm build`, output directory `dist`. Use `pnpm install` at the repo root as the install command if the project is connected to git.
3. Environment variables on the Pages project:
   - `VITE_API_BASE` = your Worker URL (build-time, baked into the bundle)
   - `API_BASE` = the same URL (runtime, read by the Pages Function that injects OG tags)
4. Or deploy from your machine: `cd apps/web && pnpm build && pnpm deploy`.

The `functions/` directory is picked up automatically by Pages; `/r/:id` runs through `functions/r/[id].ts`, every other route is served as the SPA shell.

## Prompt design

`apps/worker/src/ai/prompt.ts` holds the system prompt and `PROMPT_VERSION` (stored on every record so results can be compared across iterations).

- Persona: senior design lead doing a brutal but fair review. Roast the work, never the person. Explicit bans on slurs, identity comments and personal attacks.
- Inputs: desktop + mobile screenshots as base64 data URLs, plus a FACTS block measured by the headless browser (title, H1, meta description, font families, image/link/word counts, load time, dark-mode toggle, template fingerprints). The prompt requires citing those numbers and forbids inventing new ones.
- Output: strict JSON (`response_format: json_object`, temperature 0.4) validated with zod (`apps/worker/src/lib/schema.ts`). 5-7 roasts, each with severity, category, title, detail, fix and a bounding box in 0..1 fractions tagged with its viewport. 1-2 compliments. Boxes are clamped into the image after parsing; malformed output is retried once.
- Score calibration is spelled out in the prompt (median portfolio 55, templates in the 20s, 90+ only for hire-worthy work) to counter the model's tendency to award 7x/100 to everything.
- Swapping providers: replace `apps/worker/src/ai/groq.ts`; nothing else imports the Groq endpoint. The model name is a single constant (`GROQ_MODEL`).

## Known limitations

- `POST /api/remove/:id` is unauthenticated. Anyone with a result ID can hide that result. This is deliberate (no accounts anywhere), cheap to abuse, and acceptable for a toy with public IDs. Mitigation if it becomes a problem: require the removal to come from the same IP hash that created it, or add a signed token to the roast response.
- Browser Rendering's 10 free minutes per day is the real bottleneck, not Groq or Workers. Two viewports plus a reload cost 15-25 s per roast; OG cards cost another few seconds the first time they are requested. `DAILY_QUOTA=300` is a ceiling, not a promise.
- Sites that block headless Chrome, require JavaScript challenges, or exceed 15 s get a `blocked: true` record with score 0 and no screenshots. They are excluded from the leaderboard.
- The SSRF guard classifies the hostname and IP literal in the URL; it does not resolve DNS. A public hostname whose A record points at a private address (DNS rebinding) passes the guard and is fetched by Browser Rendering inside Cloudflare's network. Cloudflare's own egress blocks RFC 1918 targets, but if you care, add a DNS-over-HTTPS lookup of the host in `url-guard.ts` and reject private answers before capture.
- KV is eventually consistent, so the global quota can overshoot by a few requests under concurrent load.
- Hotspot coordinates come from a vision model and are approximate. They are clamped into the image but may still miss the intended element.
- The leaderboard is public by default (`optInLeaderboard = 1`). There is no email verification that the submitter owns the site.
- Groq's free tier changes; the configured model (`meta-llama/llama-4-scout-17b-16e-instruct`) may need updating in `groq.ts`.

## Résumé line

> Built **Portfolio Roast**, a zero-cost AI design-critique tool on Cloudflare Workers (Hono, D1, KV, R2, Browser Rendering) and Pages (React, Vite, Tailwind): headless-browser screenshots and page signals feed a vision LLM with strict JSON output, producing scored, screenshot-annotated roasts, OG share cards rendered on the edge, and a public leaderboard, with SSRF guarding, per-IP and global quotas, and a mock mode for key-free local development.

## License

MIT, Nitya B. See `LICENSE`.

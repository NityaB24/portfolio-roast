#!/usr/bin/env bash
# One-shot Cloudflare setup for Portfolio Roast.
#
# Creates the D1 database, KV namespace and R2 bucket on the free tier, writes
# their IDs into apps/worker/wrangler.toml, applies the D1 migrations remotely,
# and (optionally) stores the Groq API key as a Worker secret.
#
# Prerequisites: `pnpm install` done, and `npx wrangler login` completed once.
# Safe to re-run: existing resources are reused, IDs are rewritten in place.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="$ROOT/apps/worker"
TOML="$WORKER/wrangler.toml"
DB_NAME="portfolio-roast"
KV_TITLE="QUOTA"
BUCKET="portfolio-roast-shots"

cd "$WORKER"
w() { npx --yes wrangler "$@"; }

echo "==> Checking wrangler login"
if ! w whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: npx wrangler login   (then re-run this script)"; exit 1
fi

echo "==> D1 database: $DB_NAME"
DB_ID="$(w d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.name===process.argv[1]);process.stdout.write(r?r.uuid:"")})' "$DB_NAME")"
if [ -z "$DB_ID" ]; then
  w d1 create "$DB_NAME" >/dev/null
  DB_ID="$(w d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.name===process.argv[1]);process.stdout.write(r?r.uuid:"")})' "$DB_NAME")"
fi
echo "    id: $DB_ID"

echo "==> KV namespace: $KV_TITLE"
KV_ID="$(w kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=s.match(/\[[\s\S]*\]/);const r=m?JSON.parse(m[0]).find(x=>x.title.endsWith(process.argv[1])):null;process.stdout.write(r?r.id:"")})' "$KV_TITLE")"
if [ -z "$KV_ID" ]; then
  w kv namespace create "$KV_TITLE" >/dev/null
  KV_ID="$(w kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=s.match(/\[[\s\S]*\]/);const r=m?JSON.parse(m[0]).find(x=>x.title.endsWith(process.argv[1])):null;process.stdout.write(r?r.id:"")})' "$KV_TITLE")"
fi
echo "    id: $KV_ID"

echo "==> R2 bucket: $BUCKET"
if ! w r2 bucket list 2>/dev/null | grep -q "^name:\s*$BUCKET\$\|\"name\": \"$BUCKET\"\|^$BUCKET\$\|name:  *$BUCKET"; then
  w r2 bucket create "$BUCKET" >/dev/null || true
fi
echo "    ok"

echo "==> Writing IDs into wrangler.toml"
node - "$TOML" "$DB_ID" "$KV_ID" <<'NODE'
const fs = require("fs");
const [file, dbId, kvId] = process.argv.slice(2);
let t = fs.readFileSync(file, "utf8");
t = t.replace(/^(database_id\s*=\s*")[^"]*(")/m, `$1${dbId}$2`);
t = t.replace(/^(\[\[kv_namespaces\]\][\s\S]*?^id\s*=\s*")[^"]*(")/m, `$1${kvId}$2`);
fs.writeFileSync(file, t);
NODE
grep -nE '^(database_id|id) =' "$TOML"

echo "==> Applying D1 migrations (remote)"
w d1 migrations apply "$DB_NAME" --remote

if [ -n "${GROQ_API_KEY:-}" ]; then
  echo "==> Storing GROQ_API_KEY secret"
  printf '%s' "$GROQ_API_KEY" | w secret put GROQ_API_KEY
else
  echo "==> GROQ_API_KEY not set in the environment; skipping. The worker runs in mock mode until you run:"
  echo "    cd apps/worker && npx wrangler secret put GROQ_API_KEY"
fi

cat <<MSG

Done. Next:
  1. cd apps/worker && pnpm deploy            # prints the *.workers.dev URL
  2. Set PUBLIC_WEB_ORIGIN in wrangler.toml to your Pages URL and deploy again
  3. Pages: cd apps/web && VITE_API_BASE=<worker url> pnpm build && pnpm deploy
     then set API_BASE=<worker url> on the Pages project (Settings > Variables)
MSG

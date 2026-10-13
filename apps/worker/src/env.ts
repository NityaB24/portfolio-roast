import type { BrowserWorker } from "@cloudflare/puppeteer";

export interface Env {
  DB: D1Database;
  QUOTA: KVNamespace;
  SHOTS: R2Bucket;
  BROWSER: BrowserWorker;
  GROQ_API_KEY?: string;
  DAILY_QUOTA?: string;
  PER_IP_DAILY?: string;
  PUBLIC_WEB_ORIGIN?: string;
}

export function intVar(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

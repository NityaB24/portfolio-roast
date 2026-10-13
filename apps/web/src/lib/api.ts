export const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8787").replace(/\/$/, "");
export const REPO_URL = "https://github.com/NityaB24/portfolio-roast";

export type Severity = "high" | "med" | "low";
export type Category = "hierarchy" | "copy" | "performance" | "mobile" | "originality" | "accessibility";
export type Viewport = "desktop" | "mobile";

export interface RoastItem {
  severity: Severity;
  category: Category;
  title: string;
  detail: string;
  fix: string;
  box: { x: number; y: number; w: number; h: number; viewport: Viewport };
}

export interface Signals {
  title: string;
  h1: string;
  metaDescription: string;
  fontFamilies: string[];
  imageCount: number;
  linkCount: number;
  hasDarkModeToggle: boolean;
  loadMs: number;
  wordCount: number;
  usesCommonTemplate: boolean;
  templateHints: string[];
  finalUrl: string;
}

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
  blocked: boolean;
  createdAt: string;
  optInLeaderboard: boolean;
  cached?: boolean;
  blockedReason?: string;
}

export interface Quota {
  used: number;
  limit: number;
  resetsAt: string;
}

export interface LeaderboardEntry {
  id: string;
  normalizedUrl: string;
  domain: string;
  score: number;
  verdict: string;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  score: number;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "network", "Could not reach the roast API. Is the worker running?");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body
  }
  if (!res.ok) {
    const body = (json ?? {}) as { error?: string; message?: string } & Record<string, unknown>;
    throw new ApiError(res.status, body.error ?? "http_error", body.message ?? `Request failed (${res.status})`, body);
  }
  return json as T;
}

export const api = {
  quota: () => request<Quota>("/api/quota"),
  roast: (url: string) =>
    request<RoastRecord>("/api/roast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  get: (id: string) => request<RoastRecord>(`/api/roast/${encodeURIComponent(id)}`),
  top: (period: "week" | "all") => request<{ entries: LeaderboardEntry[] }>(`/api/top?period=${period}`),
  bottom: () => request<{ entries: LeaderboardEntry[] }>("/api/bottom"),
  history: (url: string) => request<{ entries: HistoryEntry[] }>(`/api/history?url=${encodeURIComponent(url)}`),
  remove: (id: string) => request<{ ok: boolean }>(`/api/remove/${encodeURIComponent(id)}`, { method: "POST" }),
  shotUrl: (id: string, viewport: Viewport) => `${API_BASE}/api/shots/${id}/${viewport}.webp`,
  ogUrl: (id: string) => `${API_BASE}/og/${id}.png`,
};

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const SEVERITY_LABEL: Record<Severity, string> = { high: "Critical", med: "Hurts", low: "Polish" };
export const SEVERITY_CLASS: Record<Severity, string> = { high: "text-sev-high", med: "text-sev-med", low: "text-sev-low" };

export function scoreTone(score: number, blocked = false): { color: string; label: string } {
  if (blocked) return { color: "text-bone-3", label: "Blocked" };
  if (score >= 85) return { color: "text-good", label: "Hire-worthy" };
  if (score >= 70) return { color: "text-sev-med", label: "Solid" };
  if (score >= 50) return { color: "text-[#ff8a3d]", label: "Mid" };
  return { color: "text-blood", label: "Roasted" };
}

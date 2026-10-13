export function shareText(domain: string, score: number): string {
  const line = score >= 85 ? "survived" : score >= 60 ? "limped out of" : "got destroyed by";
  return `${domain} ${line} Portfolio Roast with a ${score}/100. Paste yours if you dare.`;
}

export function xShareUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function linkedInShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

export const REROAST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function msUntilReroast(createdAt: string, now = Date.now()): number {
  return Math.max(0, new Date(createdAt).getTime() + REROAST_COOLDOWN_MS - now);
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

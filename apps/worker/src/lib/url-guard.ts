/**
 * URL normalization and SSRF guard.
 *
 * Browser Rendering runs inside Cloudflare's network, so we must never let a
 * user point it at loopback, link-local, private or otherwise internal hosts.
 * The guard is conservative: anything we cannot classify as a public hostname
 * or a public IP literal is rejected.
 */

export type GuardResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: GuardReason };

export type GuardReason =
  | "empty"
  | "invalid"
  | "scheme"
  | "credentials"
  | "localhost"
  | "private_ip"
  | "internal_tld"
  | "port";

const BLOCKED_TLDS = new Set(["local", "internal", "localhost", "localdomain", "home", "lan", "intranet", "corp", "test", "example", "invalid", "onion"]);
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443", "3000"]);

/**
 * Parse user input into a URL, adding `https://` when no scheme is present.
 * "letters:" counts as a scheme only when it is not followed by a digit, so
 * `example.com:3000` is treated as host:port while `javascript:alert(1)` and
 * `mailto:x` keep their (rejected) scheme.
 */
export function parseInput(raw: string): URL | null {
  let input = raw.trim();
  if (!input) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(input);
  if (!hasScheme) input = `https://${input}`;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/** Canonical form of an already-parsed URL: no hash, no credentials, lowercase host, no default port, no trailing slash. */
export function normalizeParsed(input: URL): string {
  const u = new URL(input.toString());
  u.hash = "";
  u.username = "";
  u.password = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.+$/, "");
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    u.port = "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return u.toString();
  // Collapse trailing slash on bare origins so https://a.com and https://a.com/ match.
  if (u.pathname === "/" && !u.search) {
    return u.origin;
  }
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

/** Normalize a user-supplied URL: add https, lowercase host, strip hash. Null when unparseable. */
export function normalizeUrl(raw: string): string | null {
  const u = parseInput(raw);
  return u ? normalizeParsed(u) : null;
}

export function parseIPv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => p > 255)) return null;
  return parts as [number, number, number, number];
}

export function isPrivateIPv4(host: string): boolean {
  const p = parseIPv4(host);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this" network
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** Expand an IPv6 literal (without brackets) into 8 16-bit groups, or null. */
export function expandIPv6(host: string): number[] | null {
  let h = host.toLowerCase();
  // Strip zone id like fe80::1%eth0
  const zone = h.indexOf("%");
  if (zone !== -1) h = h.slice(0, zone);
  // Embedded IPv4 (::ffff:1.2.3.4)
  const v4tail = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (v4tail) {
    const v4 = parseIPv4(v4tail[2] ?? "");
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    h = `${v4tail[1]}${hi}:${lo}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

export function isPrivateIPv6(host: string): boolean {
  const g = expandIPv6(host);
  if (!g) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const allZero = g.every((x) => x === 0);
  if (allZero) return true; // ::
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    // IPv4-mapped: check the embedded v4
    const v4 = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
    return isPrivateIPv4(v4);
  }
  if (g0 === 0x64 && g1 === 0xff9b) {
    // NAT64 64:ff9b::/96 — treat embedded v4 the same way
    const v4 = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
    return isPrivateIPv4(v4);
  }
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  return false;
}

export function isBlockedHostname(host: string): GuardReason | null {
  const h = host.toLowerCase().replace(/\.+$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return "localhost";
  if (h === "0" || h === "0.0.0.0") return "private_ip";
  // Decimal / hex / octal IPv4 disguises: "2130706433", "0x7f000001", "017700000001".
  // WHATWG URL already folds most of these into dotted form; this is belt and braces.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return "private_ip";
  if (/^\d+(\.\d+){1,3}$/.test(h) && !parseIPv4(h)) return "private_ip";
  const labels = h.split(".");
  // Single-label hostnames (e.g. "intranet", "router") never resolve publicly.
  if (labels.length < 2) return "localhost";
  const tld = labels[labels.length - 1] ?? "";
  if (BLOCKED_TLDS.has(tld)) return "internal_tld";
  return null;
}

/**
 * Validate a raw URL. Returns the normalized URL if it is safe to fetch.
 * Checks run on the parsed input (before normalization strips credentials).
 */
export function guardUrl(raw: string): GuardResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };
  const u = parseInput(raw);
  if (!u) return { ok: false, reason: "invalid" };
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (u.username || u.password) return { ok: false, reason: "credentials" };
  if (!ALLOWED_PORTS.has(u.port)) return { ok: false, reason: "port" };

  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "invalid" };
  const normalized = normalizeParsed(u);
  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = host.slice(1, -1);
    if (!expandIPv6(v6)) return { ok: false, reason: "invalid" };
    if (isPrivateIPv6(v6)) return { ok: false, reason: "private_ip" };
    return { ok: true, url: normalized, host };
  }
  if (parseIPv4(host)) {
    if (isPrivateIPv4(host)) return { ok: false, reason: "private_ip" };
    return { ok: true, url: normalized, host };
  }
  const blocked = isBlockedHostname(host);
  if (blocked) return { ok: false, reason: blocked };
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    // URL already punycodes IDNs; anything else left is malformed.
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, url: normalized, host };
}

export const GUARD_MESSAGES: Record<GuardReason, string> = {
  empty: "Give me a URL to roast.",
  invalid: "That does not look like a URL.",
  scheme: "Only http and https URLs are allowed.",
  credentials: "URLs with embedded credentials are not allowed.",
  localhost: "I cannot roast your localhost. Deploy it first, coward.",
  private_ip: "Private and internal addresses are off limits.",
  internal_tld: "Internal hostnames are off limits.",
  port: "That port is not allowed. Use 80, 443, 3000, 8080 or 8443.",
};

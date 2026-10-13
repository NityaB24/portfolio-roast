import { describe, expect, it } from "vitest";
import { expandIPv6, guardUrl, isPrivateIPv4, isPrivateIPv6, normalizeUrl } from "../src/lib/url-guard";

describe("normalizeUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("example.com/work")).toBe("https://example.com/work");
  });
  it("lowercases the host and keeps path case", () => {
    expect(normalizeUrl("HTTPS://Example.COM/About")).toBe("https://example.com/About");
  });
  it("strips the hash", () => {
    expect(normalizeUrl("https://example.com/#top")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com/a#x")).toBe("https://example.com/a");
  });
  it("drops default ports and trailing slashes", () => {
    expect(normalizeUrl("https://example.com:443/")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com:80/x/")).toBe("http://example.com/x");
  });
  it("keeps query strings", () => {
    expect(normalizeUrl("example.com/?ref=hn")).toBe("https://example.com/?ref=hn");
  });
  it("returns null on garbage", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("http://")).toBeNull();
  });
});

describe("IPv4 classification", () => {
  it.each(["10.0.0.1", "10.255.255.255", "127.0.0.1", "127.9.9.9", "169.254.169.254", "172.16.0.1", "172.31.255.254", "192.168.1.1", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255"])(
    "blocks %s",
    (ip) => expect(isPrivateIPv4(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "192.167.1.1", "11.0.0.1", "100.63.0.1", "100.128.0.1"])("allows %s", (ip) => expect(isPrivateIPv4(ip)).toBe(false));
});

describe("IPv6 classification", () => {
  it("expands compressed addresses", () => {
    expect(expandIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("fe80::1")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001]);
    expect(expandIPv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(expandIPv6("1::2::3")).toBeNull();
    expect(expandIPv6("zzzz::")).toBeNull();
  });
  it.each(["::1", "::", "fc00::1", "fd12:3456::1", "fe80::abcd", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "ff02::1"])("blocks %s", (ip) =>
    expect(isPrivateIPv6(ip)).toBe(true),
  );
  it.each(["2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPrivateIPv6(ip)).toBe(false));
});

describe("guardUrl (SSRF)", () => {
  const blocked: Array<[string, string]> = [
    ["http://localhost", "localhost"],
    ["http://localhost:3000/", "localhost"],
    ["https://LOCALHOST", "localhost"],
    ["http://foo.localhost", "localhost"],
    ["http://127.0.0.1", "private_ip"],
    ["http://127.1.2.3:8080", "private_ip"],
    ["http://10.1.2.3", "private_ip"],
    ["http://172.16.5.4", "private_ip"],
    ["http://192.168.0.10", "private_ip"],
    ["http://169.254.169.254/latest/meta-data", "private_ip"],
    ["http://0.0.0.0", "private_ip"],
    ["http://[::1]", "private_ip"],
    ["http://[::1]:8080/", "private_ip"],
    ["http://[fc00::1]", "private_ip"],
    ["http://[fe80::1]", "private_ip"],
    ["http://[::ffff:127.0.0.1]", "private_ip"],
    ["http://2130706433", "private_ip"], // decimal 127.0.0.1
    ["http://0x7f000001", "private_ip"], // hex 127.0.0.1
    ["http://127.1", "private_ip"], // shorthand
    ["http://myserver.local", "internal_tld"],
    ["http://db.internal", "internal_tld"],
    ["http://router.lan", "internal_tld"],
    ["http://intranet", "localhost"],
    ["ftp://example.com", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["gopher://example.com", "scheme"],
    ["http://user:pass@example.com", "credentials"],
    ["https://admin:hunter2@example.com/", "credentials"],
    ["mailto:someone@example.com", "scheme"],
    ["http://nope.example", "internal_tld"],
    ["http://router", "localhost"],
    ["http://example.com:22", "port"],
    ["http://example.com:6379", "port"],
    ["", "empty"],
    ["not a url at all", "invalid"],
  ];
  it.each(blocked)("rejects %s (%s)", (url, reason) => {
    const r = guardUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  const allowed = ["https://example.com", "example.com", "http://example.com:8080/x", "https://sub.domain.example.io/portfolio?x=1", "https://8.8.8.8", "https://[2606:4700:4700::1111]", "https://xn--bcher-kva.de", "HTTPS://Example.COM:443/#hero", "localhost.example.com"];
  it.each(allowed)("allows %s", (url) => {
    const r = guardUrl(url);
    expect(r.ok).toBe(true);
  });

  it("returns the normalized url", () => {
    const r = guardUrl("Example.COM/#hero");
    expect(r.ok && r.url).toBe("https://example.com");
    const q = guardUrl("example.com:3000/work/?a=1#top");
    expect(q.ok && q.url).toBe("https://example.com:3000/work?a=1");
  });

  it("treats host:port input as a host, not a scheme", () => {
    expect(normalizeUrl("example.com:8080/x")).toBe("https://example.com:8080/x");
    const r = guardUrl("localhost:3000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("localhost");
  });
});

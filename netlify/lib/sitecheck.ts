import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";
import { todayJhb } from "../../src/domain/dates";
import type { Site, SiteCheck, SiteCheckSummary } from "../../src/shared/schema";
import type { KV } from "./kv";

export const HISTORY_LENGTH = 96; // two days at one check per 30 minutes
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("::ffff:")) return isPrivateAddress(s.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return true;
}

/**
 * DNS lookup used for the actual socket connection. It refuses any name that resolves to a private
 * address, and because the socket connects to exactly the address checked here there is no gap
 * for DNS rebinding between "check" and "connect".
 */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  if (isIP(hostname)) {
    callback(new Error("IP addresses are not checked"), "", 4);
    return;
  }
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as unknown as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error("Host resolves to a private address"), "", 4);
    }
    if (options.all) (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    else callback(null, list[0].address, list[0].family);
  });
};

interface Hop {
  status: number;
  location: string | null;
  cert: { validTo: string | null; authorized: boolean; authError: string | null } | null;
}

function requestOnce(url: URL): Promise<Hop> {
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        agent: false,
        timeout: TIMEOUT_MS,
        // Read the certificate even when it is expired or invalid, so the dashboard can say so.
        rejectUnauthorized: false,
        servername: url.hostname,
        headers: { "User-Agent": "AtheaSiteCheck/1.0", Accept: "text/html" },
      } as https.RequestOptions,
      (res) => {
        const sock = res.socket as TLSSocket;
        let cert: Hop["cert"] = null;
        if (typeof sock.getPeerCertificate === "function") {
          const c = sock.getPeerCertificate();
          cert = {
            validTo: c && c.valid_to ? c.valid_to : null,
            authorized: sock.authorized,
            authError: sock.authorizationError ? String(sock.authorizationError) : null,
          };
        }
        const hop: Hop = { status: res.statusCode ?? 0, location: res.headers.location ?? null, cert };
        res.destroy();
        resolve(hop);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out after 10 s")));
    req.on("error", reject);
    req.end();
  });
}

function certDate(validTo: string | null): string | null {
  if (!validTo) return null;
  const d = new Date(validTo);
  return Number.isNaN(d.getTime()) ? null : todayJhb(d);
}

export async function checkSite(site: Pick<Site, "id" | "url">, now: Date = new Date()): Promise<SiteCheck> {
  const base: SiteCheck = {
    siteId: site.id,
    siteUrl: site.url,
    checkedAt: now.toISOString(),
    httpStatus: null,
    responseMs: null,
    sslExpiresOn: null,
    error: null,
  };
  const start = performance.now();
  let current = new URL(site.url);
  let firstCert: Hop["cert"] = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== "https:" && current.protocol !== "http:") throw new Error("Unsupported redirect");
      const r = await requestOnce(current);
      if (hop === 0) firstCert = r.cert;
      if (r.status >= 300 && r.status < 400 && r.location) {
        current = new URL(r.location, current);
        continue;
      }
      const sslExpiresOn = certDate(firstCert?.validTo ?? null);
      const certProblem = firstCert && !firstCert.authorized ? `Certificate problem: ${firstCert.authError ?? "not trusted"}` : null;
      return { ...base, httpStatus: r.status, responseMs: Math.round(performance.now() - start), sslExpiresOn, error: certProblem };
    }
    throw new Error("Too many redirects");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Check failed";
    return { ...base, sslExpiresOn: certDate(firstCert?.validTo ?? null), error: msg.slice(0, 300) };
  }
}

export function mergeSummary(prev: SiteCheckSummary | null, check: SiteCheck): SiteCheckSummary {
  const ok = !check.error && check.httpStatus != null && check.httpStatus < 400;
  const history = [...(prev?.history ?? []), { checkedAt: check.checkedAt, responseMs: check.responseMs, ok }].slice(-HISTORY_LENGTH);
  return { latest: check, history, lighthouse: prev?.lighthouse ?? null };
}

export async function saveCheck(kv: KV, check: SiteCheck): Promise<void> {
  const key = `site-${check.siteId}`;
  for (let i = 0; i < 3; i++) {
    const cur = await kv.get<SiteCheckSummary>(key);
    const next = mergeSummary(cur?.data ?? null, check);
    const ok = cur?.etag ? await kv.set(key, next, { onlyIfMatch: cur.etag }) : await kv.set(key, next, { onlyIfNew: true });
    if (ok) return;
  }
}

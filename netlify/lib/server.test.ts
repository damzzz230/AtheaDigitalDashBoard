import { describe, expect, it } from "vitest";
import { handleData, handleLogin, handleLogout, handleRecords, handleSession, type Deps } from "./handlers";
import { memoryKV } from "./kv";
import { hashPassphrase, verifyPassphrase } from "./password";
import { createToken, COOKIE_NAME, verifyToken } from "./session";
import { siteHealth } from "../../src/domain/sites";
import { checkSite, isPrivateAddress, mergeSummary, safeLookup } from "./sitecheck";

const SECRET = "x".repeat(48);
const ORIGIN = "https://dash.example";

async function makeDeps(over: Partial<Deps> = {}) {
  const env: Record<string, string> = {
    SESSION_SECRET: SECRET,
    DAMZ_PASS_HASH: await hashPassphrase("correct horse battery"),
    DAS_PASS_HASH: await hashPassphrase("another long phrase"),
  };
  let t = Date.parse("2026-11-19T08:00:00Z");
  const slept: number[] = [];
  const deps: Deps = {
    data: memoryKV(),
    auth: memoryKV(),
    checks: memoryKV(),
    env: (k) => env[k],
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
    },
    ...over,
  };
  return { deps, slept, advance: (ms: number) => (t += ms) };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const cookieFor = (user: "damz" | "das", deps: Deps) => `${COOKIE_NAME}=${createToken(user, SECRET, deps.now())}`;

describe("passphrase hashing", () => {
  it("round-trips and rejects wrong or malformed input", async () => {
    const h = await hashPassphrase("a long passphrase here");
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassphrase("a long passphrase here", h)).toBe(true);
    expect(await verifyPassphrase("a long passphrase herE", h)).toBe(false);
    expect(await verifyPassphrase("x", "garbage")).toBe(false);
    expect(await verifyPassphrase("x", undefined)).toBe(false);
  });
});

describe("session token", () => {
  const now = Date.parse("2026-11-19T08:00:00Z");
  it("verifies, expires after 14 days and rejects tampering", () => {
    const t = createToken("das", SECRET, now);
    expect(verifyToken(t, SECRET, now + 1000)).toBe("das");
    expect(verifyToken(t, SECRET, now + 14 * 86_400_000 + 1)).toBeNull();
    expect(verifyToken(t, "y".repeat(48), now)).toBeNull();
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "damz", exp: now + 1e9 })).toString("base64url");
    expect(verifyToken(`${forged}.${s}`, SECRET, now)).toBeNull();
    expect(verifyToken(`${p}.`, SECRET, now)).toBeNull();
  });
});

describe("login", () => {
  it("sets an httpOnly, Secure, SameSite=Strict cookie on success", async () => {
    const { deps } = await makeDeps();
    const res = await handleLogin(post("/api/login", { user: "damz", passphrase: "correct horse battery" }), deps, "1.2.3.4");
    expect(res.status).toBe(200);
    const c = res.headers.get("set-cookie") ?? "";
    expect(c).toMatch(/^__Host-athea_session=/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Max-Age=1209600/);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
  });
  it("delays failures and rate-limits after 5 per IP", async () => {
    const { deps, slept, advance } = await makeDeps();
    for (let i = 0; i < 5; i++) {
      const r = await handleLogin(post("/api/login", { user: "das", passphrase: "nope" }), deps, "9.9.9.9");
      expect(r.status).toBe(401);
    }
    expect(slept).toHaveLength(5);
    expect(slept.every((ms) => ms >= 700)).toBe(true);
    const blocked = await handleLogin(post("/api/login", { user: "das", passphrase: "another long phrase" }), deps, "9.9.9.9");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const other = await handleLogin(post("/api/login", { user: "das", passphrase: "another long phrase" }), deps, "8.8.8.8");
    expect(other.status).toBe(200);
    advance(16 * 60 * 1000);
    const later = await handleLogin(post("/api/login", { user: "das", passphrase: "another long phrase" }), deps, "9.9.9.9");
    expect(later.status).toBe(200);
  });
  it("lets only 5 of a parallel burst from one IP reach the passphrase check", async () => {
    const { deps } = await makeDeps();
    const burst = await Promise.all(
      Array.from({ length: 20 }, () => handleLogin(post("/api/login", { user: "damz", passphrase: "guess" }), deps, "7.7.7.7")),
    );
    const statuses = burst.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(15);
  });
  it("never locks a founder out from other IPs: per-user failures only slow down", async () => {
    const { deps, slept } = await makeDeps();
    for (let i = 0; i < 12; i++) {
      await handleLogin(post("/api/login", { user: "das", passphrase: "nope" }), deps, `10.0.0.${i}`);
    }
    expect(slept.at(-1)).toBeGreaterThanOrEqual(3700);
    const real = await handleLogin(post("/api/login", { user: "das", passphrase: "another long phrase" }), deps, "41.1.1.1");
    expect(real.status).toBe(200);
  });
  it("refuses non-JSON, cross-origin, unknown users and a missing secret", async () => {
    const { deps } = await makeDeps();
    const form = new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "user=damz" });
    expect((await handleLogin(form, deps, "1.1.1.1")).status).toBe(415);
    expect((await handleLogin(post("/api/login", { user: "damz", passphrase: "x" }, { origin: "https://evil.example" }), deps, "1.1.1.1")).status).toBe(403);
    expect((await handleLogin(post("/api/login", { user: "gabriel", passphrase: "x" }), deps, "1.1.1.1")).status).toBe(400);
    const { deps: noSecret } = await makeDeps({ env: () => undefined });
    expect((await handleLogin(post("/api/login", { user: "damz", passphrase: "x" }), noSecret, "1.1.1.1")).status).toBe(500);
  });
  it("fails closed when the user's hash env var is unset", async () => {
    const { deps } = await makeDeps();
    const d = { ...deps, env: (k: string) => (k === "DAS_PASS_HASH" ? undefined : deps.env(k)) };
    expect((await handleLogin(post("/api/login", { user: "das", passphrase: "" + "another long phrase" }), d, "1.1.1.1")).status).toBe(401);
  });
  it("logs out by clearing the cookie", async () => {
    const res = await handleLogout(post("/api/logout", {}));
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});

describe("data and records", () => {
  it("require a session", async () => {
    const { deps } = await makeDeps();
    expect((await handleSession(new Request(`${ORIGIN}/api/session`), deps)).status).toBe(401);
    expect((await handleData(new Request(`${ORIGIN}/api/data`), deps)).status).toBe(401);
    expect((await handleRecords(post("/api/records", {}), deps)).status).toBe(401);
  });

  it("seeds once and returns the snapshot", async () => {
    const { deps } = await makeDeps();
    const res = await handleData(new Request(`${ORIGIN}/api/data`, { headers: { cookie: cookieFor("das", deps) } }), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBe("das");
    expect(Object.keys(body.collections.projects).sort()).toEqual(["p-bugz", "p-topdraw"]);
    expect(body.pagespeedEnabled).toBe(false);
  });

  it("gives the second editor a 409 conflict, never a silent overwrite", async () => {
    const { deps } = await makeDeps();
    const damz = cookieFor("damz", deps);
    const das = cookieFor("das", deps);
    const snap = await (await handleData(new Request(`${ORIGIN}/api/data`, { headers: { cookie: damz } }), deps)).json();
    const lead = snap.collections.leads["l-hair77"];
    const first = await handleRecords(post("/api/records", { op: "put", collection: "leads", id: lead.id, expectedVersion: lead.version, record: { ...lead, notes: "from Damz" } }, { cookie: damz }), deps);
    expect(first.status).toBe(200);
    const second = await handleRecords(post("/api/records", { op: "put", collection: "leads", id: lead.id, expectedVersion: lead.version, record: { ...lead, notes: "from Das" } }, { cookie: das }), deps);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.current.notes).toBe("from Damz");
    expect(body.current.updatedBy).toBe("damz");
  });

  it("retries when another write to the same collection lands in between", async () => {
    const { deps } = await makeDeps();
    const cookie = cookieFor("damz", deps);
    await handleData(new Request(`${ORIGIN}/api/data`, { headers: { cookie } }), deps);
    const real = deps.data;
    let raced = false;
    deps.data = {
      ...real,
      async set(key, data, cond) {
        if (!raced && key === "col-leads") {
          raced = true;
          const cur = await real.get<Record<string, unknown>>(key);
          await real.set(key, { ...(cur?.data ?? {}) }, {});
        }
        return real.set(key, data, cond);
      },
    };
    const r = await handleRecords(post("/api/records", { op: "put", collection: "leads", id: "new-1", expectedVersion: 0, record: { business: "New" } }, { cookie }), deps);
    expect(r.status).toBe(200);
    expect(raced).toBe(true);
  });

  it("validates input server-side", async () => {
    const { deps } = await makeDeps();
    const cookie = cookieFor("damz", deps);
    const bad = await handleRecords(post("/api/records", { op: "put", collection: "leads", id: "x", expectedVersion: 0, record: { business: "Y", notes: "password: hunter2" } }, { cookie }), deps);
    expect(bad.status).toBe(400);
    const unknown = await handleRecords(post("/api/records", { op: "drop", collection: "leads" }, { cookie }), deps);
    expect(unknown.status).toBe(400);
    const badCol = await handleRecords(post("/api/records", { op: "put", collection: "users", id: "x", expectedVersion: 0, record: {} }, { cookie }), deps);
    expect(badCol.status).toBe(400);
  });
});

describe("site checks", () => {
  it("refuses private and reserved addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["41.185.8.1", "8.8.8.8", "2001:4860:4860::8888"]) expect(isPrivateAddress(ip)).toBe(false);
  });
  it("refuses to connect when the name resolves to a private address (pinned lookup, no rebinding gap)", async () => {
    const r = await checkSite({ id: "s", url: "https://localhost" });
    expect(r.httpStatus).toBeNull();
    expect(r.error).toMatch(/private address/);
    await new Promise<void>((resolve) =>
      safeLookup("localhost", {}, (err) => {
        expect(err?.message).toMatch(/private address/);
        resolve();
      }),
    );
  });
  it("reports a certificate problem with the status code when the page still answers", () => {
    const h = siteHealth(
      { latest: { siteId: "s", siteUrl: "u", checkedAt: "2026-11-19T07:59:00Z", httpStatus: 200, responseMs: 300, sslExpiresOn: "2026-11-10", error: "Certificate problem: CERT_HAS_EXPIRED" }, history: [], lighthouse: null },
      "2026-11-19",
      new Date("2026-11-19T08:00:00Z"),
    );
    expect(h.light).toBe("bad");
    expect(h.reasons).toContain("SSL certificate expired");
    expect(h.reasons[0]).toBe("Certificate problem: CERT_HAS_EXPIRED");
  });
  it("keeps a capped history", () => {
    let s = mergeSummary(null, { siteId: "s", siteUrl: "u", checkedAt: "t0", httpStatus: 200, responseMs: 300, sslExpiresOn: null, error: null });
    for (let i = 1; i < 120; i++) s = mergeSummary(s, { ...s.latest!, checkedAt: `t${i}`, httpStatus: 500 });
    expect(s.history).toHaveLength(96);
    expect(s.history.at(-1)).toEqual({ checkedAt: "t119", responseMs: 300, ok: false });
  });
});

import { z } from "zod";
import { applyMutation } from "../../src/shared/mutate";
import {
  COLLECTIONS,
  mutationSchema,
  PEOPLE,
  type CollectionMap,
  type CollectionName,
  type Collections,
  type Person,
  type SiteCheckSummary,
  type Snapshot,
} from "../../src/shared/schema";
import { seedCollections } from "../../src/shared/seed";
import { BodyError, checkOrigin, error, json, readJson, requireJson } from "./http";
import type { KV } from "./kv";
import { verifyPassphrase } from "./password";
import { bump, clear, ipKey, MAX_ATTEMPTS_PER_IP, retryAfterSeconds, SLOW_AFTER_PER_USER, userKey, USER_SLOWDOWN_MS } from "./ratelimit";
import { clearedCookie, createToken, secretOk, sessionCookie, userFromRequest } from "./session";

export interface Deps {
  data: KV;
  auth: KV;
  checks: KV;
  env: (name: string) => string | undefined;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const colKey = (c: CollectionName) => `col-${c}`;
const SEEDED_KEY = "meta-seeded";

function authed(req: Request, deps: Deps): Person | null {
  return userFromRequest(req, deps.env("SESSION_SECRET"), deps.now());
}

const loginSchema = z.object({
  user: z.enum(PEOPLE),
  passphrase: z.string().min(1).max(1024),
});

export async function handleLogin(req: Request, deps: Deps, ip: string): Promise<Response> {
  if (req.method !== "POST") return error(405, "Method not allowed");
  const bad = requireJson(req) ?? checkOrigin(req);
  if (bad) return bad;
  const secret = deps.env("SESSION_SECRET");
  if (!secretOk(secret)) return error(500, "Server is not configured: SESSION_SECRET missing or too short");

  let body: unknown;
  try {
    body = await readJson(req, 4096);
  } catch (e) {
    return error(e instanceof BodyError ? e.status : 400, "Invalid request");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return error(400, "Choose a user and enter the passphrase");
  const { user, passphrase } = parsed.data;

  // Count the attempt before checking it, so parallel requests can't all slip under the limit.
  const perIp = await bump(deps.auth, ipKey(ip), deps.now());
  if (perIp.count > MAX_ATTEMPTS_PER_IP) {
    const wait = retryAfterSeconds(perIp.windowStart, deps.now());
    return error(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`, { "Retry-After": String(wait) });
  }
  const perUser = await bump(deps.auth, userKey(user), deps.now());

  const hash = deps.env(user === "damz" ? "DAMZ_PASS_HASH" : "DAS_PASS_HASH");
  const ok = await verifyPassphrase(passphrase, hash).catch(() => false);
  if (!ok) {
    const slow = perUser.count > SLOW_AFTER_PER_USER ? USER_SLOWDOWN_MS : 0;
    await deps.sleep(700 + Math.floor(Math.random() * 500) + slow);
    return error(401, "Wrong user or passphrase");
  }
  await Promise.all([clear(deps.auth, ipKey(ip)), clear(deps.auth, userKey(user))]);
  return json({ user }, 200, { "Set-Cookie": sessionCookie(createToken(user, secret, deps.now())) });
}

export async function handleLogout(req: Request): Promise<Response> {
  if (req.method !== "POST") return error(405, "Method not allowed");
  const bad = requireJson(req) ?? checkOrigin(req);
  if (bad) return bad;
  return json({ ok: true }, 200, { "Set-Cookie": clearedCookie() });
}

export async function handleSession(req: Request, deps: Deps): Promise<Response> {
  const user = authed(req, deps);
  return user ? json({ user }) : error(401, "Not signed in");
}

/** Writes the seed once, the first time the data store is read. */
async function ensureSeeded(kv: KV, nowIso: string): Promise<void> {
  if (await kv.get(SEEDED_KEY)) return;
  const seed = seedCollections(nowIso);
  for (const c of COLLECTIONS) await kv.set(colKey(c), seed[c], { onlyIfNew: true });
  await kv.set(SEEDED_KEY, { at: nowIso }, { onlyIfNew: true });
}

export async function loadCollections(kv: KV): Promise<Collections> {
  const entries = await Promise.all(
    COLLECTIONS.map(async (c) => [c, (await kv.get<CollectionMap<CollectionName>>(colKey(c)))?.data ?? {}] as const),
  );
  return Object.fromEntries(entries) as unknown as Collections;
}

export async function loadSiteChecks(kv: KV): Promise<Record<string, SiteCheckSummary>> {
  const keys = await kv.list("site-");
  const out: Record<string, SiteCheckSummary> = {};
  await Promise.all(
    keys.map(async (k) => {
      const v = await kv.get<SiteCheckSummary>(k);
      if (v) out[k.slice(5)] = v.data;
    }),
  );
  return out;
}

export async function handleData(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "GET") return error(405, "Method not allowed");
  const user = authed(req, deps);
  if (!user) return error(401, "Not signed in");
  await ensureSeeded(deps.data, new Date(deps.now()).toISOString());
  const snapshot: Snapshot = {
    user,
    collections: await loadCollections(deps.data),
    siteChecks: await loadSiteChecks(deps.checks),
    pagespeedEnabled: !!deps.env("PAGESPEED_API_KEY"),
  };
  return json(snapshot);
}

export async function handleRecords(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return error(405, "Method not allowed");
  const user = authed(req, deps);
  if (!user) return error(401, "Not signed in");
  const bad = requireJson(req) ?? checkOrigin(req);
  if (bad) return bad;
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof BodyError ? e.status : 400, e instanceof Error ? e.message : "Invalid request");
  }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, kind: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  const mutation = parsed.data;
  await ensureSeeded(deps.data, new Date(deps.now()).toISOString());
  const key = colKey(mutation.collection);

  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await deps.data.get<CollectionMap<CollectionName>>(key);
    const outcome = applyMutation(cur?.data ?? {}, mutation, user, new Date(deps.now()).toISOString());
    if (!outcome.result.ok) {
      return json(outcome.result, outcome.result.kind === "conflict" ? 409 : 400);
    }
    const written = cur?.etag
      ? await deps.data.set(key, outcome.map, { onlyIfMatch: cur.etag })
      : await deps.data.set(key, outcome.map, { onlyIfNew: true });
    if (written) return json(outcome.result);
    // Another write to this collection landed between our read and write: re-read and re-check versions.
  }
  return error(503, "Busy: please try saving again");
}

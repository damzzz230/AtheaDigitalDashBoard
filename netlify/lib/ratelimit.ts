import { createHash } from "node:crypto";
import type { KV } from "./kv";

export const WINDOW_MS = 15 * 60 * 1000;
/** Hard limit per client IP: attempts beyond this in the window get 429 without checking the passphrase. */
export const MAX_ATTEMPTS_PER_IP = 5;
/** Per-user threshold: beyond this, failures are slowed down rather than blocked, so nobody can lock a founder out. */
export const SLOW_AFTER_PER_USER = 10;
export const USER_SLOWDOWN_MS = 3000;

interface Bucket {
  count: number;
  windowStart: number;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
export const ipKey = (ip: string) => `rl-ip-${hash(ip)}`;
export const userKey = (user: string) => `rl-user-${hash(user)}`;

/**
 * Atomically adds one attempt to a bucket (ETag-conditional write, retried on contention) and
 * returns the new count and window start. Parallel requests each get a distinct count, so a burst
 * cannot all read "under the limit". Fails closed (Infinity) if the write keeps losing races.
 */
export async function bump(kv: KV, key: string, nowMs: number): Promise<{ count: number; windowStart: number }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await kv.get<Bucket>(key);
    const b = cur?.data;
    const next: Bucket = b && nowMs - b.windowStart < WINDOW_MS ? { count: b.count + 1, windowStart: b.windowStart } : { count: 1, windowStart: nowMs };
    const ok = cur?.etag ? await kv.set(key, next, { onlyIfMatch: cur.etag }) : await kv.set(key, next, { onlyIfNew: true });
    if (ok) return next;
  }
  return { count: Number.POSITIVE_INFINITY, windowStart: nowMs };
}

export function retryAfterSeconds(windowStart: number, nowMs: number): number {
  return Math.max(1, Math.ceil((windowStart + WINDOW_MS - nowMs) / 1000));
}

export async function clear(kv: KV, key: string): Promise<void> {
  await kv.delete(key);
}

import { getStore } from "@netlify/blobs";

/** The slice of Netlify Blobs the server uses, so handlers can run against an in-memory store in tests. */
export interface KV {
  get<T>(key: string): Promise<{ data: T; etag: string | null } | null>;
  /** Returns false when the condition failed (someone else wrote first). */
  set(key: string, data: unknown, cond?: { onlyIfMatch?: string; onlyIfNew?: boolean }): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export function blobsKV(name: string): KV {
  const store = getStore({ name, consistency: "strong" });
  return {
    async get<T>(key: string) {
      const r = await store.getWithMetadata(key, { type: "json" });
      return r ? { data: r.data as T, etag: r.etag ?? null } : null;
    },
    async set(key, data, cond) {
      if (cond?.onlyIfMatch) return (await store.setJSON(key, data, { onlyIfMatch: cond.onlyIfMatch })).modified;
      if (cond?.onlyIfNew) return (await store.setJSON(key, data, { onlyIfNew: true })).modified;
      return (await store.setJSON(key, data)).modified;
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(prefix) {
      const r = await store.list({ prefix });
      return r.blobs.map((b) => b.key);
    },
  };
}

export function memoryKV(): KV & { dump(): Map<string, { data: string; etag: string }> } {
  const m = new Map<string, { data: string; etag: string }>();
  let n = 0;
  return {
    dump: () => m,
    async get<T>(key: string) {
      const v = m.get(key);
      return v ? { data: JSON.parse(v.data) as T, etag: v.etag } : null;
    },
    async set(key, data, cond) {
      const cur = m.get(key);
      if (cond?.onlyIfNew && cur) return false;
      if (cond?.onlyIfMatch && cur?.etag !== cond.onlyIfMatch) return false;
      m.set(key, { data: JSON.stringify(data), etag: `e${++n}` });
      return true;
    },
    async delete(key) {
      m.delete(key);
    },
    async list(prefix) {
      return [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

export const DATA_STORE = "athea-data";
export const AUTH_STORE = "athea-auth";
export const CHECKS_STORE = "athea-sitechecks";
export const SNAPSHOT_STORE = "athea-snapshots";

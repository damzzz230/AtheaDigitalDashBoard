import type { Config } from "@netlify/functions";
import { todayJhb } from "../../src/domain/dates";
import { loadCollections } from "../lib/handlers";
import { blobsKV, DATA_STORE, SNAPSHOT_STORE } from "../lib/kv";

const KEEP = 14;

/** Daily at 01:00 UTC (03:00 in Johannesburg): copy every collection and keep the last 14 copies. */
export default async () => {
  const data = blobsKV(DATA_STORE);
  const snaps = blobsKV(SNAPSHOT_STORE);
  const now = new Date();
  const collections = await loadCollections(data);
  await snaps.set(`snap-${todayJhb(now)}`, { takenAt: now.toISOString(), collections });
  const keys = (await snaps.list("snap-")).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) await snaps.delete(k);
};

export const config: Config = { schedule: "0 1 * * *" };

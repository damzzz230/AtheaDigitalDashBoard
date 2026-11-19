import type { Config } from "@netlify/functions";
import type { CollectionMap } from "../../src/shared/schema";
import { blobsKV, CHECKS_STORE, DATA_STORE } from "../lib/kv";
import { checkSite, saveCheck } from "../lib/sitecheck";

/** Every 30 minutes: HTTP status, response time and TLS expiry for each live site. */
export default async () => {
  const data = blobsKV(DATA_STORE);
  const checks = blobsKV(CHECKS_STORE);
  const sites = Object.values((await data.get<CollectionMap<"sites">>("col-sites"))?.data ?? {}).filter((s) => s.live);
  const now = new Date();
  const results = await Promise.all(sites.map((s) => checkSite(s, now)));
  await Promise.all(results.map((r) => saveCheck(checks, r)));
};

export const config: Config = { schedule: "*/30 * * * *" };

import type { Config } from "@netlify/functions";
import type { CollectionMap, SiteCheckSummary } from "../../src/shared/schema";
import { getEnv } from "../lib/http";
import { blobsKV, CHECKS_STORE, DATA_STORE } from "../lib/kv";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Optional. Runs only when PAGESPEED_API_KEY is set. A Lighthouse run takes 10-25 s and scheduled
 * functions stop at 30 s, so each hourly run scores the one live site whose score is oldest (at most daily).
 */
export default async () => {
  const key = getEnv("PAGESPEED_API_KEY");
  if (!key) return;
  const data = blobsKV(DATA_STORE);
  const checks = blobsKV(CHECKS_STORE);
  const sites = Object.values((await data.get<CollectionMap<"sites">>("col-sites"))?.data ?? {}).filter((s) => s.live);
  const now = Date.now();
  const withAge = await Promise.all(
    sites.map(async (s) => {
      const cur = await checks.get<SiteCheckSummary>(`site-${s.id}`);
      const at = cur?.data.lighthouse?.checkedAt ? Date.parse(cur.data.lighthouse.checkedAt) : 0;
      return { site: s, at, cur };
    }),
  );
  const due = withAge.filter((x) => now - x.at > DAY_MS).sort((a, b) => a.at - b.at)[0];
  if (!due) return;

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", due.site.url);
  api.searchParams.set("category", "performance");
  api.searchParams.set("strategy", "mobile");
  api.searchParams.set("key", key);
  const res = await fetch(api, { signal: AbortSignal.timeout(27_000) }).catch(() => null);
  if (!res?.ok) return;
  const body = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
  const score = body.lighthouseResult?.categories?.performance?.score;
  if (typeof score !== "number") return;

  const summary: SiteCheckSummary = due.cur?.data ?? { latest: null, history: [], lighthouse: null };
  const next = { ...summary, lighthouse: { score: Math.round(score * 100), checkedAt: new Date(now).toISOString() } };
  if (due.cur?.etag) await checks.set(`site-${due.site.id}`, next, { onlyIfMatch: due.cur.etag });
  else await checks.set(`site-${due.site.id}`, next, { onlyIfNew: true });
};

export const config: Config = { schedule: "15 * * * *" };

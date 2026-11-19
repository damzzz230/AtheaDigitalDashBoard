import type { ActionItem } from "./actions";
import { committedHours, weeklyCapacity } from "./capacity";
import type { ISODate } from "./dates";
import { buildDeals, OPEN_STATUSES } from "./funnel";
import { formatRand, mrr, totals } from "./money";
import { previewWindow } from "./preview";
import { siteHealth } from "./sites";
import type { Data } from "./types";

export interface Kpis {
  openPipeline: { count: number; value: number; unpriced: number };
  previews: { count: number; oldestDay: number | null; undated: number };
  outstanding: { amount: number; overdue: number };
  mrr: { total: number; target: number | null; active: number; scheduled: number; unpriced: number };
  hours: { committed: number; available: number; stretch: number; missingEstimate: number };
  sites: { unhealthy: number; attention: number; total: number; unchecked: number };
}

export function kpis(data: Data, today: ISODate, now: Date = new Date()): Kpis {
  const deals = buildDeals(data.leads, data.projects);
  const open = deals.filter((d) => OPEN_STATUSES.includes(d.status));
  const priceOf = (id: string) => data.projects.find((p) => p.id === id)?.price ?? null;
  const openPrices = open.map((d) => (d.kind === "project" ? priceOf(d.id) : null));
  const previews = deals.filter((d) => d.status === "Preview Sent");
  const days = previews
    .map((d) => previewWindow(d.previewSentOn, today)?.day)
    .filter((n): n is number => n != null);
  const t = totals(data.invoices, today);
  const m = mrr(data.retainers, today);
  const cap = weeklyCapacity(data.settings);
  const c = committedHours(data.projects);
  const live = data.sites.filter((s) => s.live);
  const health = live.map((s) => siteHealth(data.siteChecks[s.id], today, now));
  return {
    openPipeline: {
      count: open.length,
      value: openPrices.reduce<number>((s, v) => s + (v ?? 0), 0),
      unpriced: openPrices.filter((v) => v == null).length,
    },
    previews: { count: previews.length, oldestDay: days.length ? Math.max(...days) : null, undated: previews.length - days.length },
    outstanding: { amount: t.outstanding, overdue: t.overdue },
    mrr: { total: m.total, target: data.settings.mrrTarget, active: m.activeCount, scheduled: m.scheduled.length, unpriced: m.unpricedCount },
    hours: {
      committed: c.byPerson.damz + c.byPerson.das + c.unassigned,
      available: cap.available * 2,
      stretch: cap.stretch * 2,
      missingEstimate: c.missingEstimate.length,
    },
    sites: {
      unhealthy: health.filter((h) => h.light === "bad").length,
      attention: health.filter((h) => h.light === "warn").length,
      total: live.length,
      unchecked: health.filter((h) => h.light === "unknown").length,
    },
  };
}

function count(n: number, one: string, many: string): string {
  return `${n === 0 ? "no" : n} ${n === 1 ? one : many}`;
}

/** One plain sentence describing where things stand. */
export function summarySentence(actions: ActionItem[], k: Kpis): string {
  const overdue = actions.filter((a) => a.severity === "overdue").length;
  const due = actions.filter((a) => a.severity === "due").length;
  const parts: string[] = [];
  parts.push(overdue === 0 ? "Nothing is overdue" : `${count(overdue, "thing is", "things are")} overdue`);
  parts.push(due === 0 ? "nothing is due this week" : `${count(due, "thing is", "things are")} due this week`);
  parts.push(k.outstanding.amount > 0 ? `${formatRand(k.outstanding.amount)} is outstanding` : "no money is outstanding");
  if (k.sites.total > 0) {
    if (k.sites.unhealthy > 0) parts.push(`${count(k.sites.unhealthy, "site needs", "sites need")} attention`);
    else if (k.sites.unchecked === k.sites.total) parts.push("site checks haven't run yet");
    else parts.push("live sites look healthy");
  }
  const last = parts.pop();
  return `${parts.join(", ")}${parts.length ? " and " : ""}${last}.`;
}

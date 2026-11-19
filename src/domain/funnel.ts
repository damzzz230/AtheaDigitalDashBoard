import type { Lead, Project, Source, Status } from "../shared/schema";
import { MAIN_FLOW } from "../shared/schema";

export const MIN_SAMPLE = 5;

export interface Deal {
  id: string;
  kind: "lead" | "project";
  name: string;
  status: Status;
  niche: string | null;
  source: Source | null;
  previewSentOn: string | null;
  lostFromStatus: Status | null;
}

/**
 * One deal per piece of work. A lead that has become a project is represented by the project,
 * which inherits the lead's niche and source when it has none of its own.
 */
export function buildDeals(leads: Lead[], projects: Project[]): Deal[] {
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const converted = new Set(projects.map((p) => p.leadId).filter(Boolean));
  const fromLeads: Deal[] = leads
    .filter((l) => !converted.has(l.id))
    .map((l) => ({
      id: l.id,
      kind: "lead",
      name: l.business,
      status: l.status,
      niche: l.niche,
      source: l.source,
      previewSentOn: l.previewSentOn,
      lostFromStatus: l.lostFromStatus,
    }));
  const fromProjects: Deal[] = projects.map((p) => {
    const lead = p.leadId ? leadById.get(p.leadId) : undefined;
    return {
      id: p.id,
      kind: "project",
      name: p.client,
      status: p.status,
      niche: p.niche ?? lead?.niche ?? null,
      source: p.source ?? lead?.source ?? null,
      previewSentOn: p.previewSentOn ?? lead?.previewSentOn ?? null,
      lostFromStatus: p.lostFromStatus,
    };
  });
  return [...fromLeads, ...fromProjects];
}

const idx = (s: Status) => MAIN_FLOW.indexOf(s);

/** How far along the main flow a deal got, as an index into MAIN_FLOW. */
export function reachedIndex(d: Pick<Deal, "status" | "lostFromStatus" | "previewSentOn">): number {
  const main = idx(d.status);
  if (main >= 0) return main;
  const from = d.lostFromStatus ? idx(d.lostFromStatus) : -1;
  if (d.status === "Lost After Deposit") return Math.max(idx("Deposit Paid"), from);
  if (from >= 0) return from;
  return d.previewSentOn ? idx("Preview Sent") : 0;
}

export interface FunnelFilter {
  niche?: string | null;
  source?: Source | null;
}

export interface Rate {
  /** Deals that reached the earlier stage: the sample size. */
  n: number;
  converted: number;
  /** Null when n is under MIN_SAMPLE: too few to read. */
  rate: number | null;
}

export interface FunnelResult {
  total: number;
  stages: { status: Status; reached: number; current: number }[];
  steps: ({ from: Status; to: Status } & Rate)[];
  previewToDeposit: Rate;
  lost: number;
}

function rate(n: number, converted: number): Rate {
  return { n, converted, rate: n >= MIN_SAMPLE ? converted / n : null };
}

export function matchesFilter(d: Deal, f: FunnelFilter): boolean {
  if (f.niche && (d.niche ?? "").toLowerCase() !== f.niche.toLowerCase()) return false;
  if (f.source && d.source !== f.source) return false;
  return true;
}

export function funnel(deals: Deal[], filter: FunnelFilter = {}): FunnelResult {
  const ds = deals.filter((d) => matchesFilter(d, filter));
  const reached = ds.map(reachedIndex);
  const stages = MAIN_FLOW.map((status, i) => ({
    status,
    reached: reached.filter((r) => r >= i).length,
    current: ds.filter((d) => d.status === status).length,
  }));
  const steps = MAIN_FLOW.slice(0, -1).map((from, i) => ({
    from,
    to: MAIN_FLOW[i + 1],
    ...rate(stages[i].reached, stages[i + 1].reached),
  }));
  const pi = idx("Preview Sent");
  const di = idx("Deposit Paid");
  return {
    total: ds.length,
    stages,
    steps,
    previewToDeposit: rate(stages[pi].reached, stages[di].reached),
    lost: ds.filter((d) => d.status === "Lost" || d.status === "Lost After Deposit").length,
  };
}

export function formatRate(r: Rate): string {
  if (r.rate == null) return "too few to read";
  return `${Math.round(r.rate * 100)}%`;
}

export const OPEN_STATUSES: Status[] = MAIN_FLOW.filter((s) => s !== "Closed, Paid");

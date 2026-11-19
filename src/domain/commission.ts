import type { Invoice, Project, Settings } from "../shared/schema";

export type Tier = Settings["commissionTiers"][number];

/** The rate of the highest tier the full sale value reaches. Not marginal: the whole value gets that rate. */
export function tierRate(tiers: Tier[], sale: number): number {
  const sorted = [...tiers].sort((a, b) => a.minSale - b.minSale);
  let rate = sorted[0]?.rate ?? 0;
  for (const t of sorted) if (sale >= t.minSale) rate = t.rate;
  return rate;
}

export interface CommissionRow {
  projectId: string;
  client: string;
  sale: number | null;
  rate: number | null;
  saleCommission: number;
  retainerCollected: number;
  retainerCommission: number;
  total: number;
}

export interface CommissionSummary {
  rows: CommissionRow[];
  total: number;
  engagementEndOn: string | null;
}

function inEngagement(d: string, s: Settings): boolean {
  if (s.gabrielEngagementStartOn && d < s.gabrielEngagementStartOn) return false;
  if (s.gabrielEngagementEndOn && d > s.gabrielEngagementEndOn) return false;
  return true;
}

/**
 * Gabriel's commission on projects he closed: the tier rate on the full sale value, plus his
 * retainer rate on retainer money actually collected while his engagement is active.
 */
export function gabrielCommission(projects: Project[], invoices: Invoice[], s: Settings): CommissionSummary {
  const rows = projects
    .filter((p) => p.closedBy === "gabriel" && !p.proBono)
    .map((p): CommissionRow => {
      const sale = p.price;
      const rate = sale != null ? tierRate(s.commissionTiers, sale) : null;
      const saleCommission = sale != null && rate != null ? sale * rate : 0;
      const retainerCollected = invoices
        .filter((i) => i.projectId === p.id && i.type === "retainer" && i.paidOn && inEngagement(i.paidOn, s))
        .reduce((sum, i) => sum + i.amount, 0);
      const retainerCommission = retainerCollected * s.gabrielRetainerRate;
      return {
        projectId: p.id,
        client: p.client,
        sale,
        rate,
        saleCommission,
        retainerCollected,
        retainerCommission,
        total: saleCommission + retainerCommission,
      };
    });
  return { rows, total: rows.reduce((t, r) => t + r.total, 0), engagementEndOn: s.gabrielEngagementEndOn };
}

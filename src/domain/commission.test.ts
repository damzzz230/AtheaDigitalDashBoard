import { describe, expect, it } from "vitest";
import { invoiceSchema, projectSchema } from "../shared/schema";
import { defaultSettings } from "../shared/seed";
import { gabrielCommission, tierRate } from "./commission";

describe("tier rate", () => {
  const tiers = [
    { minSale: 0, rate: 0.1 },
    { minSale: 5000, rate: 0.12 },
    { minSale: 10000, rate: 0.15 },
  ];
  it("defaults to a flat 10%", () => {
    expect(tierRate(defaultSettings().commissionTiers, 4999)).toBe(0.1);
  });
  it("uses the tier the full sale value reaches", () => {
    expect(tierRate(tiers, 4999)).toBe(0.1);
    expect(tierRate(tiers, 5000)).toBe(0.12);
    expect(tierRate(tiers, 12000)).toBe(0.15);
  });
  it("handles unsorted tiers", () => {
    expect(tierRate([...tiers].reverse(), 7000)).toBe(0.12);
  });
});

describe("Gabriel commission", () => {
  const s = { ...defaultSettings(), commissionTiers: [{ minSale: 0, rate: 0.1 }, { minSale: 5000, rate: 0.12 }] };
  const p = projectSchema.parse({ id: "p1", client: "A", closedBy: "gabriel", price: 6000 });
  const retainer = (paidOn: string | null, amount = 999) =>
    invoiceSchema.parse({ id: `r-${paidOn}`, projectId: "p1", type: "retainer", amount, issuedOn: "2026-11-01", dueOn: "2026-11-08", paidOn });

  it("applies the reached tier to the whole sale value, not marginally", () => {
    const c = gabrielCommission([p], [], s);
    expect(c.rows[0].saleCommission).toBeCloseTo(720); // 6000 x 12%, not 5000x10% + 1000x12% = 620
  });
  it("adds 10% of retainer actually collected", () => {
    const c = gabrielCommission([p], [retainer("2026-11-05"), retainer(null)], s);
    expect(c.rows[0].retainerCollected).toBe(999);
    expect(c.rows[0].retainerCommission).toBeCloseTo(99.9);
    expect(c.total).toBeCloseTo(819.9);
  });
  it("stops retainer commission after the engagement end date", () => {
    const ended = { ...s, gabrielEngagementEndOn: "2026-11-30" };
    const c = gabrielCommission([p], [retainer("2026-11-05"), retainer("2026-12-05")], ended);
    expect(c.rows[0].retainerCollected).toBe(999);
  });
  it("ignores retainer collected before the engagement started", () => {
    const later = { ...s, gabrielEngagementStartOn: "2026-11-10" };
    expect(gabrielCommission([p], [retainer("2026-11-05")], later).rows[0].retainerCollected).toBe(0);
  });
  it("only counts projects Gabriel closed, and never invents a price", () => {
    const mine = projectSchema.parse({ id: "p2", client: "B", closedBy: "damz", price: 9000 });
    const unpriced = projectSchema.parse({ id: "p3", client: "C", closedBy: "gabriel" });
    const c = gabrielCommission([p, mine, unpriced], [], s);
    expect(c.rows.map((r) => r.projectId)).toEqual(["p1", "p3"]);
    expect(c.rows[1].saleCommission).toBe(0);
    expect(c.rows[1].rate).toBeNull();
  });
});

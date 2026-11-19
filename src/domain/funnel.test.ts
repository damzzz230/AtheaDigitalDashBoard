import { describe, expect, it } from "vitest";
import { leadSchema, projectSchema, type Status } from "../shared/schema";
import { buildDeals, formatRate, funnel, reachedIndex, type Deal } from "./funnel";

const deal = (status: Status, o: Partial<Deal> = {}): Deal => ({
  id: Math.random().toString(36).slice(2),
  kind: "lead",
  name: "x",
  status,
  niche: null,
  source: null,
  previewSentOn: null,
  lostFromStatus: null,
  ...o,
});

describe("reached stage", () => {
  it("uses the position in the main flow", () => {
    expect(reachedIndex(deal("Preview Sent"))).toBe(3);
  });
  it("uses the status a lost deal was lost from", () => {
    expect(reachedIndex(deal("Lost", { lostFromStatus: "Replied" }))).toBe(2);
  });
  it("falls back to the preview date for a lost deal", () => {
    expect(reachedIndex(deal("Lost", { previewSentOn: "2026-11-01" }))).toBe(3);
    expect(reachedIndex(deal("Lost"))).toBe(0);
  });
  it("counts Lost After Deposit as having reached Deposit Paid", () => {
    expect(reachedIndex(deal("Lost After Deposit"))).toBe(4);
  });
});

describe("funnel", () => {
  const deals = [
    ...Array.from({ length: 6 }, () => deal("Preview Sent", { niche: "Salon", source: "cold-call" })),
    ...Array.from({ length: 3 }, () => deal("Deposit Paid", { niche: "Salon", source: "cold-call" })),
    deal("Lost", { lostFromStatus: "Preview Sent", niche: "Tattoo", source: "instagram-dm" }),
    deal("New", { niche: "Tattoo", source: "instagram-dm" }),
  ];
  it("counts reached and current per stage", () => {
    const f = funnel(deals);
    expect(f.total).toBe(11);
    expect(f.stages[0]).toEqual({ status: "New", reached: 11, current: 1 });
    expect(f.stages[3]).toEqual({ status: "Preview Sent", reached: 10, current: 6 });
    expect(f.lost).toBe(1);
  });
  it("computes preview-to-deposit with n", () => {
    const f = funnel(deals);
    expect(f.previewToDeposit).toEqual({ n: 10, converted: 3, rate: 0.3 });
    expect(formatRate(f.previewToDeposit)).toBe("30%");
  });
  it("says too few to read under 5 samples", () => {
    const f = funnel(deals, { niche: "Tattoo" });
    expect(f.previewToDeposit.n).toBe(1);
    expect(f.previewToDeposit.rate).toBeNull();
    expect(formatRate(f.previewToDeposit)).toBe("too few to read");
  });
  it("filters by source", () => {
    expect(funnel(deals, { source: "cold-call" }).total).toBe(9);
  });
  it("has a stage-to-stage step for each pair", () => {
    const f = funnel(deals);
    expect(f.steps).toHaveLength(7);
    expect(f.steps[3]).toMatchObject({ from: "Preview Sent", to: "Deposit Paid", n: 10, converted: 3 });
    expect(f.steps[5].rate).toBeNull();
  });
});

describe("deals", () => {
  it("represents a converted lead by its project, inheriting niche and source", () => {
    const l = leadSchema.parse({ id: "l1", business: "A", niche: "Salon", source: "referral", status: "Deposit Paid" });
    const l2 = leadSchema.parse({ id: "l2", business: "B" });
    const p = projectSchema.parse({ id: "p1", client: "A", leadId: "l1", status: "In Build" });
    const d = buildDeals([l, l2], [p]);
    expect(d.map((x) => x.id).sort()).toEqual(["l2", "p1"]);
    expect(d.find((x) => x.id === "p1")).toMatchObject({ niche: "Salon", source: "referral", status: "In Build" });
  });
});

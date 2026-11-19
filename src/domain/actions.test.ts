import { describe, expect, it } from "vitest";
import { invoiceSchema, leadSchema, projectSchema, siteSchema } from "../shared/schema";
import { seedCollections } from "../shared/seed";
import { needsAction, sortActions, type ActionItem } from "./actions";
import { kpis, summarySentence } from "./summary";
import { emptyData, toData } from "./types";

const today = "2026-11-19";
const now = new Date("2026-11-19T08:00:00Z");

describe("needs action", () => {
  it("sorts overdue first, then due this week, then undated, then later", () => {
    const mk = (id: string, severity: ActionItem["severity"], dueOn: string | null): ActionItem => ({ id, severity, dueOn, title: id, detail: "", screen: "today" });
    const sorted = sortActions([
      mk("later", "later", "2026-12-30"),
      mk("undated", "undated", null),
      mk("due-b", "due", "2026-11-22"),
      mk("over-b", "overdue", "2026-11-10"),
      mk("due-a", "due", "2026-11-20"),
      mk("over-a", "overdue", "2026-11-01"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["over-a", "over-b", "due-a", "due-b", "undated", "later"]);
  });

  it("raises the preview, clock, balance and retainer items", () => {
    const data = {
      ...emptyData(),
      leads: [leadSchema.parse({ id: "l1", business: "Late Lead", status: "Preview Sent", previewSentOn: "2026-11-01" })],
      projects: [
        projectSchema.parse({ id: "p1", client: "Waiting Co", status: "In Build", depositClearedOn: "2026-11-10" }),
        projectSchema.parse({ id: "p2", client: "Approved Co", status: "Delivered, Awaiting Balance", approvedOn: "2026-11-05", goLiveOn: "2026-11-06" }),
      ],
    };
    const items = needsAction(data, today, now);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId["preview-l1"].severity).toBe("overdue");
    expect(byId["preview-l1"].title).toMatch(/mark Lost/);
    expect(byId["clock-p1"].title).toMatch(/waiting on assets/);
    expect(byId["balance-p2"]).toMatchObject({ severity: "overdue", dueOn: "2026-11-12" });
    expect(byId["retainer-offer-p2"]).toBeTruthy();
    expect(byId["followup-p2-d7"]).toMatchObject({ dueOn: "2026-11-13", severity: "overdue" });
    expect(items[0].severity).toBe("overdue");
  });

  it("flags an overdue deposit invoice and a site on a personal Netlify account", () => {
    const data = {
      ...emptyData(),
      projects: [projectSchema.parse({ id: "p1", client: "A" })],
      invoices: [invoiceSchema.parse({ id: "i1", projectId: "p1", type: "deposit", amount: 1750, issuedOn: "2026-11-01", dueOn: "2026-11-10" })],
      sites: [siteSchema.parse({ id: "s1", name: "Athea", url: "atheadigital.co.za", netlifyAccount: "personal" })],
    };
    const ids = needsAction(data, today, now).map((i) => i.id);
    expect(ids).toContain("invoice-i1");
    expect(ids).toContain("migrate-s1");
    expect(ids).toContain("form-s1");
  });
});

describe("seeded dashboard", () => {
  const data = toData(seedCollections("2026-11-19T06:00:00.000Z"));
  it("seeds only the confirmed facts with blank money", () => {
    expect(data.projects.map((p) => p.client).sort()).toEqual(["BUGZ", "TopDraw Projects"]);
    expect(data.leads.map((l) => l.business).sort()).toEqual(["Hair@77", "The Southern Rebellion"]);
    expect(data.projects.every((p) => p.price === null)).toBe(true);
    expect(data.retainers.every((r) => r.monthlyPrice === null)).toBe(true);
    expect(data.invoices).toEqual([]);
    expect(data.hours).toEqual([]);
    expect(data.costs.every((c) => c.monthlyAmount === null)).toBe(true);
  });
  it("asks for the Southern Rebellion preview date, the Athea migration and the TopDraw 7-day check", () => {
    const ids = needsAction(data, today, now).map((i) => i.id);
    expect(ids).toContain("preview-date-l-southern-rebellion");
    expect(ids).toContain("migrate-s-athea");
    expect(ids).toContain("followup-p-topdraw-d7");
    expect(ids).toContain("retainer-chase-p-bugz");
    expect(ids).toContain("settings-unconfirmed");
  });
  it("summarises in one sentence", () => {
    const items = needsAction(data, today, now);
    const k = kpis(data, today, now);
    expect(k.mrr).toMatchObject({ total: 0, target: null, scheduled: 1 });
    expect(k.hours).toMatchObject({ available: 44, stretch: 52, committed: 0 });
    expect(k.previews).toMatchObject({ count: 1, oldestDay: null, undated: 1 });
    const s = summarySentence(items, k);
    expect(s).toMatch(/^Nothing is overdue, \d+ things are due this week, no money is outstanding and site checks haven't run yet\.$/);
  });
});

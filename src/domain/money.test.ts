import { describe, expect, it } from "vitest";
import { invoiceSchema, projectSchema, retainerSchema } from "../shared/schema";
import { balanceStatus, formatRand, invoiceState, moneyByProject, mrr, totals } from "./money";

const inv = (o: Partial<Parameters<typeof invoiceSchema.parse>[0]>) =>
  invoiceSchema.parse({ id: "i", projectId: "p1", type: "deposit", amount: 1000, issuedOn: "2026-11-01", dueOn: "2026-11-08", ...o });

describe("invoices", () => {
  it("is overdue only after the due date", () => {
    expect(invoiceState(inv({}), "2026-11-08")).toBe("outstanding");
    expect(invoiceState(inv({}), "2026-11-09")).toBe("overdue");
    expect(invoiceState(inv({ paidOn: "2026-11-20" }), "2026-11-30")).toBe("paid");
  });
  it("totals invoiced, received, outstanding and overdue", () => {
    const list = [
      inv({ id: "a", amount: 1750, paidOn: "2026-11-02" }),
      inv({ id: "b", amount: 1749, type: "balance", dueOn: "2026-11-10" }),
      inv({ id: "c", amount: 999, type: "retainer", dueOn: "2026-11-25" }),
    ];
    expect(totals(list, "2026-11-19")).toEqual({ invoiced: 4498, received: 1750, outstanding: 2748, overdue: 1749 });
  });
  it("splits per project", () => {
    const p1 = projectSchema.parse({ id: "p1", client: "A" });
    const p2 = projectSchema.parse({ id: "p2", client: "B" });
    const rows = moneyByProject([p1, p2], [inv({ amount: 500 }), inv({ projectId: "p2", amount: 200 })], "2026-11-19");
    expect(rows.map((r) => r.outstanding)).toEqual([500, 200]);
  });
});

describe("balance due", () => {
  const p = projectSchema.parse({ id: "p1", client: "A", approvedOn: "2026-11-10" });
  it("is due 7 days after approval", () => {
    const b = balanceStatus(p, [], "2026-11-17");
    expect(b?.dueOn).toBe("2026-11-17");
    expect(b?.overdue).toBe(false);
    expect(balanceStatus(p, [], "2026-11-18")?.overdue).toBe(true);
  });
  it("is clear once the balance invoice is paid", () => {
    const b = balanceStatus(p, [inv({ type: "balance", paidOn: "2026-11-15" })], "2026-11-30");
    expect(b?.paid).toBe(true);
    expect(b?.overdue).toBe(false);
  });
  it("does not apply to pro bono or unapproved projects", () => {
    expect(balanceStatus({ ...p, proBono: true }, [], "2026-12-01")).toBeNull();
    expect(balanceStatus({ ...p, approvedOn: null }, [], "2026-12-01")).toBeNull();
  });
});

describe("MRR", () => {
  const r = (o: object) => retainerSchema.parse({ id: "r", projectId: "p", startOn: "2026-11-01", monthlyPrice: 999, ...o });
  it("sums active retainers only", () => {
    const m = mrr([r({}), r({ id: "b", startOn: "2026-12-01" }), r({ id: "c", endedOn: "2026-11-10" })], "2026-11-19");
    expect(m.total).toBe(999);
    expect(m.activeCount).toBe(1);
    expect(m.scheduled).toHaveLength(1);
  });
  it("counts unpriced active retainers without inventing a price", () => {
    const m = mrr([r({ monthlyPrice: null })], "2026-11-19");
    expect(m.total).toBe(0);
    expect(m.unpricedCount).toBe(1);
  });
  it("starts on the start date", () => {
    expect(mrr([r({ startOn: "2026-12-01" })], "2026-12-01").activeCount).toBe(1);
    expect(mrr([r({ startOn: "2026-12-01" })], "2026-11-30").activeCount).toBe(0);
  });
});

describe("formatRand", () => {
  it("formats rand without VAT", () => {
    expect(formatRand(3499)).toBe("R3,499");
    expect(formatRand(1234567.5)).toBe("R1,234,567.50");
    expect(formatRand(null)).toBe("Not set");
  });
});

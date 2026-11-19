import { describe, expect, it } from "vitest";
import { hoursSchema, projectSchema, retainerSchema } from "../shared/schema";
import { defaultSettings } from "../shared/seed";
import { committedHours, loggedThisWeek, proBonoSunk, retainerUsage, weeklyCapacity } from "./capacity";

const h = (o: object) => hoursSchema.parse({ id: Math.random().toString(36).slice(2), person: "damz", date: "2026-11-19", hours: 1, kind: "build", ...o });

describe("weekly capacity", () => {
  it("is 5 x weekday + 2 x weekend minimum, with the maximum as stretch", () => {
    expect(weeklyCapacity(defaultSettings())).toEqual({ available: 22, stretch: 26 });
  });
});

describe("committed hours", () => {
  it("sums open builds per owner and lists builds without an estimate", () => {
    const ps = [
      projectSchema.parse({ id: "a", client: "A", status: "In Build", owner: "damz", weeklyHoursCommitted: 8 }),
      projectSchema.parse({ id: "b", client: "B", status: "Deposit Paid", owner: "das", weeklyHoursCommitted: 5 }),
      projectSchema.parse({ id: "c", client: "C", status: "In Build", owner: "das" }),
      projectSchema.parse({ id: "d", client: "D", status: "Closed, Paid", owner: "das", weeklyHoursCommitted: 9 }),
    ];
    const c = committedHours(ps);
    expect(c.byPerson).toEqual({ damz: 8, das: 5 });
    expect(c.missingEstimate.map((p) => p.id)).toEqual(["c"]);
  });
});

describe("hours logged this week", () => {
  it("uses the Monday-to-Sunday week", () => {
    const list = [h({ date: "2026-11-16", hours: 2 }), h({ date: "2026-11-22", hours: 3 }), h({ date: "2026-11-15", hours: 9 }), h({ person: "das", hours: 1.5 })];
    expect(loggedThisWeek(list, "2026-11-19")).toEqual({ damz: 5, das: 1.5 });
  });
});

describe("retainer usage", () => {
  const r = retainerSchema.parse({ id: "r", projectId: "p", startOn: "2026-10-01", hoursCap: 6 });
  it("counts only this month's retainer hours; unused hours do not carry over", () => {
    const list = [
      h({ projectId: "p", kind: "retainer", date: "2026-10-30", hours: 1 }),
      h({ projectId: "p", kind: "retainer", date: "2026-11-02", hours: 4 }),
      h({ projectId: "p", kind: "build", date: "2026-11-03", hours: 4 }),
    ];
    const u = retainerUsage(r, list, "2026-11-19");
    expect(u.used).toBe(4);
    expect(u.remaining).toBe(2);
    expect(u.over).toBe(0);
    expect(retainerUsage(r, list, "2026-12-01").used).toBe(0);
  });
  it("flags hours over the cap", () => {
    const u = retainerUsage(r, [h({ projectId: "p", kind: "retainer", hours: 7.5 })], "2026-11-19");
    expect(u.over).toBe(1.5);
  });
});

describe("pro bono", () => {
  it("values logged hours at the hourly rate, separately from revenue", () => {
    const pb = projectSchema.parse({ id: "pb", client: "BUGZ", proBono: true });
    const paid = projectSchema.parse({ id: "x", client: "X" });
    const r = proBonoSunk([pb, paid], [h({ projectId: "pb", hours: 10 }), h({ projectId: "x", hours: 4 })], 250);
    expect(r.total).toBe(2500);
    expect(r.rows).toHaveLength(1);
  });
});

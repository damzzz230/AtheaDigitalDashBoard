import { describe, expect, it } from "vitest";
import { projectSchema } from "../shared/schema";
import { defaultSettings } from "../shared/seed";
import { followUpSchedule, nextFollowUp, openFollowUps } from "./followups";
import { avgDmResponseHours, marketingRows } from "./marketing";
import { revisionState } from "./revisions";
import { formTestState, siteHealth } from "./sites";

describe("follow-ups after go-live", () => {
  it("schedules +7, +30, then monthly", () => {
    const s = followUpSchedule("2026-11-18", "2027-02-01");
    expect(s.map((f) => [f.key, f.dueOn])).toEqual([
      ["d7", "2026-11-25"],
      ["d30", "2026-12-18"],
      ["m2", "2027-01-18"],
      ["m3", "2027-02-18"],
    ]);
    expect(s[0].detail).toMatch(/only if every enquiry reached the client/);
  });
  it("lists open follow-ups that are due", () => {
    expect(openFollowUps("2026-11-18", {}, "2026-11-25").map((f) => f.key)).toEqual(["d7"]);
    expect(openFollowUps("2026-11-18", { d7: "2026-11-25" }, "2026-11-25")).toEqual([]);
    expect(openFollowUps(null, {}, "2026-11-25")).toEqual([]);
  });
  it("finds the next one", () => {
    expect(nextFollowUp("2026-11-18", { d7: "2026-11-25" }, "2026-11-26")?.key).toBe("d30");
  });
});

describe("revision rounds", () => {
  const s = defaultSettings();
  const p = (pkg: "starter" | "standard" | "custom" | null, used: number) =>
    projectSchema.parse({ id: "p", client: "A", package: pkg, revisionRoundsUsed: used });
  it("Starter includes 1 round", () => {
    expect(revisionState(p("starter", 1), s).over).toBe(false);
    const over = revisionState(p("starter", 2), s);
    expect(over.over).toBe(true);
    expect(over.extra).toBe(1);
    expect(over.label).toMatch(/Quote at R250\/h before work starts/);
  });
  it("Standard includes 2 consolidated rounds", () => {
    expect(revisionState(p("standard", 2), s).over).toBe(false);
    expect(revisionState(p("standard", 3), s).over).toBe(true);
  });
  it("follows the settings", () => {
    const edited = { ...s, packages: { ...s.packages, starter: { ...s.packages.starter, revisionRounds: 2 } } };
    expect(revisionState(p("starter", 2), edited).over).toBe(false);
  });
  it("never flags custom or unset packages", () => {
    expect(revisionState(p("custom", 5), s).over).toBe(false);
    expect(revisionState(p(null, 5), s).over).toBe(false);
  });
});

describe("site health", () => {
  const now = new Date("2026-11-19T08:00:00Z");
  const check = (o: object) => ({
    latest: { siteId: "s", siteUrl: "https://a.co.za", checkedAt: "2026-11-19T07:45:00Z", httpStatus: 200, responseMs: 400, sslExpiresOn: "2027-01-30", error: null, ...o },
    history: [],
    lighthouse: null,
  });
  it("is unknown before the first check", () => {
    expect(siteHealth(undefined, "2026-11-19", now).light).toBe("unknown");
  });
  it("is ok when fast, 2xx and SSL far off", () => {
    expect(siteHealth(check({}), "2026-11-19", now).light).toBe("ok");
  });
  it("is bad on errors, 5xx and near SSL expiry", () => {
    expect(siteHealth(check({ httpStatus: 503 }), "2026-11-19", now).light).toBe("bad");
    expect(siteHealth(check({ httpStatus: null, error: "timeout" }), "2026-11-19", now).light).toBe("bad");
    expect(siteHealth(check({ sslExpiresOn: "2026-11-25" }), "2026-11-19", now).light).toBe("bad");
  });
  it("warns when slow, SSL under 30 days or the check is stale", () => {
    expect(siteHealth(check({ responseMs: 4200 }), "2026-11-19", now).light).toBe("warn");
    expect(siteHealth(check({ sslExpiresOn: "2026-12-10" }), "2026-11-19", now).sslDays).toBe(21);
    expect(siteHealth(check({ sslExpiresOn: "2026-12-10" }), "2026-11-19", now).light).toBe("warn");
    expect(siteHealth(check({ checkedAt: "2026-11-19T04:00:00Z" }), "2026-11-19", now).light).toBe("warn");
  });
  it("turns the form test amber after 30 days or when never tested", () => {
    expect(formTestState(null, "2026-11-19").level).toBe("amber");
    expect(formTestState("2026-10-20", "2026-11-19").level).toBe("ok");
    expect(formTestState("2026-10-19", "2026-11-19").level).toBe("amber");
  });
});

describe("marketing", () => {
  const s = defaultSettings();
  const e = (o: object) => ({ id: "w", weekStart: "2026-11-16", posts: 0, dmsReceived: 0, dmReplies: 0, dmAvgResponseHours: null, outreachSent: 0, outreachReplies: 0, previewsSent: 0, notes: "", ...o });
  it("compares posts with the weekly target", () => {
    const [row] = marketingRows([e({ posts: 2, dmsReceived: 4, dmReplies: 3 })], s);
    expect(row.metTarget).toBe(false);
    expect(row.postsVsTarget).toBe(-1);
    expect(row.dmReplyRate).toBe(0.75);
  });
  it("averages DM response time weighted by DMs", () => {
    const r = avgDmResponseHours([e({ dmAvgResponseHours: 2, dmsReceived: 3 }), e({ weekStart: "2026-11-09", dmAvgResponseHours: 6, dmsReceived: 1 })]);
    expect(r.hours).toBe(3);
    expect(avgDmResponseHours([]).hours).toBeNull();
  });
});

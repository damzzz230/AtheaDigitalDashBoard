import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, formatDate, mondayOf, relativeDays, todayJhb, weekday } from "./dates";

describe("todayJhb across the Johannesburg midnight boundary", () => {
  it("is still the 18th at 23:59:59 SAST (21:59:59 UTC)", () => {
    expect(todayJhb(new Date("2026-11-18T21:59:59Z"))).toBe("2026-11-18");
  });
  it("flips to the 19th at 00:00 SAST (22:00 UTC the day before)", () => {
    expect(todayJhb(new Date("2026-11-18T22:00:00Z"))).toBe("2026-11-19");
  });
  it("is the 19th at 01:30 SAST even though UTC still says the 18th", () => {
    expect(todayJhb(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
  });
  it("crosses a year boundary in SAST before UTC does", () => {
    expect(todayJhb(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
  });
});

describe("date arithmetic is date-only", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-25", 14)).toBe("2026-12-09");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("diffs days", () => {
    expect(diffDays("2026-11-05", "2026-11-19")).toBe(14);
    expect(diffDays("2026-11-19", "2026-11-05")).toBe(-14);
  });
  it("adds months with clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-18", 2)).toBe("2027-01-18");
  });
  it("finds weekdays and Mondays", () => {
    expect(weekday("2026-11-19")).toBe(4); // Thursday
    expect(mondayOf("2026-11-19")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the week before
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(weekday("1969-12-31")).toBe(3);
  });
  it("formats", () => {
    expect(formatDate("2026-11-19")).toBe("19 Nov 2026");
    expect(formatDate(null)).toBe("Not set");
    expect(relativeDays("2026-11-19", "2026-11-22")).toBe("in 3 days");
    expect(relativeDays("2026-11-19", "2026-11-18")).toBe("yesterday");
  });
});

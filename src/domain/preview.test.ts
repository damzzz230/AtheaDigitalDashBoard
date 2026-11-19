import { describe, expect, it } from "vitest";
import { addDays, todayJhb } from "./dates";
import { previewWindow } from "./preview";

const sent = "2026-11-01";
const on = (day: number) => previewWindow(sent, addDays(sent, day));

describe("preview window", () => {
  it("returns null without a sent date", () => {
    expect(previewWindow(null, "2026-11-19")).toBeNull();
  });
  it("is ok through day 9", () => {
    expect(on(0)?.level).toBe("ok");
    expect(on(9)?.level).toBe("ok");
    expect(on(9)?.daysLeft).toBe(5);
  });
  it("turns amber from day 10", () => {
    expect(on(10)?.level).toBe("amber");
    expect(on(12)?.level).toBe("amber");
  });
  it("turns red on day 13", () => {
    expect(on(13)?.level).toBe("red");
  });
  it("asks to take it down on day 14", () => {
    const w = on(14);
    expect(w?.level).toBe("take-down");
    expect(w?.expiresOn).toBe("2026-11-15");
    expect(w?.action).toMatch(/take the preview down/i);
  });
  it("is Lost after 14 days and the client owes nothing", () => {
    const w = on(15);
    expect(w?.level).toBe("lost");
    expect(w?.action).toMatch(/owes nothing/);
  });
  it("counts days by Johannesburg date, not UTC, at midnight", () => {
    // Sent 5 Nov; at 00:30 SAST on 15 Nov it is day 10 (amber) although UTC is still 14 Nov.
    const today = todayJhb(new Date("2026-11-14T22:30:00Z"));
    expect(today).toBe("2026-11-15");
    expect(previewWindow("2026-11-05", today)?.level).toBe("amber");
    const before = todayJhb(new Date("2026-11-14T21:30:00Z"));
    expect(previewWindow("2026-11-05", before)?.level).toBe("ok");
  });
});

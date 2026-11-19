import { describe, expect, it } from "vitest";
import { deliveryClock } from "./clock";

const base = {
  depositClearedOn: null as string | null,
  assetsReceivedOn: null as string | null,
  clientDelayDays: 0,
  status: "In Build" as const,
  goLiveOn: null as string | null,
};

describe("delivery clock", () => {
  it("waits on both", () => {
    const c = deliveryClock(base, "2026-11-19");
    expect(c.started).toBe(false);
    if (!c.started) expect(c.label).toBe("Clock not started: waiting on deposit and assets");
  });
  it("waits on assets when only the deposit cleared", () => {
    const c = deliveryClock({ ...base, depositClearedOn: "2026-11-10" }, "2026-11-19");
    expect(c.started).toBe(false);
    if (!c.started) expect(c.label).toBe("Clock not started: waiting on assets");
  });
  it("waits on deposit when only the assets arrived", () => {
    const c = deliveryClock({ ...base, assetsReceivedOn: "2026-11-10" }, "2026-11-19");
    if (!c.started) expect(c.waitingOn).toEqual(["deposit"]);
    else throw new Error("should not start");
  });
  it("starts on the later of the two dates", () => {
    const c = deliveryClock({ ...base, depositClearedOn: "2026-11-10", assetsReceivedOn: "2026-11-12" }, "2026-11-19");
    if (!c.started) throw new Error("should start");
    expect(c.dayZero).toBe("2026-11-12");
    expect(c.target).toBe("2026-11-26");
    expect(c.latest).toBe("2026-12-03");
    expect(c.day).toBe(7);
    expect(c.level).toBe("ok");
  });
  it("moves both dates by client-side delay", () => {
    const c = deliveryClock({ ...base, depositClearedOn: "2026-11-12", assetsReceivedOn: "2026-11-12", clientDelayDays: 3 }, "2026-11-19");
    if (!c.started) throw new Error("should start");
    expect(c.target).toBe("2026-11-29");
    expect(c.latest).toBe("2026-12-06");
  });
  it("goes amber past target and red past latest", () => {
    const p = { ...base, depositClearedOn: "2026-11-01", assetsReceivedOn: "2026-11-01" };
    const at = (d: string) => {
      const c = deliveryClock(p, d);
      return c.started ? c.level : "not started";
    };
    expect(at("2026-11-15")).toBe("ok");
    expect(at("2026-11-16")).toBe("amber");
    expect(at("2026-11-22")).toBe("amber");
    expect(at("2026-11-23")).toBe("red");
  });
  it("is done once delivered", () => {
    const c = deliveryClock({ ...base, depositClearedOn: "2026-10-01", assetsReceivedOn: "2026-10-01", status: "Delivered, Awaiting Balance" as never }, "2026-11-19");
    if (!c.started) throw new Error("should start");
    expect(c.level).toBe("done");
  });
});

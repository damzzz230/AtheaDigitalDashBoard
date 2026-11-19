import type { Project } from "../shared/schema";
import { addDays, diffDays, type ISODate } from "./dates";

export const TARGET_DAYS = 14;
export const LATEST_DAYS = 21;

export type Waiting = "deposit" | "assets";

export type DeliveryClock =
  | { started: false; waitingOn: Waiting[]; label: string }
  | {
      started: true;
      dayZero: ISODate;
      target: ISODate;
      latest: ISODate;
      delayDays: number;
      /** Days since day zero. */
      day: number;
      delivered: boolean;
      level: "ok" | "amber" | "red" | "done";
      label: string;
    };

const DELIVERED: Project["status"][] = ["Delivered, Awaiting Balance", "Closed, Paid"];

/**
 * Day zero is the later of deposit cleared and assets received; both are required.
 * Target delivery is day zero + 14, latest is + 21, and client-side delay days push both out.
 */
export function deliveryClock(
  p: Pick<Project, "depositClearedOn" | "assetsReceivedOn" | "clientDelayDays" | "status" | "goLiveOn">,
  today: ISODate,
): DeliveryClock {
  const waitingOn: Waiting[] = [];
  if (!p.depositClearedOn) waitingOn.push("deposit");
  if (!p.assetsReceivedOn) waitingOn.push("assets");
  if (waitingOn.length) {
    return { started: false, waitingOn, label: `Clock not started: waiting on ${waitingOn.join(" and ")}` };
  }
  const dep = p.depositClearedOn as ISODate;
  const assets = p.assetsReceivedOn as ISODate;
  const dayZero = dep > assets ? dep : assets;
  const delayDays = p.clientDelayDays ?? 0;
  const target = addDays(dayZero, TARGET_DAYS + delayDays);
  const latest = addDays(dayZero, LATEST_DAYS + delayDays);
  const day = diffDays(dayZero, today);
  const delivered = DELIVERED.includes(p.status) || !!p.goLiveOn;
  let level: "ok" | "amber" | "red" | "done" = "ok";
  let label: string;
  if (delivered) {
    level = "done";
    label = "Delivered";
  } else if (today > latest) {
    level = "red";
    label = `Past the latest delivery date by ${diffDays(latest, today)} days`;
  } else if (today > target) {
    level = "amber";
    label = `Past target; latest delivery in ${diffDays(today, latest)} days`;
  } else {
    label = `Day ${day} of ${TARGET_DAYS + delayDays}`;
  }
  return { started: true, dayZero, target, latest, delayDays, day, delivered, level, label };
}

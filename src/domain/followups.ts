import { addDays, addMonths, type ISODate } from "./dates";

export interface FollowUp {
  key: string;
  dueOn: ISODate;
  title: string;
  detail: string;
}

/**
 * After go-live: +7 days (indexing check; remove the Athea-inbox form notification only if every
 * enquiry reached the client), +30 days (recheck), then monthly from month 2.
 * Returns every step due up to `until`, plus the first one after it.
 */
export function followUpSchedule(goLiveOn: ISODate, until: ISODate): FollowUp[] {
  const out: FollowUp[] = [
    {
      key: "d7",
      dueOn: addDays(goLiveOn, 7),
      title: "7-day check",
      detail:
        "Check Google indexing. Remove the Athea-inbox form notification only if every enquiry reached the client.",
    },
    {
      key: "d30",
      dueOn: addDays(goLiveOn, 30),
      title: "30-day recheck",
      detail: "Recheck indexing, forms and speed.",
    },
  ];
  for (let m = 2; m < 240; m++) {
    const last = out[out.length - 1];
    if (last.dueOn > until) break;
    out.push({ key: `m${m}`, dueOn: addMonths(goLiveOn, m), title: "Monthly check", detail: "Monthly site check." });
  }
  const firstAfter = out.findIndex((f) => f.dueOn > until);
  return firstAfter === -1 ? out : out.slice(0, firstAfter + 1);
}

/** Follow-ups not yet marked done that are due on or before `until`. */
export function openFollowUps(
  goLiveOn: ISODate | null,
  done: Record<string, string>,
  until: ISODate,
): FollowUp[] {
  if (!goLiveOn) return [];
  return followUpSchedule(goLiveOn, until).filter((f) => f.dueOn <= until && !done[f.key]);
}

export function nextFollowUp(goLiveOn: ISODate | null, done: Record<string, string>, today: ISODate) {
  if (!goLiveOn) return null;
  return followUpSchedule(goLiveOn, today).find((f) => !done[f.key]) ?? null;
}

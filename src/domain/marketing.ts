import type { Settings, WeeklyMarketing } from "../shared/schema";
import { mondayOf, type ISODate } from "./dates";

export interface MarketingRow extends WeeklyMarketing {
  postsVsTarget: number;
  metTarget: boolean;
  dmReplyRate: number | null;
  outreachReplyRate: number | null;
}

export function marketingRows(entries: WeeklyMarketing[], s: Settings): MarketingRow[] {
  return [...entries]
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
    .map((e) => ({
      ...e,
      postsVsTarget: e.posts - s.weeklyPostTarget,
      metTarget: e.posts >= s.weeklyPostTarget,
      dmReplyRate: e.dmsReceived > 0 ? e.dmReplies / e.dmsReceived : null,
      outreachReplyRate: e.outreachSent > 0 ? e.outreachReplies / e.outreachSent : null,
    }));
}

/** Mean DM response time across the most recent `weeks` logged weeks that recorded one, weighted by DMs received. */
export function avgDmResponseHours(entries: WeeklyMarketing[], weeks = 8): { hours: number | null; weeks: number } {
  const recent = [...entries]
    .filter((e) => e.dmAvgResponseHours != null)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
    .slice(0, weeks);
  if (!recent.length) return { hours: null, weeks: 0 };
  const weight = recent.reduce((s, e) => s + Math.max(1, e.dmsReceived), 0);
  const total = recent.reduce((s, e) => s + (e.dmAvgResponseHours as number) * Math.max(1, e.dmsReceived), 0);
  return { hours: total / weight, weeks: recent.length };
}

export function thisWeekEntry(entries: WeeklyMarketing[], today: ISODate): WeeklyMarketing | null {
  const wk = mondayOf(today);
  return entries.find((e) => e.weekStart === wk) ?? null;
}

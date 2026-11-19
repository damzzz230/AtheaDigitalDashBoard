import { addDays, diffDays, type ISODate } from "./dates";

export const PREVIEW_WINDOW_DAYS = 14;
export const PREVIEW_AMBER_DAY = 10;
export const PREVIEW_RED_DAY = 13;

export type PreviewLevel = "ok" | "amber" | "red" | "take-down" | "lost";

export interface PreviewWindow {
  sentOn: ISODate;
  /** Day 0 is the day the preview was sent. */
  day: number;
  expiresOn: ISODate;
  daysLeft: number;
  level: PreviewLevel;
  action: string | null;
}

/**
 * The 14-day preview window. Amber from day 10, red from day 13, take it down on day 14.
 * After day 14 with no answer the lead is Lost and the client owes nothing.
 */
export function previewWindow(sentOn: ISODate | null, today: ISODate): PreviewWindow | null {
  if (!sentOn) return null;
  const day = diffDays(sentOn, today);
  const expiresOn = addDays(sentOn, PREVIEW_WINDOW_DAYS);
  let level: PreviewLevel = "ok";
  let action: string | null = null;
  if (day > PREVIEW_WINDOW_DAYS) {
    level = "lost";
    action = "Silent past 14 days: take the preview down and mark Lost. The client owes nothing.";
  } else if (day === PREVIEW_WINDOW_DAYS) {
    level = "take-down";
    action = "Day 14: take the preview down today.";
  } else if (day >= PREVIEW_RED_DAY) {
    level = "red";
    action = "Last day before take-down: chase for a decision.";
  } else if (day >= PREVIEW_AMBER_DAY) {
    level = "amber";
    action = "Preview window closing: follow up.";
  }
  return { sentOn, day, expiresOn, daysLeft: PREVIEW_WINDOW_DAYS - day, level, action };
}

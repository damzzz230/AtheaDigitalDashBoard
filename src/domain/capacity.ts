import type { HoursEntry, Person, Project, Retainer, Settings } from "../shared/schema";
import { PEOPLE } from "../shared/schema";
import { mondayOf, monthKey, type ISODate } from "./dates";

export const OPEN_BUILD_STATUSES: Project["status"][] = ["Deposit Paid", "In Build"];

export interface WeeklyCapacity {
  /** Planning figure: 5 weekdays plus 2 weekend days at the minimum weekend figure. */
  available: number;
  /** Stretch figure: weekend days at the maximum. */
  stretch: number;
}

export function weeklyCapacity(s: Settings): WeeklyCapacity {
  return {
    available: 5 * s.weekdayHoursPerPerson + 2 * s.weekendHoursMin,
    stretch: 5 * s.weekdayHoursPerPerson + 2 * Math.max(s.weekendHoursMax, s.weekendHoursMin),
  };
}

export interface Committed {
  byPerson: Record<Person, number>;
  unassigned: number;
  /** Open builds with no weekly hours estimate. */
  missingEstimate: Project[];
}

export function committedHours(projects: Project[]): Committed {
  const byPerson = { damz: 0, das: 0 } as Record<Person, number>;
  let unassigned = 0;
  const missingEstimate: Project[] = [];
  for (const p of projects) {
    if (!OPEN_BUILD_STATUSES.includes(p.status)) continue;
    if (p.weeklyHoursCommitted == null) {
      missingEstimate.push(p);
      continue;
    }
    if (p.owner) byPerson[p.owner] += p.weeklyHoursCommitted;
    else unassigned += p.weeklyHoursCommitted;
  }
  return { byPerson, unassigned, missingEstimate };
}

export function loggedThisWeek(hours: HoursEntry[], today: ISODate): Record<Person, number> {
  const week = mondayOf(today);
  const out = Object.fromEntries(PEOPLE.map((p) => [p, 0])) as Record<Person, number>;
  for (const h of hours) if (mondayOf(h.date) === week) out[h.person] += h.hours;
  return out;
}

export interface RetainerUsage {
  retainerId: string;
  projectId: string;
  month: string;
  used: number;
  cap: number;
  remaining: number;
  over: number;
}

/** Retainer hours this calendar month against the cap. Unused hours do not carry over. */
export function retainerUsage(r: Retainer, hours: HoursEntry[], today: ISODate): RetainerUsage {
  const month = monthKey(today);
  const used = hours
    .filter((h) => h.kind === "retainer" && h.projectId === r.projectId && monthKey(h.date) === month)
    .reduce((s, h) => s + h.hours, 0);
  return {
    retainerId: r.id,
    projectId: r.projectId,
    month,
    used,
    cap: r.hoursCap,
    remaining: Math.max(0, r.hoursCap - used),
    over: Math.max(0, used - r.hoursCap),
  };
}

export interface ProBonoRow {
  projectId: string;
  client: string;
  hours: number;
  sunkValue: number;
}

/** Hours logged on pro bono projects at the settings hourly rate. Never revenue. */
export function proBonoSunk(projects: Project[], hours: HoursEntry[], hourlyRate: number) {
  const rows: ProBonoRow[] = projects
    .filter((p) => p.proBono)
    .map((p) => {
      const h = hours.filter((e) => e.projectId === p.id).reduce((s, e) => s + e.hours, 0);
      return { projectId: p.id, client: p.client, hours: h, sunkValue: h * hourlyRate };
    });
  return { rows, total: rows.reduce((s, r) => s + r.sunkValue, 0) };
}

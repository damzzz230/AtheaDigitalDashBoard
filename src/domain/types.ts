import type {
  Collections,
  HoursEntry,
  Invoice,
  Lead,
  Project,
  Retainer,
  RunningCost,
  Settings,
  Site,
  SiteCheckSummary,
  WeeklyMarketing,
} from "../shared/schema";
import { defaultSettings } from "../shared/defaults";

export interface Data {
  leads: Lead[];
  projects: Project[];
  invoices: Invoice[];
  retainers: Retainer[];
  hours: HoursEntry[];
  sites: Site[];
  marketing: WeeklyMarketing[];
  costs: RunningCost[];
  settings: Settings;
  siteChecks: Record<string, SiteCheckSummary>;
}

export function toData(c: Collections, siteChecks: Record<string, SiteCheckSummary> = {}): Data {
  return {
    leads: Object.values(c.leads),
    projects: Object.values(c.projects),
    invoices: Object.values(c.invoices),
    retainers: Object.values(c.retainers),
    hours: Object.values(c.hours),
    sites: Object.values(c.sites),
    marketing: Object.values(c.marketing),
    costs: Object.values(c.costs),
    settings: c.settings.settings ?? defaultSettings(),
    siteChecks,
  };
}

export function emptyData(): Data {
  return {
    leads: [],
    projects: [],
    invoices: [],
    retainers: [],
    hours: [],
    sites: [],
    marketing: [],
    costs: [],
    settings: defaultSettings(),
    siteChecks: {},
  };
}

export type Level = "ok" | "amber" | "red";

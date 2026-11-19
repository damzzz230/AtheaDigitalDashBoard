import {
  leadSchema,
  projectSchema,
  retainerSchema,
  siteSchema,
  type CollectionName,
  type Collections,
  type Meta,
} from "./schema";
import { defaultSettings } from "./defaults";

export { defaultSettings };

function meta(now: string): Meta {
  return { version: 1, createdAt: now, updatedAt: now, updatedBy: "system" };
}

function keyed<T extends { id: string }>(items: T[], now: string): Record<string, T & Meta> {
  return Object.fromEntries(items.map((i) => [i.id, { ...i, ...meta(now) }]));
}

export function emptyCollections(): Collections {
  return {
    leads: {},
    projects: {},
    invoices: {},
    retainers: {},
    hours: {},
    sites: {},
    marketing: {},
    costs: {},
    settings: {},
  };
}

/**
 * Only the facts confirmed by the founders. Every money field is blank (null);
 * no leads, amounts or hours are invented.
 */
export function seedCollections(now: string): Collections {
  const projects = [
    projectSchema.parse({
      id: "p-topdraw",
      client: "TopDraw Projects",
      status: "Delivered, Awaiting Balance",
      goLiveOn: "2026-11-18",
      siteUrl: "https://topdrawprojects.co.za",
      netlifyAccount: "athea",
      retainerDecision: "accepted",
      notes: "Launched 18 Nov 2026. Retainer starts 1 Dec 2026. Status and balance were not in the brief: confirm.",
    }),
    projectSchema.parse({
      id: "p-bugz",
      client: "BUGZ",
      proBono: true,
      status: "Closed, Paid",
      closedOn: "2026-10-08",
      siteUrl: "https://bugsza.co.za",
      retainerDecision: "offered",
      notes: "Pro bono. Handed over 8 Oct 2026. Hourly or monthly retainer offered; client has not decided.",
    }),
  ];

  const leads = [
    leadSchema.parse({
      id: "l-hair77",
      business: "Hair@77",
      status: "Replied",
      notes: "Single-page build. In design/mockup stage. Not live. Status set to Replied as a placeholder: confirm.",
    }),
    leadSchema.parse({
      id: "l-southern-rebellion",
      business: "The Southern Rebellion",
      niche: "Tattoo and piercing studio",
      status: "Preview Sent",
      notes: "Tattoo and piercing studio in Randburg. At preview stage: add the date the preview was sent.",
    }),
  ];

  const retainers = [
    retainerSchema.parse({ id: "r-topdraw", projectId: "p-topdraw", startOn: "2026-12-01", hoursCap: 6 }),
  ];

  const sites = [
    siteSchema.parse({
      id: "s-topdraw",
      name: "TopDraw Projects",
      url: "topdrawprojects.co.za",
      projectId: "p-topdraw",
      netlifyAccount: "athea",
    }),
    siteSchema.parse({ id: "s-bugz", name: "BUGZ", url: "bugsza.co.za", projectId: "p-bugz" }),
    siteSchema.parse({
      id: "s-athea",
      name: "Athea Digital",
      url: "atheadigital.co.za",
      netlifyAccount: "personal",
      notes: "Still on the personal Netlify account. Migration to the Athea account pending.",
    }),
  ];

  return {
    ...emptyCollections(),
    leads: keyed(leads, now),
    projects: keyed(projects, now),
    retainers: keyed(retainers, now),
    sites: keyed(sites, now),
    settings: keyed([defaultSettings()], now),
  } as Collections;
}

export type { CollectionName };

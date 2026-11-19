import { z } from "zod";
import { containsSensitive, SENSITIVE_ERROR } from "./sensitive";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const isoDate = z.string().refine(isRealDate, "Use a real date (YYYY-MM-DD)");
const optDate = isoDate.nullable().default(null);

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .refine((s) => !containsSensitive(s), SENSITIVE_ERROR);

const notes = text(4000).default("");
const money = z.number().finite().nonnegative().max(10_000_000).nullable().default(null);
const count = z.number().int().nonnegative().max(100_000).default(0);

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

export const STATUSES = [
  "New",
  "Contacted",
  "Replied",
  "Preview Sent",
  "Deposit Paid",
  "In Build",
  "Delivered, Awaiting Balance",
  "Closed, Paid",
  "Lost",
  "Lost After Deposit",
] as const;
export type Status = (typeof STATUSES)[number];
export const MAIN_FLOW: readonly Status[] = STATUSES.slice(0, 8);
export const EXIT_STATUSES: readonly Status[] = ["Lost", "Lost After Deposit"];

export const SOURCES = ["cold-call", "instagram-dm", "maps-scrape", "referral", "other"] as const;
export type Source = (typeof SOURCES)[number];
export const PEOPLE = ["damz", "das"] as const;
export type Person = (typeof PEOPLE)[number];
export const CLOSERS = ["damz", "das", "gabriel"] as const;
export const PACKAGES = ["starter", "standard", "custom"] as const;
export type PackageId = (typeof PACKAGES)[number];
export const NETLIFY_ACCOUNTS = ["athea", "personal"] as const;
export const RETAINER_DECISIONS = ["none", "offered", "accepted", "declined"] as const;
export const INVOICE_TYPES = ["deposit", "balance", "retainer", "extra"] as const;
export const HOURS_KINDS = ["build", "retainer", "admin"] as const;

const status = z.enum(STATUSES);

export const leadSchema = z.object({
  id: idSchema,
  business: text(160).pipe(z.string().min(1, "Business name is required")),
  niche: text(80).nullable().default(null),
  source: z.enum(SOURCES).nullable().default(null),
  contact: text(200).default(""),
  status: status.default("New"),
  previewSentOn: optDate,
  lostFromStatus: status.nullable().default(null),
  notes,
});
export type LeadInput = z.input<typeof leadSchema>;
export type Lead = z.output<typeof leadSchema>;

export const projectSchema = z.object({
  id: idSchema,
  client: text(160).pipe(z.string().min(1, "Client name is required")),
  package: z.enum(PACKAGES).nullable().default(null),
  proBono: z.boolean().default(false),
  leadId: idSchema.nullable().default(null),
  niche: text(80).nullable().default(null),
  source: z.enum(SOURCES).nullable().default(null),
  status: status.default("Deposit Paid"),
  lostFromStatus: status.nullable().default(null),
  previewSentOn: optDate,
  approvedOn: optDate,
  depositClearedOn: optDate,
  assetsReceivedOn: optDate,
  assetCutoffOn: optDate,
  goLiveOn: optDate,
  closedOn: optDate,
  clientDelayDays: z.number().int().nonnegative().max(365).default(0),
  revisionRoundsUsed: z.number().int().nonnegative().max(50).default(0),
  weeklyHoursCommitted: z.number().nonnegative().max(80).nullable().default(null),
  owner: z.enum(PEOPLE).nullable().default(null),
  closedBy: z.enum(CLOSERS).nullable().default(null),
  price: money,
  siteUrl: text(300).default(""),
  netlifyAccount: z.enum(NETLIFY_ACCOUNTS).nullable().default(null),
  retainerDecision: z.enum(RETAINER_DECISIONS).default("none"),
  followUpsDone: z.record(z.string().max(16), isoDate).default({}),
  notes,
});
export type Project = z.output<typeof projectSchema>;

export const invoiceSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  type: z.enum(INVOICE_TYPES),
  amount: z.number().finite().positive("Amount must be more than zero").max(10_000_000),
  issuedOn: isoDate,
  dueOn: isoDate,
  paidOn: optDate,
});
export type Invoice = z.output<typeof invoiceSchema>;

export const retainerSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  startOn: isoDate,
  monthlyPrice: money,
  hoursCap: z.number().nonnegative().max(200).default(6),
  endedOn: optDate,
  notes,
});
export type Retainer = z.output<typeof retainerSchema>;

export const hoursSchema = z.object({
  id: idSchema,
  projectId: idSchema.nullable().default(null),
  person: z.enum(PEOPLE),
  date: isoDate,
  hours: z.number().positive().max(24),
  kind: z.enum(HOURS_KINDS),
  note: text(300).default(""),
});
export type HoursEntry = z.output<typeof hoursSchema>;

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Normalises "example.co.za" or "https://example.co.za/" into "https://example.co.za". Rejects IPs and localhost. */
export function normaliseSiteUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  if (!HOST_RE.test(url.hostname)) return null;
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.protocol}//${url.hostname.toLowerCase()}${path}`;
}

export const siteSchema = z.object({
  id: idSchema,
  name: text(160).pipe(z.string().min(1, "Name is required")),
  url: z.string().transform((v, ctx) => {
    const n = normaliseSiteUrl(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Use a public domain such as example.co.za" });
      return z.NEVER;
    }
    return n;
  }),
  projectId: idSchema.nullable().default(null),
  netlifyAccount: z.enum(NETLIFY_ACCOUNTS).nullable().default(null),
  live: z.boolean().default(true),
  lastFormTestOn: optDate,
  gscOwnerIsClient: z.boolean().nullable().default(null),
  gbpOwnerIsClient: z.boolean().nullable().default(null),
  domainRegistrarOwner: text(120).default(""),
  notes,
});
export type Site = z.output<typeof siteSchema>;

export const marketingSchema = z.object({
  id: idSchema,
  weekStart: isoDate.refine((d) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).getUTCDay() === 1;
  }, "Week start must be a Monday"),
  posts: count,
  dmsReceived: count,
  dmReplies: count,
  dmAvgResponseHours: z.number().nonnegative().max(1000).nullable().default(null),
  outreachSent: count,
  outreachReplies: count,
  previewsSent: count,
  notes,
});
export type WeeklyMarketing = z.output<typeof marketingSchema>;

export const costSchema = z.object({
  id: idSchema,
  name: text(120).pipe(z.string().min(1, "Name is required")),
  quantity: z.number().int().positive().max(100).default(1),
  monthlyAmount: money,
  notes,
});
export type RunningCost = z.output<typeof costSchema>;

const packageSettings = z.object({
  price: money,
  maxPages: z.number().int().positive().max(1000).nullable().default(null),
  revisionRounds: z.number().int().nonnegative().max(20).nullable().default(null),
  description: text(400).default(""),
});

export const settingsSchema = z.object({
  id: z.literal("settings"),
  packages: z.object({
    starter: packageSettings,
    standard: packageSettings,
    custom: packageSettings,
  }),
  retainer: z.object({
    monthlyPrice: money,
    hoursCap: z.number().nonnegative().max(200),
    noticeMonths: z.number().int().nonnegative().max(12),
  }),
  hourlyRate: z.number().nonnegative().max(100_000),
  weekdayHoursPerPerson: z.number().nonnegative().max(24),
  weekendHoursMin: z.number().nonnegative().max(24),
  weekendHoursMax: z.number().nonnegative().max(24),
  weeklyPostTarget: z.number().int().nonnegative().max(100),
  mrrTarget: money,
  commissionTiers: z
    .array(z.object({ minSale: z.number().nonnegative().max(10_000_000), rate: z.number().min(0).max(1) }))
    .min(1)
    .max(10),
  gabrielRetainerRate: z.number().min(0).max(1),
  gabrielEngagementStartOn: optDate,
  gabrielEngagementEndOn: optDate,
  unconfirmed: z.object({
    weekendHours: z.boolean(),
    mrrTarget: z.boolean(),
  }),
});
export type Settings = z.output<typeof settingsSchema>;

export const recordSchemas = {
  leads: leadSchema,
  projects: projectSchema,
  invoices: invoiceSchema,
  retainers: retainerSchema,
  hours: hoursSchema,
  sites: siteSchema,
  marketing: marketingSchema,
  costs: costSchema,
  settings: settingsSchema,
} as const;

export type CollectionName = keyof typeof recordSchemas;
export const COLLECTIONS = Object.keys(recordSchemas) as CollectionName[];

export type RecordOf<C extends CollectionName> = z.output<(typeof recordSchemas)[C]>;

export interface Meta {
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: Person | "system";
}

export type Stored<C extends CollectionName> = RecordOf<C> & Meta;
export type CollectionMap<C extends CollectionName> = Record<string, Stored<C>>;
export type Collections = { [C in CollectionName]: CollectionMap<C> };

export const siteCheckSchema = z.object({
  siteId: idSchema,
  siteUrl: z.string(),
  checkedAt: z.string(),
  httpStatus: z.number().int().nullable(),
  responseMs: z.number().nonnegative().nullable(),
  sslExpiresOn: isoDate.nullable(),
  error: z.string().max(300).nullable(),
});
export type SiteCheck = z.output<typeof siteCheckSchema>;

export interface SiteCheckSummary {
  latest: SiteCheck | null;
  history: { checkedAt: string; responseMs: number | null; ok: boolean }[];
  lighthouse: { score: number; checkedAt: string } | null;
}

export interface Snapshot {
  user: Person;
  collections: Collections;
  siteChecks: Record<string, SiteCheckSummary>;
  pagespeedEnabled: boolean;
}

export const mutationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("put"),
    collection: z.enum(COLLECTIONS as [CollectionName, ...CollectionName[]]),
    id: idSchema,
    expectedVersion: z.number().int().nonnegative(),
    record: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal("delete"),
    collection: z.enum(COLLECTIONS as [CollectionName, ...CollectionName[]]),
    id: idSchema,
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    op: z.literal("bulkCreate"),
    collection: z.literal("leads"),
    records: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
  }),
]);
export type Mutation = z.input<typeof mutationSchema>;

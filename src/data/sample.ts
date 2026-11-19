import { addDays, mondayOf } from "../domain/dates";
import { hoursSchema, invoiceSchema, leadSchema, marketingSchema, projectSchema, type Collections } from "../shared/schema";
import { seedCollections } from "../shared/seed";

/**
 * DEV ONLY. Obviously fake SAMPLE records for trying the screens. Every name starts with "SAMPLE".
 * Loaded into the browser's local store only; never sent anywhere and not bundled in production.
 */
export function sampleCollections(today: string, nowIso: string): Collections {
  const c = seedCollections(nowIso);
  const meta = { version: 1, createdAt: nowIso, updatedAt: nowIso, updatedBy: "system" as const };
  const put = <K extends keyof Collections>(k: K, rec: { id: string }) => {
    (c[k] as Record<string, unknown>)[rec.id] = { ...rec, ...meta };
  };
  const niches = ["SAMPLE Salon", "SAMPLE Tattoo", "SAMPLE Plumber"];
  const sources = ["cold-call", "instagram-dm", "maps-scrape", "referral"] as const;
  const statuses = ["New", "Contacted", "Replied", "Preview Sent", "Preview Sent", "Lost", "Contacted", "Replied", "Preview Sent", "New", "Lost", "Replied"] as const;
  statuses.forEach((status, i) =>
    put(
      "leads",
      leadSchema.parse({
        id: `sample-l${i}`,
        business: `SAMPLE Lead ${i + 1}`,
        niche: niches[i % 3],
        source: sources[i % 4],
        contact: `sample-${i + 1}`,
        status,
        previewSentOn: status === "Preview Sent" ? addDays(today, -(4 + i)) : status === "Lost" ? addDays(today, -30) : null,
        lostFromStatus: status === "Lost" ? "Preview Sent" : null,
        notes: "SAMPLE data, not real.",
      }),
    ),
  );
  const p1 = projectSchema.parse({ id: "sample-p1", client: "SAMPLE Build A", package: "standard", status: "In Build", owner: "damz", closedBy: "gabriel", price: 4999, depositClearedOn: addDays(today, -9), assetsReceivedOn: addDays(today, -8), weeklyHoursCommitted: 9, revisionRoundsUsed: 3, niche: niches[0], source: "cold-call" });
  const p2 = projectSchema.parse({ id: "sample-p2", client: "SAMPLE Build B", package: "starter", status: "Deposit Paid", owner: "das", price: 3499, depositClearedOn: addDays(today, -2), weeklyHoursCommitted: 6, niche: niches[1], source: "instagram-dm" });
  const p3 = projectSchema.parse({ id: "sample-p3", client: "SAMPLE Build C", package: "starter", status: "Delivered, Awaiting Balance", owner: "das", price: 3499, approvedOn: addDays(today, -10), depositClearedOn: addDays(today, -30), assetsReceivedOn: addDays(today, -28), goLiveOn: addDays(today, -9), niche: niches[2], source: "referral" });
  [p1, p2, p3].forEach((p) => put("projects", p));
  put("invoices", invoiceSchema.parse({ id: "sample-i1", projectId: "sample-p1", type: "deposit", amount: 2500, issuedOn: addDays(today, -12), dueOn: addDays(today, -9), paidOn: addDays(today, -9) }));
  put("invoices", invoiceSchema.parse({ id: "sample-i2", projectId: "sample-p3", type: "balance", amount: 1749, issuedOn: addDays(today, -10), dueOn: addDays(today, -3) }));
  put("invoices", invoiceSchema.parse({ id: "sample-i3", projectId: "sample-p2", type: "deposit", amount: 1750, issuedOn: addDays(today, -3), dueOn: addDays(today, 4) }));
  put("hours", hoursSchema.parse({ id: "sample-h1", projectId: "sample-p1", person: "damz", date: today, hours: 2, kind: "build", note: "SAMPLE" }));
  put("hours", hoursSchema.parse({ id: "sample-h2", projectId: "p-bugz", person: "das", date: addDays(today, -40), hours: 6, kind: "build", note: "SAMPLE" }));
  const wk = mondayOf(today);
  put("marketing", marketingSchema.parse({ id: `w-${addDays(wk, -7)}`, weekStart: addDays(wk, -7), posts: 3, dmsReceived: 5, dmReplies: 5, dmAvgResponseHours: 2.5, outreachSent: 20, outreachReplies: 3, previewsSent: 2, notes: "SAMPLE" }));
  put("marketing", marketingSchema.parse({ id: `w-${wk}`, weekStart: wk, posts: 1, dmsReceived: 2, dmReplies: 1, dmAvgResponseHours: 5, outreachSent: 8, outreachReplies: 1, previewsSent: 1, notes: "SAMPLE" }));
  return c;
}

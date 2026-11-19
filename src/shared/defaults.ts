import { settingsSchema, type Settings } from "./schema";

/** Confirmed on 19 Nov 2026. Weekend hours and the MRR target stay flagged as unconfirmed. */
export function defaultSettings(): Settings {
  return settingsSchema.parse({
    id: "settings",
    packages: {
      starter: {
        price: 3499,
        maxPages: 5,
        revisionRounds: 1,
        description: "Once-off. Up to 5 pages: Home, About, Services, Gallery, Contact.",
      },
      standard: {
        price: 4999,
        maxPages: 10,
        revisionRounds: 2,
        description: "Once-off. Up to 10 pages, 2 consolidated revision rounds, priority in the build queue.",
      },
      custom: {
        price: null,
        maxPages: null,
        revisionRounds: null,
        description:
          "Quoted per project: e-commerce, web apps, full brand identity, 3D, AI automation, email marketing.",
      },
    },
    retainer: { monthlyPrice: 999, hoursCap: 6, noticeMonths: 1 },
    hourlyRate: 250,
    weekdayHoursPerPerson: 2,
    weekendHoursMin: 6,
    weekendHoursMax: 8,
    weeklyPostTarget: 3,
    mrrTarget: null,
    commissionTiers: [{ minSale: 0, rate: 0.1 }],
    gabrielRetainerRate: 0.1,
    gabrielEngagementStartOn: null,
    gabrielEngagementEndOn: null,
    unconfirmed: { weekendHours: true, mrrTarget: true },
  });
}

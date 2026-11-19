import type { Severity } from "../domain/actions";
import type { PreviewLevel } from "../domain/preview";
import type { Light } from "../domain/sites";
import type { Status } from "../shared/schema";
import type { Tone } from "./ui";

export const PERSON_LABEL: Record<string, string> = { damz: "Damz", das: "Das", gabriel: "Gabriel", system: "Seed" };
export const SOURCE_LABEL: Record<string, string> = {
  "cold-call": "Cold call",
  "instagram-dm": "Instagram DM",
  "maps-scrape": "Maps scrape",
  referral: "Referral",
  other: "Other",
};
export const PACKAGE_LABEL: Record<string, string> = { starter: "Starter", standard: "Standard", custom: "Custom" };
export const ACCOUNT_LABEL: Record<string, string> = { athea: "Athea Digital", personal: "Personal" };
export const RETAINER_LABEL: Record<string, string> = { none: "Not offered yet", offered: "Offered, client undecided", accepted: "Accepted", declined: "Declined" };
export const INVOICE_LABEL: Record<string, string> = { deposit: "Deposit", balance: "Balance", retainer: "Retainer", extra: "Extra work" };
export const KIND_LABEL: Record<string, string> = { build: "Build", retainer: "Retainer", admin: "Admin" };

export function statusTone(s: Status): Tone {
  if (s === "Lost" || s === "Lost After Deposit") return "bad";
  if (s === "Closed, Paid") return "ok";
  if (s === "Preview Sent" || s === "Delivered, Awaiting Balance") return "warn";
  if (s === "Deposit Paid" || s === "In Build") return "info";
  return "neutral";
}

export function statusLabel(s: Status, proBono = false): string {
  if (proBono && s === "Closed, Paid") return "Closed (pro bono)";
  return s;
}

export const severityTone: Record<Severity, Tone> = { overdue: "bad", due: "warn", undated: "neutral", later: "info" };
export const previewTone: Record<PreviewLevel, Tone> = { ok: "ok", amber: "warn", red: "bad", "take-down": "bad", lost: "bad" };
export const lightTone: Record<Light, Tone> = { ok: "ok", warn: "warn", bad: "bad", unknown: "neutral" };
export const lightLabel: Record<Light, string> = { ok: "Healthy", warn: "Needs attention", bad: "Unhealthy", unknown: "Not checked yet" };

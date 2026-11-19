import type { SiteCheckSummary } from "../shared/schema";
import { diffDays, type ISODate } from "./dates";

export const SLOW_MS = 3000;
export const SSL_WARN_DAYS = 30;
export const SSL_BAD_DAYS = 14;
export const FORM_TEST_MAX_DAYS = 30;
export const STALE_CHECK_MINUTES = 120;

export type Light = "ok" | "warn" | "bad" | "unknown";

export interface SiteHealth {
  light: Light;
  reasons: string[];
  sslDays: number | null;
  responseMs: number | null;
  httpStatus: number | null;
}

export function siteHealth(summary: SiteCheckSummary | undefined, today: ISODate, now: Date = new Date()): SiteHealth {
  const latest = summary?.latest ?? null;
  if (!latest) return { light: "unknown", reasons: ["Not checked yet"], sslDays: null, responseMs: null, httpStatus: null };
  const reasons: string[] = [];
  let light: Light = "ok";
  const bump = (l: Light) => {
    if (l === "bad" || (l === "warn" && light === "ok")) light = l;
  };
  const sslDays = latest.sslExpiresOn ? diffDays(today, latest.sslExpiresOn) : null;
  if (latest.error || latest.httpStatus == null) {
    // A certificate problem on a page that still answers is reported with its status code too.
    bump("bad");
    reasons.push(latest.error ? (latest.httpStatus != null ? latest.error : `Unreachable: ${latest.error}`) : "No response");
  } else if (latest.httpStatus >= 400) {
    bump("bad");
    reasons.push(`HTTP ${latest.httpStatus}`);
  }
  if (sslDays != null) {
    if (sslDays < SSL_BAD_DAYS) {
      bump("bad");
      reasons.push(sslDays < 0 ? "SSL certificate expired" : `SSL expires in ${sslDays} days`);
    } else if (sslDays < SSL_WARN_DAYS) {
      bump("warn");
      reasons.push(`SSL expires in ${sslDays} days`);
    }
  }
  if (latest.responseMs != null && latest.responseMs > SLOW_MS) {
    bump("warn");
    reasons.push(`Slow: ${Math.round(latest.responseMs)} ms`);
  }
  const ageMin = (now.getTime() - Date.parse(latest.checkedAt)) / 60_000;
  if (Number.isFinite(ageMin) && ageMin > STALE_CHECK_MINUTES) {
    bump("warn");
    reasons.push("Last check is more than 2 hours old");
  }
  return { light, reasons, sslDays, responseMs: latest.responseMs, httpStatus: latest.httpStatus };
}

export type FormTest = { level: "ok" | "amber"; label: string; days: number | null };

export function formTestState(lastFormTestOn: ISODate | null, today: ISODate): FormTest {
  if (!lastFormTestOn) return { level: "amber", label: "Never tested", days: null };
  const days = diffDays(lastFormTestOn, today);
  return {
    level: days > FORM_TEST_MAX_DAYS ? "amber" : "ok",
    label: days === 0 ? "Tested today" : `${days} days ago`,
    days,
  };
}

import { OPEN_BUILD_STATUSES, retainerUsage } from "./capacity";
import { deliveryClock } from "./clock";
import { addDays, diffDays, formatDate, mondayOf, plural, type ISODate } from "./dates";
import { openFollowUps } from "./followups";
import { buildDeals } from "./funnel";
import { thisWeekEntry } from "./marketing";
import { balanceStatus, formatRand, invoiceState, retainerActive } from "./money";
import { previewWindow } from "./preview";
import { revisionState } from "./revisions";
import { formTestState, siteHealth, SSL_WARN_DAYS } from "./sites";
import type { Data } from "./types";

export type Severity = "overdue" | "due" | "undated" | "later";
export type Screen = "today" | "pipeline" | "projects" | "money" | "capacity" | "sites" | "marketing" | "settings";

export interface ActionItem {
  id: string;
  severity: Severity;
  dueOn: ISODate | null;
  title: string;
  detail: string;
  screen: Screen;
  refId?: string;
}

/** Items due within the next 7 days (today plus 6) count as "this week". */
export const THIS_WEEK_DAYS = 6;

function severityFor(dueOn: ISODate | null, today: ISODate): Severity {
  if (!dueOn) return "undated";
  if (dueOn < today) return "overdue";
  if (dueOn <= addDays(today, THIS_WEEK_DAYS)) return "due";
  return "later";
}

const ORDER: Record<Severity, number> = { overdue: 0, due: 1, undated: 2, later: 3 };

export function sortActions(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    if (ORDER[a.severity] !== ORDER[b.severity]) return ORDER[a.severity] - ORDER[b.severity];
    if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function needsAction(data: Data, today: ISODate, now: Date = new Date()): ActionItem[] {
  const items: ActionItem[] = [];
  const add = (i: Omit<ActionItem, "severity"> & { severity?: Severity }) =>
    items.push({ ...i, severity: i.severity ?? severityFor(i.dueOn, today) });
  const { settings: s } = data;

  // Preview windows
  for (const d of buildDeals(data.leads, data.projects)) {
    if (d.status !== "Preview Sent") continue;
    const screen = d.kind === "lead" ? "pipeline" : "projects";
    const w = previewWindow(d.previewSentOn, today);
    if (!w) {
      add({ id: `preview-date-${d.id}`, dueOn: null, title: `Add the preview date for ${d.name}`, detail: "The 14-day window can't run without it.", screen, refId: d.id });
      continue;
    }
    if (w.level === "lost") {
      add({ id: `preview-${d.id}`, dueOn: w.expiresOn, title: `Take ${d.name}'s preview down and mark Lost`, detail: `Sent ${formatDate(w.sentOn)}, day ${w.day}. Silent past 14 days: the client owes nothing.`, screen, refId: d.id });
    } else if (w.level === "take-down") {
      add({ id: `preview-${d.id}`, dueOn: w.expiresOn, title: `Take ${d.name}'s preview down today`, detail: `Day 14 since ${formatDate(w.sentOn)}.`, screen, refId: d.id });
    } else {
      add({ id: `preview-${d.id}`, dueOn: w.expiresOn, title: `${d.name}: preview decision due`, detail: `Day ${w.day} of 14. Take-down on ${formatDate(w.expiresOn)}.`, screen, refId: d.id });
    }
  }

  for (const p of data.projects) {
    // Delivery clock
    if (OPEN_BUILD_STATUSES.includes(p.status)) {
      const c = deliveryClock(p, today);
      if (!c.started) {
        add({ id: `clock-${p.id}`, dueOn: null, title: `${p.client}: ${c.label}`, detail: "Day zero needs both the deposit cleared and the assets received.", screen: "projects", refId: p.id });
        if (!p.assetsReceivedOn && p.assetCutoffOn) {
          add({ id: `assets-${p.id}`, dueOn: p.assetCutoffOn, title: `${p.client}: assets due`, detail: `Asset cut-off ${formatDate(p.assetCutoffOn)}.`, screen: "projects", refId: p.id });
        }
      } else if (!c.delivered) {
        const pastTarget = today > c.target;
        add({
          id: `clock-${p.id}`,
          dueOn: pastTarget ? c.latest : c.target,
          title: pastTarget ? `${p.client}: deliver by the latest date` : `${p.client}: target delivery`,
          detail: `${c.label}. Target ${formatDate(c.target)}, latest ${formatDate(c.latest)}.`,
          screen: "projects",
          refId: p.id,
        });
      }
    }

    // Balance invoice
    const bal = balanceStatus(p, data.invoices, today);
    if (bal && !bal.paid) {
      add({
        id: `balance-${p.id}`,
        dueOn: bal.dueOn,
        title: bal.invoiced ? `${p.client}: balance due` : `${p.client}: issue the balance invoice`,
        detail: `Balance is due 7 days after approval: ${formatDate(bal.dueOn)}.`,
        screen: "money",
        refId: p.id,
      });
    }

    // Retainer decision before handover
    if (p.status === "Delivered, Awaiting Balance" && p.retainerDecision === "none") {
      add({ id: `retainer-offer-${p.id}`, dueOn: null, title: `Offer ${p.client} a retainer before handover`, detail: "No retainer decision recorded.", screen: "projects", refId: p.id });
    } else if (p.retainerDecision === "offered") {
      add({ id: `retainer-chase-${p.id}`, dueOn: null, title: `Chase ${p.client}'s retainer decision`, detail: "Retainer offered; the client hasn't decided.", screen: "projects", refId: p.id });
    }

    // Revision rounds
    const rev = revisionState(p, s);
    if (rev.over && p.status !== "Closed, Paid") {
      add({ id: `revisions-${p.id}`, dueOn: null, title: `${p.client}: quote extra revision work`, detail: rev.label, screen: "projects", refId: p.id });
    }

    // Follow-ups after go-live
    for (const f of openFollowUps(p.goLiveOn, p.followUpsDone, addDays(today, THIS_WEEK_DAYS))) {
      add({ id: `followup-${p.id}-${f.key}`, dueOn: f.dueOn, title: `${p.client}: ${f.title}`, detail: f.detail, screen: "projects", refId: p.id });
    }
  }

  // Invoices overdue (balance invoices are covered above)
  for (const inv of data.invoices) {
    if (inv.type === "balance") continue;
    const st = invoiceState(inv, today);
    if (st === "paid") continue;
    const client = data.projects.find((p) => p.id === inv.projectId)?.client ?? "Unknown project";
    const sev = severityFor(inv.dueOn, today);
    if (sev === "later") continue;
    add({ id: `invoice-${inv.id}`, dueOn: inv.dueOn, title: `${client}: ${inv.type} invoice ${st === "overdue" ? "overdue" : "due"}`, detail: `${formatRand(inv.amount)}, due ${formatDate(inv.dueOn)}.`, screen: "money", refId: inv.id });
  }

  // Retainer hours over cap this month
  for (const r of data.retainers) {
    if (!retainerActive(r, today)) continue;
    const u = retainerUsage(r, data.hours, today);
    if (u.over > 0) {
      const client = data.projects.find((p) => p.id === r.projectId)?.client ?? "Retainer";
      add({ id: `retainer-over-${r.id}`, dueOn: null, title: `${client}: over the retainer cap`, detail: `${u.used} of ${u.cap} h this month. Quote extra at ${formatRand(s.hourlyRate)}/h before more work.`, screen: "capacity", refId: r.id });
    }
  }

  // Sites
  for (const site of data.sites.filter((x) => x.live)) {
    const h = siteHealth(data.siteChecks[site.id], today, now);
    if (h.light === "bad") {
      add({ id: `site-${site.id}`, dueOn: today, title: `${site.name}: site unhealthy`, detail: h.reasons.join(". "), screen: "sites", refId: site.id });
    } else if (h.sslDays != null && h.sslDays < SSL_WARN_DAYS) {
      add({ id: `ssl-${site.id}`, dueOn: addDays(today, h.sslDays), title: `${site.name}: SSL certificate expiring`, detail: `${plural(h.sslDays, "day")} left.`, screen: "sites", refId: site.id });
    }
    const form = formTestState(site.lastFormTestOn, today);
    if (form.level === "amber") {
      add({ id: `form-${site.id}`, dueOn: null, title: `Test the contact form on ${site.name}`, detail: form.days == null ? "Never tested." : `Last tested ${form.days} days ago.`, screen: "sites", refId: site.id });
    }
    if (site.netlifyAccount === "personal") {
      add({ id: `migrate-${site.id}`, dueOn: null, title: `Move ${site.name} to the Athea Netlify account`, detail: "Still on a personal Netlify account.", screen: "sites", refId: site.id });
    }
  }

  // Marketing: posts this week
  const wk = thisWeekEntry(data.marketing, today);
  const posts = wk?.posts ?? 0;
  if (posts < s.weeklyPostTarget) {
    add({ id: "marketing-posts", dueOn: addDays(mondayOf(today), 6), title: `Posts this week: ${posts} of ${s.weeklyPostTarget}`, detail: wk ? "Update the weekly log as you post." : "No marketing log for this week yet.", screen: "marketing" });
  }

  // Unconfirmed settings
  const open = Object.values(s.unconfirmed).filter(Boolean).length;
  if (open) {
    add({ id: "settings-unconfirmed", dueOn: null, title: `${plural(open, "setting")} need a decision`, detail: "See Settings: Needs a decision.", screen: "settings" });
  }

  return sortActions(items);
}

export function daysOverdue(item: ActionItem, today: ISODate): number | null {
  return item.dueOn && item.dueOn < today ? diffDays(item.dueOn, today) : null;
}

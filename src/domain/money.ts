import type { Invoice, Project, Retainer } from "../shared/schema";
import { addDays, type ISODate } from "./dates";

export const BALANCE_DUE_DAYS = 7;

export type InvoiceState = "paid" | "overdue" | "outstanding";

export function invoiceState(inv: Pick<Invoice, "paidOn" | "dueOn">, today: ISODate): InvoiceState {
  if (inv.paidOn) return "paid";
  return today > inv.dueOn ? "overdue" : "outstanding";
}

export interface MoneyTotals {
  invoiced: number;
  received: number;
  outstanding: number;
  overdue: number;
}

export function totals(invoices: Invoice[], today: ISODate): MoneyTotals {
  const t: MoneyTotals = { invoiced: 0, received: 0, outstanding: 0, overdue: 0 };
  for (const inv of invoices) {
    t.invoiced += inv.amount;
    const s = invoiceState(inv, today);
    if (s === "paid") t.received += inv.amount;
    else {
      t.outstanding += inv.amount;
      if (s === "overdue") t.overdue += inv.amount;
    }
  }
  return t;
}

export interface ProjectMoney extends MoneyTotals {
  projectId: string;
  client: string;
  proBono: boolean;
  price: number | null;
}

export function moneyByProject(projects: Project[], invoices: Invoice[], today: ISODate): ProjectMoney[] {
  return projects.map((p) => ({
    projectId: p.id,
    client: p.client,
    proBono: p.proBono,
    price: p.price,
    ...totals(
      invoices.filter((i) => i.projectId === p.id),
      today,
    ),
  }));
}

export interface BalanceStatus {
  dueOn: ISODate;
  invoiced: boolean;
  paid: boolean;
  overdue: boolean;
}

/** Balance is due 7 days after the client approves. Pro bono projects have no balance. */
export function balanceStatus(
  p: Pick<Project, "id" | "approvedOn" | "proBono">,
  invoices: Invoice[],
  today: ISODate,
): BalanceStatus | null {
  if (!p.approvedOn || p.proBono) return null;
  const dueOn = addDays(p.approvedOn, BALANCE_DUE_DAYS);
  const balance = invoices.filter((i) => i.projectId === p.id && i.type === "balance");
  const paid = balance.length > 0 && balance.every((i) => !!i.paidOn);
  return { dueOn, invoiced: balance.length > 0, paid, overdue: !paid && today > dueOn };
}

export function retainerActive(r: Pick<Retainer, "startOn" | "endedOn">, today: ISODate): boolean {
  return r.startOn <= today && (!r.endedOn || r.endedOn > today);
}

export interface Mrr {
  total: number;
  activeCount: number;
  /** Active retainers with no monthly price recorded yet. */
  unpricedCount: number;
  /** Retainers that start after today. */
  scheduled: Retainer[];
}

export function mrr(retainers: Retainer[], today: ISODate): Mrr {
  const active = retainers.filter((r) => retainerActive(r, today));
  return {
    total: active.reduce((s, r) => s + (r.monthlyPrice ?? 0), 0),
    activeCount: active.length,
    unpricedCount: active.filter((r) => r.monthlyPrice == null).length,
    scheduled: retainers.filter((r) => r.startOn > today && !r.endedOn),
  };
}

export function formatRand(n: number | null | undefined): string {
  if (n == null) return "Not set";
  const rounded = Math.round(n * 100) / 100;
  const [int, dec] = Math.abs(rounded).toFixed(2).split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded < 0 ? "-" : ""}R${withSep}${dec === "00" ? "" : `.${dec}`}`;
}

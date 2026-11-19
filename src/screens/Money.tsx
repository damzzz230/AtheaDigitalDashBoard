import { useState } from "react";
import { opts, RecordForm, useConfirmDelete, type FieldSpec } from "../components/form";
import { INVOICE_LABEL } from "../components/labels";
import { Badge, Button, Card, Drawer, EmptyState, Meter, PageHeader, Stat } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { newId } from "../data/store";
import { proBonoSunk } from "../domain/capacity";
import { gabrielCommission } from "../domain/commission";
import { addDays, formatDate } from "../domain/dates";
import { formatRand, invoiceState, moneyByProject, mrr, retainerActive, totals } from "../domain/money";
import { costSchema, INVOICE_TYPES, invoiceSchema, retainerSchema, type CollectionName, type RecordOf } from "../shared/schema";

type Editing = { collection: "invoices" | "retainers" | "costs"; id: string | null } | null;

export function MoneyScreen() {
  const { data, today, stored, save } = useData();
  const confirmDelete = useConfirmDelete();
  const [editing, setEditing] = useState<Editing>(null);
  const s = data.settings;
  const t = totals(data.invoices, today);
  const m = mrr(data.retainers, today);
  const perProject = moneyByProject(data.projects, data.invoices, today).filter((r) => r.invoiced > 0 || r.price != null);
  const commission = gabrielCommission(data.projects, data.invoices, s);
  const proBono = proBonoSunk(data.projects, data.hours, s.hourlyRate);
  const projectOpts = data.projects.map((p) => ({ value: p.id, label: p.client }));
  const clientOf = (id: string) => data.projects.find((p) => p.id === id)?.client ?? "Unknown project";
  const monthlyCosts = data.costs.reduce((sum, c) => sum + (c.monthlyAmount ?? 0) * c.quantity, 0);
  const unpricedCosts = data.costs.filter((c) => c.monthlyAmount == null).length;

  const invoiceFields: FieldSpec[] = [
    { key: "projectId", label: "Project", type: "select", options: projectOpts, required: true },
    { key: "type", label: "Type", type: "select", options: opts(INVOICE_TYPES, (x) => INVOICE_LABEL[x]) },
    { key: "amount", label: "Amount (R, no VAT)", type: "money", required: true },
    { key: "issuedOn", label: "Issued", type: "date", required: true },
    { key: "dueOn", label: "Due", type: "date", required: true, hint: "Balance invoices: 7 days after approval." },
    { key: "paidOn", label: "Paid", type: "date", hint: "Leave blank until the money has cleared." },
  ];
  const retainerFields: FieldSpec[] = [
    { key: "projectId", label: "Project", type: "select", options: projectOpts, required: true },
    { key: "startOn", label: "Starts", type: "date", required: true },
    { key: "monthlyPrice", label: "Monthly price (R)", type: "money", hint: `Standard retainer is ${formatRand(s.retainer.monthlyPrice)}/month. Leave blank until agreed.` },
    { key: "hoursCap", label: "Hours per month", type: "number" },
    { key: "endedOn", label: "Ended", type: "date", hint: `Month-to-month, ${s.retainer.noticeMonths} month's notice.` },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
  const costFields: FieldSpec[] = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "quantity", label: "Quantity", type: "int" },
    { key: "monthlyAmount", label: "Monthly cost each (R)", type: "money" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  function blank(c: "invoices" | "retainers" | "costs"): RecordOf<CollectionName> {
    if (c === "invoices") return { ...invoiceSchema.parse({ id: newId("i"), projectId: data.projects[0]?.id ?? "none", type: "deposit", amount: 1, issuedOn: today, dueOn: addDays(today, 7) }), amount: null as unknown as number };
    if (c === "retainers") return retainerSchema.parse({ id: newId("r"), projectId: data.projects[0]?.id ?? "none", startOn: today, hoursCap: s.retainer.hoursCap });
    return { ...costSchema.parse({ id: newId("c"), name: "x" }), name: "" };
  }

  const editStored = editing?.id ? stored(editing.collection, editing.id) : undefined;
  const fieldsFor = { invoices: invoiceFields, retainers: retainerFields, costs: costFields };
  const titleFor = { invoices: "invoice", retainers: "retainer", costs: "running cost" };

  const markPaid = async (id: string) => {
    const inv = stored("invoices", id);
    if (!inv) return;
    const r = await save("invoices", { ...withoutMeta(inv), paidOn: today }, inv);
    if (!r.ok && r.message) window.alert(r.message);
  };

  return (
    <>
      <PageHeader title="Money" sub="Athea is not VAT-registered, so every amount is VAT-free." action={<Button onClick={() => setEditing({ collection: "invoices", id: null })} disabled={!data.projects.length}>Add invoice</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoiced" value={formatRand(t.invoiced)} />
        <Stat label="Received" value={formatRand(t.received)} tone="ok" />
        <Stat label="Outstanding" value={formatRand(t.outstanding)} tone={t.outstanding ? "warn" : undefined} />
        <Stat label="Overdue" value={formatRand(t.overdue)} tone={t.overdue ? "bad" : undefined} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="MRR vs target" className="lg:col-span-1">
          <p className="tabular text-3xl font-bold">{formatRand(m.total)}</p>
          <p className="mt-1 text-sm text-muted">{s.mrrTarget == null ? "No MRR target set yet (Settings)." : `Target ${formatRand(s.mrrTarget)}`}</p>
          {s.mrrTarget != null && (
            <div className="mt-3">
              <Meter value={m.total} max={s.mrrTarget} tone={m.total >= s.mrrTarget ? "ok" : "info"} label="MRR against target" />
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            {m.activeCount} active retainer{m.activeCount === 1 ? "" : "s"}
            {m.unpricedCount ? `, ${m.unpricedCount} without a price` : ""}
            {m.scheduled.length ? `. Starting soon: ${m.scheduled.map((r) => `${clientOf(r.projectId)} on ${formatDate(r.startOn)}`).join(", ")}` : ""}.
          </p>
        </Card>
        <Card title="Retainers" className="lg:col-span-2" action={<Button small variant="ghost" onClick={() => setEditing({ collection: "retainers", id: null })} disabled={!data.projects.length}>Add retainer</Button>}>
          {data.retainers.length === 0 ? (
            <EmptyState title="No retainers yet.">Add one when a client signs up for {formatRand(s.retainer.monthlyPrice)}/month ({s.retainer.hoursCap} h).</EmptyState>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr><th>Client</th><th>Starts</th><th>Monthly</th><th>Hours cap</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.retainers.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => setEditing({ collection: "retainers", id: r.id })}>
                      <td>{clientOf(r.projectId)}</td>
                      <td className="tabular">{formatDate(r.startOn)}</td>
                      <td className="tabular">{formatRand(r.monthlyPrice)}</td>
                      <td className="tabular">{r.hoursCap} h</td>
                      <td>{r.endedOn && r.endedOn <= today ? <Badge>Ended</Badge> : retainerActive(r, today) ? <Badge tone="ok">Active</Badge> : <Badge tone="info">Starts {formatDate(r.startOn)}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Invoices" className="mt-4">
        {data.invoices.length === 0 ? (
          <EmptyState title="No invoices yet." action={data.projects.length ? <Button small onClick={() => setEditing({ collection: "invoices", id: null })}>Add the first invoice</Button> : undefined}>
            {data.projects.length ? "Record deposits, balances, retainer and extra-work invoices here." : "Add a project first, then record its invoices here."}
          </EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr><th>Client</th><th>Type</th><th>Amount</th><th>Issued</th><th>Due</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {[...data.invoices].sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1)).map((inv) => {
                  const st = invoiceState(inv, today);
                  return (
                    <tr key={inv.id} className="clickable" onClick={() => setEditing({ collection: "invoices", id: inv.id })}>
                      <td>{clientOf(inv.projectId)}</td>
                      <td>{INVOICE_LABEL[inv.type]}</td>
                      <td className="tabular">{formatRand(inv.amount)}</td>
                      <td className="tabular whitespace-nowrap">{formatDate(inv.issuedOn)}</td>
                      <td className="tabular whitespace-nowrap">{formatDate(inv.dueOn)}</td>
                      <td>{st === "paid" ? <Badge tone="ok">Paid {formatDate(inv.paidOn)}</Badge> : st === "overdue" ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">Outstanding</Badge>}</td>
                      <td onClick={(e) => e.stopPropagation()}>{st !== "paid" && <Button small variant="subtle" onClick={() => void markPaid(inv.id)}>Mark paid today</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="By project">
          {perProject.length === 0 ? (
            <EmptyState title="Nothing to total yet.">Projects show here once they have a price or an invoice.</EmptyState>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>Client</th><th>Price</th><th>Invoiced</th><th>Received</th><th>Outstanding</th></tr></thead>
                <tbody>
                  {perProject.map((r) => (
                    <tr key={r.projectId}>
                      <td>{r.client}</td>
                      <td className="tabular">{formatRand(r.price)}</td>
                      <td className="tabular">{formatRand(r.invoiced)}</td>
                      <td className="tabular">{formatRand(r.received)}</td>
                      <td className={`tabular ${r.overdue ? "text-bad" : ""}`}>{formatRand(r.outstanding)}{r.overdue ? ` (${formatRand(r.overdue)} overdue)` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Gabriel's commission">
          {commission.rows.length === 0 ? (
            <EmptyState title="No projects closed by Gabriel.">Set "Closed by" to Gabriel on a project to calculate his commission.</EmptyState>
          ) : (
            <>
              <div className="scroll-x">
                <table className="data">
                  <thead><tr><th>Client</th><th>Sale</th><th>Rate</th><th>On sale</th><th>Retainer collected</th><th>On retainer</th><th>Total</th></tr></thead>
                  <tbody>
                    {commission.rows.map((r) => (
                      <tr key={r.projectId}>
                        <td>{r.client}</td>
                        <td className="tabular">{formatRand(r.sale)}</td>
                        <td className="tabular">{r.rate == null ? "-" : `${Math.round(r.rate * 1000) / 10}%`}</td>
                        <td className="tabular">{formatRand(r.saleCommission)}</td>
                        <td className="tabular">{formatRand(r.retainerCollected)}</td>
                        <td className="tabular">{formatRand(r.retainerCommission)}</td>
                        <td className="tabular font-medium">{formatRand(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm">Total owed: <span className="tabular font-medium">{formatRand(commission.total)}</span></p>
            </>
          )}
          <p className="mt-2 text-xs text-muted">
            Whole sale value at the tier it reaches (not marginal), plus {Math.round(s.gabrielRetainerRate * 100)}% of retainer actually collected while his engagement runs
            {s.gabrielEngagementEndOn ? ` (ends ${formatDate(s.gabrielEngagementEndOn)})` : " (no end date set in Settings)"}.
          </p>
        </Card>

        <Card title="Pro bono sunk value">
          {proBono.rows.length === 0 ? (
            <EmptyState title="No pro bono projects.">Tick "Pro bono" on a project to track its sunk value.</EmptyState>
          ) : (
            <>
              <ul className="space-y-2">
                {proBono.rows.map((r) => (
                  <li key={r.projectId} className="inset flex items-center justify-between gap-3 p-3 text-sm">
                    <span>{r.client}</span>
                    <span className="tabular text-muted">{r.hours} h × {formatRand(s.hourlyRate)} = <span className="text-ink">{formatRand(r.sunkValue)}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Shown separately and never counted as revenue. {proBono.total === 0 && "Log hours against the project on Capacity to see its value."}</p>
            </>
          )}
        </Card>

        <Card title="Running costs" action={<Button small variant="ghost" onClick={() => setEditing({ collection: "costs", id: null })}>Add cost</Button>}>
          {data.costs.length === 0 ? (
            <EmptyState title="No running costs listed.">Add subscriptions such as Claude Pro or Netlify.</EmptyState>
          ) : (
            <>
              <ul className="space-y-2">
                {data.costs.map((c) => (
                  <li key={c.id}>
                    <button className="inset flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-white/5" onClick={() => setEditing({ collection: "costs", id: c.id })}>
                      <span>{c.name}{c.quantity > 1 ? ` ×${c.quantity}` : ""}</span>
                      <span className="tabular text-muted">{c.monthlyAmount == null ? "Amount not set" : `${formatRand(c.monthlyAmount * c.quantity)}/month`}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm">Monthly total: <span className="tabular font-medium">{formatRand(monthlyCosts)}</span>{unpricedCosts ? <span className="text-muted"> ({unpricedCosts} without an amount)</span> : null}</p>
            </>
          )}
        </Card>
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.id ? "Edit" : "New"} ${titleFor[editing.collection]}` : ""}>
        {editing && (editing.id === null || editStored) && (
          <RecordForm
            key={editing.id ?? `new-${editing.collection}`}
            collection={editing.collection}
            initial={(editStored ? withoutMeta(editStored) : blank(editing.collection)) as RecordOf<"invoices" | "retainers" | "costs">}
            base={editStored ?? null}
            fields={fieldsFor[editing.collection]}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onDelete={editStored ? async () => { if (await confirmDelete(editing.collection, editStored, `this ${titleFor[editing.collection]}`)) setEditing(null); } : undefined}
          />
        )}
      </Drawer>
    </>
  );
}

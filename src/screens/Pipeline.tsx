import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FunnelChart, RateCell } from "../components/charts";
import { opts, RecordForm, useConfirmDelete, type FieldSpec } from "../components/form";
import { previewTone, SOURCE_LABEL, statusLabel, statusTone } from "../components/labels";
import { Badge, Button, Card, Drawer, EmptyState, Glass, PageHeader, Select } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { newId } from "../data/store";
import { buildDeals, funnel, matchesFilter, type Deal } from "../domain/funnel";
import { previewWindow } from "../domain/preview";
import { leadSchema, projectSchema, SOURCES, STATUSES, type Lead, type Source, type Status } from "../shared/schema";
import { CsvImport } from "./CsvImport";

export const LEAD_FIELDS: FieldSpec[] = [
  { key: "business", label: "Business", type: "text", required: true },
  { key: "niche", label: "Niche", type: "text", placeholder: "e.g. Hair salon" },
  { key: "source", label: "Source", type: "select", options: opts(SOURCES, (s) => SOURCE_LABEL[s]), allowEmpty: true },
  { key: "contact", label: "Contact", type: "text", placeholder: "Name, phone, email or handle" },
  { key: "status", label: "Status", type: "select", options: opts(STATUSES) },
  { key: "previewSentOn", label: "Preview sent on", type: "date", hint: "Starts the 14-day preview window." },
  { key: "notes", label: "Notes", type: "textarea" },
];

export function blankLead(): Lead {
  return { ...leadSchema.parse({ id: newId("l"), business: "x" }), business: "" };
}

/** Records where a deal was lost from, so the funnel knows how far it got. */
export function withLostFrom<T extends { status: Status; lostFromStatus: Status | null }>(next: T, before: { status: Status }): T {
  const lost = next.status === "Lost" || next.status === "Lost After Deposit";
  if (lost && before.status !== next.status && before.status !== "Lost" && before.status !== "Lost After Deposit") return { ...next, lostFromStatus: before.status };
  if (!lost) return { ...next, lostFromStatus: null };
  return next;
}

function DealCard({ deal, today, onOpen, onMove }: { deal: Deal; today: string; onOpen: () => void; onMove: (s: Status) => void }) {
  const w = deal.status === "Preview Sent" ? previewWindow(deal.previewSentOn, today) : null;
  return (
    <li className="inset p-3">
      <button onClick={onOpen} className="block w-full text-left">
        <p className="font-medium leading-snug">{deal.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {[deal.niche, deal.source ? SOURCE_LABEL[deal.source] : null].filter(Boolean).join(" · ") || "No niche or source"}
          {deal.kind === "project" && " · project"}
        </p>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {deal.status === "Preview Sent" && (w ? <Badge tone={previewTone[w.level]}>Day {w.day} of 14</Badge> : <Badge tone="warn">Add sent date</Badge>)}
      </div>
      <label className="mt-2 block text-xs text-muted">
        <span className="sr-only">Move {deal.name} to</span>
        <select className="field mt-1 min-h-9 py-1 text-sm" value={deal.status} onChange={(e) => onMove(e.target.value as Status)} aria-label={`Move ${deal.name} to`}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

export function PipelineScreen() {
  const { data, today, save, stored } = useData();
  const navigate = useNavigate();
  const confirmDelete = useConfirmDelete();
  const [niche, setNiche] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const deals = useMemo(() => buildDeals(data.leads, data.projects), [data.leads, data.projects]);
  const niches = useMemo(() => [...new Set(deals.map((d) => d.niche).filter((n): n is string => !!n))].sort(), [deals]);
  const filter = { niche, source };
  const shown = deals.filter((d) => matchesFilter(d, filter));
  const f = funnel(deals, filter);

  async function move(d: Deal, status: Status) {
    if (d.kind === "lead") {
      const s = stored("leads", d.id);
      if (!s) return;
      const rec = withLostFrom({ ...withoutMeta(s), status }, s);
      const r = await save("leads", rec, s);
      if (!r.ok && r.message) window.alert(r.message);
    } else {
      const s = stored("projects", d.id);
      if (!s) return;
      const r = await save("projects", withLostFrom({ ...withoutMeta(s), status }, s), s);
      if (!r.ok && r.message) window.alert(r.message);
    }
  }

  const editingLead = editing && editing !== "new" ? stored("leads", editing) : undefined;
  const linkedProject = editingLead ? data.projects.find((p) => p.leadId === editingLead.id) : undefined;

  async function convert(lead: Lead) {
    const id = newId("p");
    const project = projectSchema.parse({
      id,
      client: lead.business,
      leadId: lead.id,
      status: ["New", "Contacted", "Replied", "Preview Sent", "Lost"].includes(lead.status) ? "Deposit Paid" : lead.status,
      previewSentOn: lead.previewSentOn,
      niche: lead.niche,
      source: lead.source,
    });
    const r = await save("projects", project, null);
    if (r.ok) navigate(`/projects?open=${id}`);
    else if (r.message) window.alert(r.message);
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        sub="Every lead and project by status. Projects that came from a lead replace it here."
        action={
          <>
            <Button variant="ghost" onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button onClick={() => setEditing("new")}>Add lead</Button>
          </>
        }
      />

      <Glass className="mb-4 grid grid-cols-1 gap-3 p-4 min-[480px]:grid-cols-2 md:max-w-xl">
        <Select label="Niche" value={niche} onChange={setNiche} options={niches.map((n) => ({ value: n, label: n }))} allowEmpty emptyLabel="All niches" />
        <Select label="Source" value={source} onChange={setSource} options={opts(SOURCES, (s) => SOURCE_LABEL[s])} allowEmpty emptyLabel="All sources" />
      </Glass>

      {deals.length === 0 ? (
        <Card>
          <EmptyState title="No leads yet." action={<Button onClick={() => setEditing("new")}>Add your first lead</Button>}>
            Add a lead by hand, or use Import CSV to bring in the Lead Tracker export from Google Sheets.
          </EmptyState>
        </Card>
      ) : (
        <Glass className="p-3 sm:p-4" aria-label="Kanban board">
          <div className="scroll-x -mx-1 pb-2">
            <div className="flex gap-3 px-1">
              {STATUSES.map((s) => {
                const col = shown.filter((d) => d.status === s);
                return (
                  <section key={s} className="w-60 shrink-0" aria-label={`${s}: ${col.length}`}>
                    <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-sm">
                      <span className="truncate">{s}</span>
                      <Badge tone={statusTone(s)}>{col.length}</Badge>
                    </h2>
                    <ul className="space-y-2">
                      {col.map((d) => (
                        <DealCard key={d.id} deal={d} today={today} onOpen={() => (d.kind === "lead" ? setEditing(d.id) : navigate(`/projects?open=${d.id}`))} onMove={(st) => void move(d, st)} />
                      ))}
                      {col.length === 0 && <li className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">None</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </Glass>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Funnel">
          {f.total === 0 ? <EmptyState title="Nothing to chart yet.">The funnel fills in as leads move through the stages.</EmptyState> : <FunnelChart result={f} />}
          <p className="mt-2 text-xs text-muted">
            Bars show deals that reached each stage{niche || source ? " (filtered)" : ""}. {f.lost} lost.
          </p>
        </Card>
        <Card title="Conversion">
          <div className="inset mb-3 flex flex-wrap items-baseline justify-between gap-2 p-3">
            <span className="text-sm text-muted">Preview to deposit</span>
            <RateCell n={f.previewToDeposit.n} rate={f.previewToDeposit.rate} />
          </div>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {f.steps.map((s) => (
                  <tr key={s.from}>
                    <td>{s.from}</td>
                    <td>{s.to}</td>
                    <td>
                      <RateCell n={s.n} rate={s.rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Rates with fewer than 5 deals say "too few to read".</p>
        </Card>
      </div>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New lead" : (editingLead?.business ?? "Lead")}>
        {editing === "new" && (
          <RecordForm
            key="new"
            collection="leads"
            initial={blankLead()}
            base={null}
            fields={LEAD_FIELDS}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            submitLabel="Add lead"
          />
        )}
        {editingLead && (
          <>
            <RecordForm
              key={editingLead.id}
              collection="leads"
              initial={withoutMeta(editingLead)}
              base={editingLead}
              fields={LEAD_FIELDS}
              transform={(d, b) => withLostFrom(d, b)}
              onCancel={() => setEditing(null)}
              onDelete={async () => {
                if (await confirmDelete("leads", editingLead, editingLead.business)) setEditing(null);
              }}
            />
            <div className="inset mt-6 space-y-2 p-4 text-sm">
              <p className="font-medium">Deposit paid?</p>
              {editingLead.status === "Lost" || editingLead.status === "Lost After Deposit" ? (
                <p className="text-muted">This lead is lost. Move it back to an open status first.</p>
              ) : linkedProject ? (
                <p className="text-muted">This lead is now the project {linkedProject.client}.</p>
              ) : (
                <>
                  <p className="text-muted">Turn this lead into a project to start the build clock, invoices and revision tracking.</p>
                  <Button variant="ghost" small onClick={() => void convert(editingLead)}>
                    Create project from this lead
                  </Button>
                </>
              )}
            </div>
            <p className="mt-3 text-xs text-muted">Status: {statusLabel(editingLead.status)}</p>
          </>
        )}
      </Drawer>

      <CsvImport open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

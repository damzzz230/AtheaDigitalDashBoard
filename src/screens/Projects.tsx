import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { opts, RecordForm, useConfirmDelete, type FieldSpec } from "../components/form";
import { ACCOUNT_LABEL, PACKAGE_LABEL, PERSON_LABEL, previewTone, RETAINER_LABEL, SOURCE_LABEL, statusLabel, statusTone } from "../components/labels";
import { Badge, Button, Card, Drawer, EmptyState, Glass, PageHeader, type Tone } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { newId } from "../data/store";
import { deliveryClock } from "../domain/clock";
import { formatDate, relativeDays } from "../domain/dates";
import { followUpSchedule } from "../domain/followups";
import { balanceStatus, formatRand } from "../domain/money";
import { previewWindow } from "../domain/preview";
import { revisionState } from "../domain/revisions";
import { CLOSERS, NETLIFY_ACCOUNTS, PACKAGES, PEOPLE, projectSchema, RETAINER_DECISIONS, SOURCES, STATUSES, type Project, type Stored } from "../shared/schema";
import { withLostFrom } from "./Pipeline";

const PROJECT_FIELDS: FieldSpec[] = [
  { type: "section", label: "Basics" },
  { key: "client", label: "Client", type: "text", required: true },
  { key: "status", label: "Status", type: "select", options: opts(STATUSES) },
  { key: "package", label: "Package", type: "select", options: opts(PACKAGES, (p) => PACKAGE_LABEL[p]), allowEmpty: true },
  { key: "price", label: "Price (R, no VAT)", type: "money", hint: "Leave blank until agreed." },
  { key: "proBono", label: "Pro bono", type: "checkbox" },
  { key: "owner", label: "Owner", type: "select", options: opts(PEOPLE, (p) => PERSON_LABEL[p]), allowEmpty: true },
  { key: "closedBy", label: "Closed by", type: "select", options: opts(CLOSERS, (p) => PERSON_LABEL[p]), allowEmpty: true, hint: "Gabriel earns commission on projects he closes." },
  { key: "weeklyHoursCommitted", label: "Hours per week this build needs", type: "number", hint: "Counts toward the owner's committed hours while open." },
  { key: "niche", label: "Niche", type: "text" },
  { key: "source", label: "Source", type: "select", options: opts(SOURCES, (s) => SOURCE_LABEL[s]), allowEmpty: true },
  { type: "section", label: "Dates" },
  { key: "previewSentOn", label: "Preview sent", type: "date" },
  { key: "approvedOn", label: "Client approved", type: "date", hint: "Balance is due 7 days later." },
  { key: "depositClearedOn", label: "Deposit cleared", type: "date" },
  { key: "assetsReceivedOn", label: "Assets received", type: "date" },
  { key: "assetCutoffOn", label: "Asset cut-off", type: "date" },
  { key: "clientDelayDays", label: "Client-side delay (days)", type: "int", hint: "Pushes target and latest delivery out." },
  { key: "goLiveOn", label: "Go-live", type: "date" },
  { key: "closedOn", label: "Closed", type: "date" },
  { type: "section", label: "Handover" },
  { key: "retainerDecision", label: "Retainer decision", type: "select", options: opts(RETAINER_DECISIONS, (r) => RETAINER_LABEL[r]) },
  { key: "siteUrl", label: "Site URL", type: "text", freeText: false, placeholder: "https://example.co.za" },
  { key: "netlifyAccount", label: "Netlify account", type: "select", options: opts(NETLIFY_ACCOUNTS, (a) => ACCOUNT_LABEL[a]), allowEmpty: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

function blankProject(): Project {
  return { ...projectSchema.parse({ id: newId("p"), client: "x" }), client: "" };
}

function ClockBox({ title, tone, children }: { title: string; tone: Tone; children: React.ReactNode }) {
  return (
    <div className="inset p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge tone={tone}>{{ ok: "On track", warn: "Watch", bad: "Act now", info: "Running", neutral: "Waiting" }[tone]}</Badge>
      </div>
      <div className="mt-1 text-sm text-muted">{children}</div>
    </div>
  );
}

function ProjectDetail({ p, onClose }: { p: Stored<"projects">; onClose: () => void }) {
  const { data, today, save } = useData();
  const settings = data.settings;
  const confirmDelete = useConfirmDelete();
  const clock = deliveryClock(p, today);
  const preview = p.status === "Preview Sent" ? previewWindow(p.previewSentOn, today) : null;
  const bal = balanceStatus(p, data.invoices, today);
  const rev = revisionState(p, settings);
  const follow = p.goLiveOn ? followUpSchedule(p.goLiveOn, today) : [];

  const quickSave = async (patch: Partial<Project>) => {
    const r = await save("projects", { ...withoutMeta(p), ...patch }, p);
    if (!r.ok && r.message) window.alert(r.message);
  };

  const timeline: { label: string; date: string | null; note?: string }[] = [
    { label: "Preview sent", date: p.previewSentOn },
    { label: "Deposit cleared", date: p.depositClearedOn },
    { label: "Assets received", date: p.assetsReceivedOn },
    { label: "Asset cut-off", date: p.assetCutoffOn },
    ...(clock.started ? [{ label: "Day zero", date: clock.dayZero }, { label: "Target delivery", date: clock.target, note: clock.delayDays ? `includes ${clock.delayDays} delay days` : undefined }, { label: "Latest delivery", date: clock.latest }] : []),
    { label: "Approved", date: p.approvedOn },
    { label: "Balance due", date: bal?.dueOn ?? null },
    { label: "Go-live", date: p.goLiveOn },
    { label: "Closed", date: p.closedOn },
  ];
  const dated = timeline.filter((t) => t.date).sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : 1));
  const missing = timeline.filter((t) => !t.date && !["Balance due", "Closed"].includes(t.label));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Badge tone={statusTone(p.status)}>{statusLabel(p.status, p.proBono)}</Badge>
        {p.proBono && <Badge tone="info">Pro bono</Badge>}
        <Badge>{p.package ? PACKAGE_LABEL[p.package] : "Package not set"}</Badge>
        <Badge>{p.price != null ? formatRand(p.price) : "Price not set"}</Badge>
      </div>

      <section aria-label="Clocks" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {preview && (
          <ClockBox title="Preview window" tone={previewTone[preview.level] === "ok" ? "ok" : previewTone[preview.level]}>
            Day {preview.day} of 14. Take-down {formatDate(preview.expiresOn)}.{preview.action && <span className="block">{preview.action}</span>}
          </ClockBox>
        )}
        {p.status === "Preview Sent" && !preview && (
          <ClockBox title="Preview window" tone="neutral">
            Add the preview sent date to start the 14-day window.
          </ClockBox>
        )}
        <ClockBox title="Delivery clock" tone={!clock.started ? "neutral" : clock.level === "done" ? "ok" : clock.level === "red" ? "bad" : clock.level === "amber" ? "warn" : "info"}>
          {clock.label}
          {clock.started && !clock.delivered && (
            <span className="block">
              Target {formatDate(clock.target)} ({relativeDays(today, clock.target)}), latest {formatDate(clock.latest)}.
            </span>
          )}
        </ClockBox>
        {bal && (
          <ClockBox title="Balance" tone={bal.paid ? "ok" : bal.overdue ? "bad" : "warn"}>
            {bal.paid ? "Paid." : `${bal.invoiced ? "Invoiced" : "Not invoiced yet"}. Due ${formatDate(bal.dueOn)} (${relativeDays(today, bal.dueOn)}).`}
          </ClockBox>
        )}
        <ClockBox title="Revision rounds" tone={rev.over ? "bad" : "ok"}>
          {rev.label}
          <span className="mt-2 flex gap-2">
            <Button small variant="ghost" onClick={() => void quickSave({ revisionRoundsUsed: Math.max(0, p.revisionRoundsUsed - 1) })} aria-label="One fewer round" disabled={p.revisionRoundsUsed === 0}>
              -1
            </Button>
            <Button small variant="ghost" onClick={() => void quickSave({ revisionRoundsUsed: p.revisionRoundsUsed + 1 })} aria-label="Log a revision round">
              +1 round
            </Button>
          </span>
        </ClockBox>
        <ClockBox title="Retainer" tone={p.retainerDecision === "none" && p.status === "Delivered, Awaiting Balance" ? "warn" : p.retainerDecision === "offered" ? "warn" : "ok"}>
          {RETAINER_LABEL[p.retainerDecision]}.{p.retainerDecision === "none" && " Offer it before handover."}
        </ClockBox>
      </section>

      <section aria-labelledby="tl">
        <h3 id="tl" className="mb-2 text-sm text-accent-text">
          Timeline
        </h3>
        {dated.length === 0 ? (
          <EmptyState title="No dates yet.">Add dates in the form below as the project moves.</EmptyState>
        ) : (
          <ol className="relative ml-2 space-y-3 border-l border-line pl-4">
            {dated.map((t) => (
              <li key={t.label} className="relative">
                <span aria-hidden className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${(t.date as string) <= today ? "bg-accent-text" : "border border-accent-text bg-bg"}`} />
                <p className="text-sm">
                  <span className="tabular text-muted">{formatDate(t.date)}</span> · {t.label}
                  {t.note && <span className="text-muted"> ({t.note})</span>}
                </p>
              </li>
            ))}
          </ol>
        )}
        {missing.length > 0 && <p className="mt-2 text-xs text-muted">Not set yet: {missing.map((m) => m.label).join(", ")}.</p>}
      </section>

      {follow.length > 0 && (
        <section aria-labelledby="fu">
          <h3 id="fu" className="mb-2 text-sm text-accent-text">
            Follow-ups after go-live
          </h3>
          <ul className="space-y-2">
            {follow.map((f) => {
              const done = p.followUpsDone[f.key];
              return (
                <li key={f.key} className="inset flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {f.title} · <span className="tabular text-muted">{formatDate(f.dueOn)}</span>
                    </p>
                    <p className="text-xs text-muted">{f.detail}</p>
                  </div>
                  {done ? (
                    <Badge tone="ok">Done {formatDate(done)}</Badge>
                  ) : (
                    <Button small variant={f.dueOn <= today ? "primary" : "ghost"} onClick={() => void quickSave({ followUpsDone: { ...p.followUpsDone, [f.key]: today } })}>
                      Mark done
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="ed">
        <h3 id="ed" className="mb-2 text-sm text-accent-text">
          Edit
        </h3>
        <RecordForm
          key={p.id}
          collection="projects"
          initial={withoutMeta(p)}
          base={p}
          fields={PROJECT_FIELDS}
          transform={(d, b) => withLostFrom(d, b)}
          onDelete={async () => {
            if (await confirmDelete("projects", p, p.client)) onClose();
          }}
        />
        <p className="mt-3 text-xs text-muted">
          Last saved by {PERSON_LABEL[p.updatedBy]} on {new Date(p.updatedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}. Version {p.version}.
        </p>
      </section>
    </div>
  );
}

export function ProjectsScreen() {
  const { data, today, stored } = useData();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const openId = params.get("open");
  const open = openId ? stored("projects", openId) : undefined;
  const setOpen = (id: string | null) => setParams(id ? { open: id } : {}, { replace: true });
  const rows = [...data.projects].sort((a, b) => {
    const closed = (p: Project) => (p.status === "Closed, Paid" || p.status.startsWith("Lost") ? 1 : 0);
    return closed(a) - closed(b) || a.client.localeCompare(b.client);
  });

  return (
    <>
      <PageHeader title="Projects" sub="Builds, their clocks and revision rounds." action={<Button onClick={() => setCreating(true)}>Add project</Button>} />
      <Glass className="p-2 sm:p-4" aria-label="Projects table">
        {rows.length === 0 ? (
          <div className="p-2">
            <EmptyState title="No projects yet." action={<Button onClick={() => setCreating(true)}>Add your first project</Button>}>
              Add one here, or open a lead on Pipeline and choose "Create project from this lead" once the deposit is paid.
            </EmptyState>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Package</th>
                  <th>Owner</th>
                  <th>Clock</th>
                  <th>Revisions</th>
                  <th>Go-live</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const c = deliveryClock(p, today);
                  const rev = revisionState(p, data.settings);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}>
                      <td>
                        <button className="text-left font-medium hover:text-accent-text" onClick={() => setOpen(p.id)}>
                          {p.client}
                        </button>
                        {p.proBono && <Badge tone="info" className="ml-2">Pro bono</Badge>}
                      </td>
                      <td>
                        <Badge tone={statusTone(p.status)}>{statusLabel(p.status, p.proBono)}</Badge>
                      </td>
                      <td className="text-muted">{p.package ? PACKAGE_LABEL[p.package] : "Not set"}</td>
                      <td className="text-muted">{p.owner ? PERSON_LABEL[p.owner] : "Not set"}</td>
                      <td className="min-w-48 text-sm">{c.started ? (c.delivered ? <span className="text-muted">Delivered</span> : <span className={c.level === "red" ? "text-bad" : c.level === "amber" ? "text-warn" : ""}>{c.label}</span>) : <span className="text-muted">{c.label}</span>}</td>
                      <td className={rev.over ? "text-bad" : "text-muted"}>{rev.included == null ? `${rev.used} used` : `${rev.used} of ${rev.included}`}</td>
                      <td className="tabular whitespace-nowrap text-muted">{p.goLiveOn ? formatDate(p.goLiveOn) : "Not live"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Glass>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.client ?? "Project"} wide>
        {open && <ProjectDetail p={open} onClose={() => setOpen(null)} />}
      </Drawer>
      <Drawer open={creating} onClose={() => setCreating(false)} title="New project" wide>
        {creating && (
          <RecordForm
            collection="projects"
            initial={blankProject()}
            base={null}
            fields={PROJECT_FIELDS}
            submitLabel="Add project"
            onCancel={() => setCreating(false)}
            onSaved={(r) => {
              setCreating(false);
              setOpen(r.id);
            }}
          />
        )}
      </Drawer>
      <Card className="mt-4" title="How the clocks work">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Preview window: 14 days from sending. Amber from day 10, red on day 13, take it down on day 14. Silent after that means Lost and the client owes nothing.</li>
          <li>Day zero needs both the deposit cleared and the assets received. Target delivery is day zero + 14 days, latest + 21. Client-side delay days move both.</li>
          <li>Balance is due 7 days after approval.</li>
        </ul>
      </Card>
    </>
  );
}

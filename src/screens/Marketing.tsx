import { useState } from "react";
import { RecordForm, useConfirmDelete, type FieldSpec } from "../components/form";
import { Badge, Button, Card, Drawer, EmptyState, Glass, PageHeader, Stat } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { formatDate, mondayOf } from "../domain/dates";
import { avgDmResponseHours, marketingRows, thisWeekEntry } from "../domain/marketing";
import { marketingSchema } from "../shared/schema";

const pct = (r: number | null) => (r == null ? "-" : `${Math.round(r * 100)}%`);

export function MarketingScreen() {
  const { data, today, stored } = useData();
  const confirmDelete = useConfirmDelete();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const s = data.settings;
  const rows = marketingRows(data.marketing, s);
  const wk = thisWeekEntry(data.marketing, today);
  const dm = avgDmResponseHours(data.marketing);
  const editStored = editing && editing !== "new" ? stored("marketing", editing) : undefined;
  const thisMonday = mondayOf(today);

  const fields: FieldSpec[] = [
    { key: "weekStart", label: "Week starting (Monday)", type: "date", required: true },
    { key: "posts", label: "Posts", type: "int", hint: `Target ${s.weeklyPostTarget} a week.` },
    { key: "dmsReceived", label: "DMs received", type: "int" },
    { key: "dmReplies", label: "DM replies sent", type: "int" },
    { key: "dmAvgResponseHours", label: "Average DM response time (hours)", type: "number" },
    { key: "outreachSent", label: "Outreach sent", type: "int" },
    { key: "outreachReplies", label: "Outreach replies", type: "int" },
    { key: "previewsSent", label: "Previews sent", type: "int" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  const openWeek = () => setEditing(wk ? wk.id : "new");

  return (
    <>
      <PageHeader title="Marketing" sub="Athea's own marketing: weekly log against targets." action={<Button onClick={openWeek}>{wk ? "Update this week" : "Log this week"}</Button>} />

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <Glass featured className="p-4" aria-label="Posts this week">
          <p className="text-sm text-muted">Posts this week</p>
          <p className="tabular mt-2 text-3xl font-bold">
            {wk?.posts ?? 0} <span className="text-lg text-muted">/ {s.weeklyPostTarget}</span>
          </p>
          <p className="mt-2 text-xs text-muted">{wk ? ((wk.posts ?? 0) >= s.weeklyPostTarget ? "Target met." : `${s.weeklyPostTarget - wk.posts} to go.`) : "Nothing logged for this week yet."}</p>
        </Glass>
        <Stat label="DM response time" value={dm.hours == null ? "No data" : `${Math.round(dm.hours * 10) / 10} h`} sub={dm.weeks ? `Average over ${dm.weeks} logged week${dm.weeks === 1 ? "" : "s"}` : "Log average response hours each week"} />
        <Stat label="DM reply rate (this week)" value={wk && wk.dmsReceived > 0 ? pct(wk.dmReplies / wk.dmsReceived) : "-"} sub={wk ? `${wk.dmReplies} of ${wk.dmsReceived}` : "Not logged"} />
        <div className="inset flex flex-col p-3" aria-label="Google Analytics">
          <p className="text-xs text-muted">Website traffic</p>
          <p className="mt-1 text-xl font-semibold">GA not connected</p>
          <p className="mt-auto pt-1 text-xs text-muted">No traffic figures are shown until Google Analytics is connected. Nothing is estimated.</p>
        </div>
      </div>

      <Card title="Weekly log" className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title="No weeks logged yet." action={<Button small onClick={() => setEditing("new")}>Log the week of {formatDate(thisMonday)}</Button>}>
            Each week, record posts, DMs, outreach and previews sent.
          </EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr><th>Week of</th><th>Posts</th><th>DMs</th><th>DM replies</th><th>Response</th><th>Outreach</th><th>Replies</th><th>Previews</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setEditing(r.id)}>
                    <td className="tabular whitespace-nowrap">{formatDate(r.weekStart)}</td>
                    <td className="tabular">{r.posts} {r.metTarget ? <Badge tone="ok">met</Badge> : <Badge tone="warn">{r.postsVsTarget}</Badge>}</td>
                    <td className="tabular">{r.dmsReceived}</td>
                    <td className="tabular">{r.dmReplies} <span className="text-xs text-muted">{pct(r.dmReplyRate)}</span></td>
                    <td className="tabular">{r.dmAvgResponseHours == null ? "-" : `${r.dmAvgResponseHours} h`}</td>
                    <td className="tabular">{r.outreachSent}</td>
                    <td className="tabular">{r.outreachReplies} <span className="text-xs text-muted">{pct(r.outreachReplyRate)}</span></td>
                    <td className="tabular">{r.previewsSent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Log a week" : `Week of ${formatDate(editStored?.weekStart)}`}>
        {editing && (editing === "new" || editStored) && (
          <RecordForm
            key={editing}
            collection="marketing"
            initial={editStored ? withoutMeta(editStored) : marketingSchema.parse({ id: `w-${thisMonday}`, weekStart: thisMonday })}
            base={editStored ?? null}
            fields={fields}
            transform={(d) => ({ ...d, weekStart: d.weekStart ? mondayOf(d.weekStart) : d.weekStart, id: editStored ? d.id : `w-${d.weekStart ? mondayOf(d.weekStart) : thisMonday}` })}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onDelete={editStored ? async () => { if (await confirmDelete("marketing", editStored, "this week's log")) setEditing(null); } : undefined}
          />
        )}
      </Drawer>
    </>
  );
}

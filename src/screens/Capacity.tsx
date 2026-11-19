import { useState } from "react";
import { opts, RecordForm, useConfirmDelete, type FieldSpec } from "../components/form";
import { KIND_LABEL, PERSON_LABEL } from "../components/labels";
import { Badge, Button, Card, Drawer, EmptyState, Meter, PageHeader, Stat } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { newId } from "../data/store";
import { committedHours, loggedThisWeek, retainerUsage, weeklyCapacity } from "../domain/capacity";
import { addDays, formatDate, mondayOf } from "../domain/dates";
import { formatRand, retainerActive } from "../domain/money";
import { HOURS_KINDS, hoursSchema, PEOPLE, type Person } from "../shared/schema";

export function CapacityScreen() {
  const { data, today, user, stored } = useData();
  const confirmDelete = useConfirmDelete();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const s = data.settings;
  const cap = weeklyCapacity(s);
  const committed = committedHours(data.projects);
  const logged = loggedThisWeek(data.hours, today);
  const week = mondayOf(today);
  const activeRetainers = data.retainers.filter((r) => retainerActive(r, today));
  const clientOf = (id: string | null) => (id ? (data.projects.find((p) => p.id === id)?.client ?? "Unknown project") : "No project");

  const fields: FieldSpec[] = [
    { key: "person", label: "Who", type: "select", options: opts(PEOPLE, (p) => PERSON_LABEL[p]) },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "hours", label: "Hours", type: "number", required: true },
    { key: "kind", label: "Kind", type: "select", options: opts(HOURS_KINDS, (k) => KIND_LABEL[k]) },
    { key: "projectId", label: "Project", type: "select", options: data.projects.map((p) => ({ value: p.id, label: p.client })), allowEmpty: true, emptyLabel: "No project (admin)" },
    { key: "note", label: "Note", type: "text", wide: true },
  ];
  const editStored = editing && editing !== "new" ? stored("hours", editing) : undefined;
  const recent = [...data.hours].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);

  return (
    <>
      <PageHeader
        title="Capacity"
        sub={`Week of ${formatDate(week)} to ${formatDate(addDays(week, 6))}. Available = 5 weekdays × ${s.weekdayHoursPerPerson} h + 2 weekend days × ${s.weekendHoursMin} h (stretch: ${s.weekendHoursMax} h).`}
        action={<Button onClick={() => setEditing("new")}>Log hours</Button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PEOPLE.map((p: Person) => {
          const c = committed.byPerson[p];
          const tone = c > cap.stretch ? "bad" : c > cap.available ? "warn" : "ok";
          return (
            <Card key={p} title={PERSON_LABEL[p]}>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Available" value={`${cap.available} h`} sub={`Stretch ${cap.stretch} h`} />
                <Stat label="Committed" value={`${c} h`} tone={tone === "ok" ? undefined : tone} />
                <Stat label="Logged" value={`${logged[p]} h`} sub="This week" />
              </div>
              <div className="mt-3">
                <Meter value={c} max={cap.stretch} tone={tone} label={`${PERSON_LABEL[p]} committed ${c} of ${cap.available} hours`} />
                <p className="mt-1 text-xs text-muted">
                  {tone === "bad" ? "Over stretch capacity: move or delay a build." : tone === "warn" ? "Into stretch hours this week." : `${Math.max(0, cap.available - c)} h free at the planning figure.`}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {(committed.missingEstimate.length > 0 || committed.unassigned > 0) && (
        <Card className="mt-4" title="Open builds missing a plan">
          <ul className="space-y-1 text-sm text-muted">
            {committed.missingEstimate.map((p) => (
              <li key={p.id}>{p.client}: set "Hours per week this build needs" on the project.</li>
            ))}
            {committed.unassigned > 0 && <li>{committed.unassigned} h a week is on builds with no owner.</li>}
          </ul>
        </Card>
      )}

      <Card className="mt-4" title="Retainer hours this month">
        {activeRetainers.length === 0 ? (
          <EmptyState title="No active retainers.">{data.retainers.length ? "Retainers show here from their start date." : "Add a retainer on Money."} Each includes {s.retainer.hoursCap} h a month; unused hours don't carry over.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {activeRetainers.map((r) => {
              const u = retainerUsage(r, data.hours, today);
              return (
                <li key={r.id} className="inset p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{clientOf(r.projectId)}</span>
                    <span className="tabular">
                      {u.used} of {u.cap} h {u.over > 0 && <Badge tone="bad">{u.over} h over: quote at {formatRand(s.hourlyRate)}/h</Badge>}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Meter value={u.used} max={u.cap} tone={u.over ? "bad" : u.used / Math.max(1, u.cap) > 0.8 ? "warn" : "ok"} label={`Retainer hours ${u.used} of ${u.cap}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Log retainer work as kind "Retainer" against the client's project.</p>
      </Card>

      <Card className="mt-4" title="Hours log">
        {recent.length === 0 ? (
          <EmptyState title="No hours logged yet." action={<Button small onClick={() => setEditing("new")}>Log your first hours</Button>}>
            Log build, retainer and admin hours. Pro bono hours feed the sunk-value figure on Money.
          </EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>Date</th><th>Who</th><th>Project</th><th>Kind</th><th>Hours</th><th>Note</th></tr></thead>
              <tbody>
                {recent.map((h) => (
                  <tr key={h.id} className="clickable" onClick={() => setEditing(h.id)}>
                    <td className="tabular whitespace-nowrap">{formatDate(h.date)}</td>
                    <td>{PERSON_LABEL[h.person]}</td>
                    <td>{clientOf(h.projectId)}</td>
                    <td>{KIND_LABEL[h.kind]}</td>
                    <td className="tabular">{h.hours}</td>
                    <td className="text-muted">{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.hours.length > recent.length && <p className="mt-2 text-xs text-muted">Showing the latest 60 entries.</p>}
          </div>
        )}
      </Card>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Log hours" : "Edit hours"}>
        {editing && (editing === "new" || editStored) && (
          <RecordForm
            key={editing}
            collection="hours"
            initial={editStored ? withoutMeta(editStored) : { ...hoursSchema.parse({ id: newId("h"), person: user, date: today, hours: 1, kind: "build" }), hours: null as unknown as number }}
            base={editStored ?? null}
            fields={fields}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onDelete={editStored ? async () => { if (await confirmDelete("hours", editStored, "this entry")) setEditing(null); } : undefined}
          />
        )}
      </Drawer>
    </>
  );
}

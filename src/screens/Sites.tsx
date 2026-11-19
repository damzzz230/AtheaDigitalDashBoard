import { useState } from "react";
import { Sparkline } from "../components/charts";
import { opts, RecordForm, useConfirmDelete, type FieldSpec } from "../components/form";
import { ACCOUNT_LABEL, lightLabel, lightTone } from "../components/labels";
import { Badge, Button, Card, Drawer, EmptyState, Glass, Light, PageHeader, type Tone } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { newId } from "../data/store";
import { formTestState, siteHealth, SLOW_MS, SSL_WARN_DAYS } from "../domain/sites";
import { NETLIFY_ACCOUNTS, normaliseSiteUrl, siteSchema, type Site } from "../shared/schema";

function Owner({ label, value }: { label: string; value: boolean | null }) {
  const tone: Tone = value === true ? "ok" : value === false ? "bad" : "warn";
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <Badge tone={tone}>{value === true ? "Client owns it" : value === false ? "Not the client" : "Unknown"}</Badge>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right">{children}</span>
    </div>
  );
}

export function SitesScreen() {
  const { data, today, now, stored, store, snapshot, save } = useData();
  const confirmDelete = useConfirmDelete();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [prefill, setPrefill] = useState<Partial<Site> | null>(null);
  const live = data.sites.filter((s) => s.live);
  const notLive = data.sites.filter((s) => !s.live);
  const trackedUrls = new Set(data.sites.map((s) => s.url));
  const untracked = data.projects.filter((p) => p.siteUrl && normaliseSiteUrl(p.siteUrl) && !trackedUrls.has(normaliseSiteUrl(p.siteUrl) as string));
  const editStored = editing && editing !== "new" ? stored("sites", editing) : undefined;

  const fields: FieldSpec[] = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "url", label: "Domain", type: "text", freeText: false, required: true, placeholder: "example.co.za" },
    { key: "projectId", label: "Project", type: "select", options: data.projects.map((p) => ({ value: p.id, label: p.client })), allowEmpty: true, emptyLabel: "None (our own site)" },
    { key: "netlifyAccount", label: "Netlify account", type: "select", options: opts(NETLIFY_ACCOUNTS, (a) => ACCOUNT_LABEL[a]), allowEmpty: true },
    { key: "live", label: "Live (check every 30 minutes)", type: "checkbox" },
    { key: "lastFormTestOn", label: "Last contact-form test", type: "date", hint: "Turns amber after 30 days." },
    { key: "gscOwnerIsClient", label: "Client owns Search Console", type: "tristate" },
    { key: "gbpOwnerIsClient", label: "Client owns Business Profile", type: "tristate" },
    { key: "domainRegistrarOwner", label: "Domain registrar account owner", type: "text" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  const markFormTested = async (id: string) => {
    const s = stored("sites", id);
    if (!s) return;
    const r = await save("sites", { ...withoutMeta(s), lastFormTestOn: today }, s);
    if (!r.ok && r.message) window.alert(r.message);
  };

  return (
    <>
      <PageHeader
        title="Sites"
        sub="Live client sites and our own. A Netlify scheduled function checks each one every 30 minutes for status, response time and SSL expiry."
        action={<Button onClick={() => { setPrefill(null); setEditing("new"); }}>Add site</Button>}
      />
      {store.mode === "local" && <p className="mb-4 rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">Local dev: site checks only run on Netlify, so every light shows "Not checked yet" here.</p>}

      {untracked.length > 0 && (
        <Card className="mb-4" title="Project sites not tracked yet">
          <ul className="space-y-2">
            {untracked.map((p) => (
              <li key={p.id} className="inset flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>{p.client} · <span className="text-muted">{p.siteUrl}</span></span>
                <Button small variant="ghost" onClick={() => { setPrefill({ name: p.client, url: p.siteUrl, projectId: p.id, netlifyAccount: p.netlifyAccount }); setEditing("new"); }}>Track</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {live.length === 0 ? (
        <Card>
          <EmptyState title="No live sites tracked." action={<Button onClick={() => setEditing("new")}>Add the first site</Button>}>
            Add a site with its domain to start the 30-minute checks.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {live.map((site, i) => {
            const summary = data.siteChecks[site.id];
            const h = siteHealth(summary, today, now);
            const form = formTestState(site.lastFormTestOn, today);
            const history = (summary?.history ?? []).map((x) => ({ value: x.responseMs, ok: x.ok }));
            return (
              <Glass key={site.id} className="flex flex-col gap-3 p-4 sm:p-5" delay={i * 0.04} aria-label={site.name}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 text-lg">
                      <Light tone={lightTone[h.light]} label={lightLabel[h.light]} />
                      <span className="break-words">{site.name}</span>
                    </h2>
                    <p className="truncate text-sm text-muted">{site.url.replace(/^https?:\/\//, "")}</p>
                  </div>
                  <Badge tone={lightTone[h.light]}>{lightLabel[h.light]}</Badge>
                </div>
                {h.reasons.length > 0 && h.light !== "ok" && h.light !== "unknown" && <p className="text-xs text-muted">{h.reasons.join(". ")}.</p>}
                <div className="inset space-y-2 p-3">
                  <Row label="HTTP status">{h.httpStatus ?? "-"}</Row>
                  <Row label="Response time"><span className={h.responseMs != null && h.responseMs > SLOW_MS ? "text-warn" : ""}>{h.responseMs != null ? `${Math.round(h.responseMs)} ms` : "-"}</span></Row>
                  <Row label="SSL expires"><span className={h.sslDays != null && h.sslDays < SSL_WARN_DAYS ? "text-warn" : ""}>{h.sslDays != null ? `in ${h.sslDays} days` : "-"}</span></Row>
                  <Row label="Lighthouse (mobile)">{snapshot.pagespeedEnabled ? (summary?.lighthouse ? `${summary.lighthouse.score}/100` : "Pending") : <span className="text-muted">Off: no API key</span>}</Row>
                  <Sparkline points={history} label={`Response time trend for ${site.name}`} />
                </div>
                <div className="inset space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted">Last form test</span>
                    <span className="flex items-center gap-2">
                      <Badge tone={form.level === "ok" ? "ok" : "warn"}>{form.label}</Badge>
                    </span>
                  </div>
                  <Owner label="Search Console" value={site.gscOwnerIsClient} />
                  <Owner label="Business Profile" value={site.gbpOwnerIsClient} />
                  <Row label="Registrar owner">{site.domainRegistrarOwner || <span className="text-muted">Unknown</span>}</Row>
                  <Row label="Netlify">{site.netlifyAccount ? ACCOUNT_LABEL[site.netlifyAccount] : <span className="text-muted">Unknown</span>}{site.netlifyAccount === "personal" && <Badge tone="warn" className="ml-2">Migrate</Badge>}</Row>
                </div>
                {site.notes && <p className="text-xs text-muted">{site.notes}</p>}
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button small variant="ghost" onClick={() => void markFormTested(site.id)}>Form tested today</Button>
                  <Button small variant="subtle" onClick={() => setEditing(site.id)}>Edit</Button>
                </div>
                {summary?.latest && <p className="text-xs text-muted">Checked {new Date(summary.latest.checkedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}</p>}
              </Glass>
            );
          })}
        </div>
      )}

      {notLive.length > 0 && (
        <Card className="mt-4" title="Not live">
          <ul className="space-y-2 text-sm">
            {notLive.map((s) => (
              <li key={s.id} className="inset flex items-center justify-between p-3">
                <span>{s.name} · <span className="text-muted">{s.url}</span></span>
                <Button small variant="subtle" onClick={() => setEditing(s.id)}>Edit</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Form tests turn amber after 30 days. Ownership shows "Unknown" until you confirm it.</p>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New site" : (editStored?.name ?? "Site")}>
        {editing && (editing === "new" || editStored) && (
          <RecordForm
            key={editing}
            collection="sites"
            initial={editStored ? withoutMeta(editStored) : { ...siteSchema.parse({ id: newId("s"), name: "x", url: "example.co.za" }), name: "", url: "", ...(prefill ?? {}) }}
            base={editStored ?? null}
            fields={fields}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onDelete={editStored ? async () => { if (await confirmDelete("sites", editStored, editStored.name)) setEditing(null); } : undefined}
          />
        )}
      </Drawer>
    </>
  );
}

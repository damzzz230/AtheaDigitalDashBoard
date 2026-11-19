import { useState } from "react";
import { PACKAGE_LABEL, PERSON_LABEL } from "../components/labels";
import { Badge, Button, Card, DateInput, NumberInput, PageHeader, TextArea } from "../components/ui";
import { useData, withoutMeta } from "../data/DataContext";
import { USER_KEY } from "../data/keys";
import { formatRand } from "../domain/money";
import { defaultSettings } from "../shared/defaults";
import { PACKAGES, type Settings } from "../shared/schema";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const { data, stored, save, snapshot, today, user, store, refresh } = useData();
  const base = stored("settings", "settings");
  const [draft, setDraft] = useState<Settings>(() => (base ? withoutMeta(base) : defaultSettings()) as Settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(base?.version ?? 0);
  const changedElsewhere = (base?.version ?? 0) !== baseVersion;

  const set = (fn: (s: Settings) => Settings) => setDraft((d) => fn(structuredClone(d)));

  /** Saves the whole draft against the version it was loaded from, so a concurrent change always prompts. */
  async function persist(next: Settings) {
    setMsg(null);
    const r = await save("settings", next, base ? { ...base, version: baseVersion } : null);
    if (r.ok) {
      const v = (r.record as { version: number }).version;
      setBaseVersion(v);
      setDraft(next);
      setErrors({});
      setMsg("Settings saved.");
    } else {
      setErrors(r.issues);
      setMsg(r.message ?? "Not saved.");
    }
  }

  /** Clears one Unconfirmed flag on the latest stored settings, leaving any unsaved edits in the form alone. */
  async function confirmFlag(key: keyof Settings["unconfirmed"]) {
    setMsg(null);
    const latest = base ? (withoutMeta(base) as Settings) : defaultSettings();
    const draftWasClean = !base || (baseVersion === base.version && JSON.stringify(draft) === JSON.stringify(latest));
    const r = await save("settings", { ...latest, unconfirmed: { ...latest.unconfirmed, [key]: false } }, base ?? null);
    if (!r.ok) return setMsg(r.message ?? "Not saved.");
    const rec = r.record as unknown as Settings & { version: number };
    setDraft((d) => ({ ...d, unconfirmed: { ...d.unconfirmed, [key]: false } }));
    if (draftWasClean) setBaseVersion(rec.version);
    setMsg("Confirmed.");
  }

  const unconfirmed = [
    draft.unconfirmed.weekendHours && {
      key: "weekendHours" as const,
      title: "Weekend hours per person",
      detail: `Assumed ${draft.weekendHoursMin} h minimum and ${draft.weekendHoursMax} h maximum per weekend day, per person. Planning uses the minimum.`,
    },
    draft.unconfirmed.mrrTarget && {
      key: "mrrTarget" as const,
      title: "MRR target",
      detail: draft.mrrTarget == null ? "Blank until you set it. MRR shows with no target." : `Set to ${formatRand(draft.mrrTarget)}, not yet confirmed.`,
    },
  ].filter(Boolean) as { key: keyof Settings["unconfirmed"]; title: string; detail: string }[];

  const exportJson = () => {
    const payload = { exportedAt: new Date().toISOString(), exportedBy: user, collections: snapshot.collections };
    download(`athea-dashboard-backup-${today}.json`, JSON.stringify(payload, null, 2));
  };

  return (
    <>
      <PageHeader title="Settings" sub="Confirmed on 19 Nov 2026 unless marked Unconfirmed. Everything here is editable." />

      <Card title={<span className="flex items-center gap-2">Needs a decision {unconfirmed.length > 0 && <Badge tone="warn">{unconfirmed.length}</Badge>}</span>} className="glass-featured">
        {unconfirmed.length === 0 ? (
          <p className="text-sm text-muted">Every setting is confirmed.</p>
        ) : (
          <ul className="space-y-3">
            {unconfirmed.map((u) => (
              <li key={u.key} className="inset flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {u.title} <Badge tone="warn">Unconfirmed</Badge>
                  </p>
                  <p className="text-sm text-muted">{u.detail}</p>
                </div>
                <Button small variant="ghost" onClick={() => void confirmFlag(u.key)}>
                  Confirm as shown
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void persist(draft);
        }}
      >
        <Card title="Packages">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PACKAGES.map((p) => (
              <div key={p} className="inset space-y-3 p-3">
                <p className="font-medium">{PACKAGE_LABEL[p]}</p>
                <NumberInput label="Price (R, once-off)" value={draft.packages[p].price} onChange={(v) => set((s) => ((s.packages[p].price = v), s))} hint={p === "custom" ? "Quoted per project; leave blank." : undefined} />
                <NumberInput label="Max pages" step="1" value={draft.packages[p].maxPages} onChange={(v) => set((s) => ((s.packages[p].maxPages = v), s))} />
                <NumberInput label="Revision rounds included" step="1" value={draft.packages[p].revisionRounds} onChange={(v) => set((s) => ((s.packages[p].revisionRounds = v), s))} hint={p === "custom" ? "Blank means as quoted." : undefined} />
                <TextArea label="Description" value={draft.packages[p].description} onChange={(v) => set((s) => ((s.packages[p].description = v), s))} />
              </div>
            ))}
          </div>
          {errors.packages && <p className="mt-2 text-sm text-bad">{errors.packages}</p>}
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Retainer and rates">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput label="Retainer price (R/month)" value={draft.retainer.monthlyPrice} onChange={(v) => set((s) => ((s.retainer.monthlyPrice = v), s))} />
              <NumberInput label="Retainer hours per month" value={draft.retainer.hoursCap} onChange={(v) => set((s) => ((s.retainer.hoursCap = v ?? 0), s))} hint="Unused hours don't carry over." />
              <NumberInput label="Notice (months)" step="1" value={draft.retainer.noticeMonths} onChange={(v) => set((s) => ((s.retainer.noticeMonths = v ?? 0), s))} />
              <NumberInput label="Hourly rate (R)" value={draft.hourlyRate} onChange={(v) => set((s) => ((s.hourlyRate = v ?? 0), s))} hint="Extra work, over-cap retainer hours and pro bono value." />
            </div>
          </Card>

          <Card title="Hours and targets">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput label="Weekday hours per person" value={draft.weekdayHoursPerPerson} onChange={(v) => set((s) => ((s.weekdayHoursPerPerson = v ?? 0), s))} />
              <NumberInput label="Weekly post target" step="1" value={draft.weeklyPostTarget} onChange={(v) => set((s) => ((s.weeklyPostTarget = v ?? 0), s))} />
              <NumberInput label="Weekend hours per day, minimum" value={draft.weekendHoursMin} onChange={(v) => set((s) => ((s.weekendHoursMin = v ?? 0), s))} hint="Used for planning." />
              <NumberInput label="Weekend hours per day, maximum" value={draft.weekendHoursMax} onChange={(v) => set((s) => ((s.weekendHoursMax = v ?? 0), s))} hint="Shown as stretch capacity." />
              <NumberInput label="MRR target (R/month)" value={draft.mrrTarget} onChange={(v) => set((s) => ((s.mrrTarget = v), s))} hint="Blank until decided." />
            </div>
          </Card>
        </div>

        <Card title="Gabriel's commission">
          <p className="mb-3 text-sm text-muted">The whole sale value earns the rate of the highest tier it reaches. Not marginal.</p>
          <div className="space-y-2">
            {draft.commissionTiers.map((t, i) => (
              <div key={i} className="inset grid grid-cols-[1fr_1fr_auto] items-end gap-2 p-3">
                <NumberInput label="From sale value (R)" value={t.minSale} onChange={(v) => set((s) => ((s.commissionTiers[i].minSale = v ?? 0), s))} />
                <NumberInput label="Rate (%)" value={Math.round(t.rate * 1000) / 10} onChange={(v) => set((s) => ((s.commissionTiers[i].rate = (v ?? 0) / 100), s))} />
                <Button small variant="danger" disabled={draft.commissionTiers.length === 1} onClick={() => set((s) => (s.commissionTiers.splice(i, 1), s))} aria-label={`Remove tier ${i + 1}`}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button small variant="ghost" className="mt-2" onClick={() => set((s) => (s.commissionTiers.push({ minSale: (s.commissionTiers.at(-1)?.minSale ?? 0) + 5000, rate: s.commissionTiers.at(-1)?.rate ?? 0.1 }), s))}>
            Add tier
          </Button>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberInput label="Retainer commission (%)" value={Math.round(draft.gabrielRetainerRate * 1000) / 10} onChange={(v) => set((s) => ((s.gabrielRetainerRate = (v ?? 0) / 100), s))} />
            <DateInput label="Engagement start" value={draft.gabrielEngagementStartOn} onChange={(v) => set((s) => ((s.gabrielEngagementStartOn = v), s))} />
            <DateInput label="Engagement end" value={draft.gabrielEngagementEndOn} onChange={(v) => set((s) => ((s.gabrielEngagementEndOn = v), s))} hint="Retainer commission stops after this date." />
          </div>
          {errors.commissionTiers && <p className="mt-2 text-sm text-bad">{errors.commissionTiers}</p>}
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Save settings</Button>
          {msg && <p className={msg === "Settings saved." || msg === "Confirmed." ? "text-sm text-ok" : "text-sm text-bad"} role="status">{msg}</p>}
          {changedElsewhere && (
            <p className="text-sm text-warn">
              Settings were changed elsewhere. Saving will ask before overwriting.{" "}
              <button type="button" className="underline" onClick={() => { if (base) { setDraft(withoutMeta(base) as Settings); setBaseVersion(base.version); } }}>Load latest</button>
            </p>
          )}
        </div>
      </form>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Backup">
          <p className="mb-3 text-sm text-muted">Download every record as JSON. Keep it somewhere private. {store.mode === "remote" && "The server also keeps 14 daily snapshots."}</p>
          <Button variant="ghost" onClick={exportJson}>Export JSON backup</Button>
          <p className="mt-2 text-xs text-muted">{Object.values(snapshot.collections).reduce((n, c) => n + Object.keys(c).length, 0)} records.</p>
        </Card>
        <Card title="Account">
          <p className="text-sm text-muted">Signed in as <span className="text-ink">{PERSON_LABEL[user]}</span>.</p>
          {store.mode === "remote" ? (
            <Button variant="ghost" className="mt-3" onClick={onLogout}>Sign out</Button>
          ) : (
            <DevTools refresh={refresh} today={today} count={data.leads.length} />
          )}
        </Card>
      </div>
    </>
  );
}

function DevTools({ refresh, today, count }: { refresh: () => Promise<void>; today: string; count: number }) {
  const [busy, setBusy] = useState(false);
  if (!import.meta.env.DEV) return null;
  const current = window.localStorage.getItem(USER_KEY) === "das" ? "das" : "damz";
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-warn/40 p-3">
      <p className="text-sm font-medium text-warn">Dev only. Local browser storage, not the real data.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          small
          variant="ghost"
          onClick={() => {
            window.localStorage.setItem(USER_KEY, current === "das" ? "damz" : "das");
            void refresh();
          }}
        >
          Act as {current === "das" ? "Damz" : "Das"}
        </Button>
        <Button
          small
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Replace local dev data with SAMPLE data? SAMPLE records are fake and live only in this browser.")) return;
            setBusy(true);
            const [{ sampleCollections }, { LocalStorageAdapter }] = await Promise.all([import("../data/sample"), import("../data/localAdapter")]);
            new LocalStorageAdapter(window.localStorage).replaceAll(sampleCollections(today, new Date().toISOString()));
            await refresh();
            setBusy(false);
          }}
        >
          Load SAMPLE data
        </Button>
        <Button
          small
          variant="danger"
          onClick={async () => {
            if (!window.confirm("Reset local dev data to the confirmed seed?")) return;
            const { LocalStorageAdapter } = await import("../data/localAdapter");
            new LocalStorageAdapter(window.localStorage).reset();
            await refresh();
          }}
        >
          Reset to seed
        </Button>
      </div>
      <p className="text-xs text-muted">{count} leads in local storage.</p>
    </div>
  );
}

import { Link } from "react-router-dom";
import { needsAction, type ActionItem, type Severity } from "../domain/actions";
import { diffDays, formatDate, relativeDays } from "../domain/dates";
import { formatRand } from "../domain/money";
import { kpis, summarySentence } from "../domain/summary";
import { severityTone } from "../components/labels";
import { Badge, Card, EmptyState, Glass, Meter, PageHeader } from "../components/ui";
import { useData } from "../data/DataContext";

const SCREEN_PATH: Record<ActionItem["screen"], string> = {
  today: "/",
  pipeline: "/pipeline",
  projects: "/projects",
  money: "/money",
  capacity: "/capacity",
  sites: "/sites",
  marketing: "/marketing",
  settings: "/settings",
};

const GROUPS: { key: Severity; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "due", label: "Due this week" },
  { key: "undated", label: "Needs doing, no date" },
  { key: "later", label: "Later" },
];

function Kpi({ label, value, sub, featured, delay, meter }: { label: string; value: string; sub: string; featured?: boolean; delay: number; meter?: { value: number; max: number; tone: "ok" | "warn" | "bad" | "info" } }) {
  return (
    <Glass featured={featured} delay={delay} className="flex min-h-32 flex-col p-3.5 sm:min-h-36 sm:p-5" aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted sm:text-sm">{label}</p>
        {featured && <Badge tone="info" className="hidden min-[480px]:inline-flex">Top line</Badge>}
      </div>
      <p className="tabular mt-2 text-2xl font-bold leading-none sm:text-4xl">{value}</p>
      <p className="mt-auto pt-3 text-xs text-muted">{sub}</p>
      {meter && (
        <div className="mt-2">
          <Meter {...meter} label={`${label}: ${value}`} />
        </div>
      )}
    </Glass>
  );
}

export function TodayScreen() {
  const { data, today, now } = useData();
  const k = kpis(data, today, now);
  const actions = needsAction(data, today, now);
  const sentence = summarySentence(actions, k);
  const hoursTone = k.hours.committed > k.hours.stretch ? "bad" : k.hours.committed > k.hours.available ? "warn" : "ok";

  return (
    <>
      <PageHeader title="Today" sub={sentence} />
      <p className="-mt-3 mb-5 text-xs text-muted">{formatDate(today)}, Johannesburg</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          featured
          delay={0}
          label="Open pipeline"
          value={String(k.openPipeline.count)}
          sub={k.openPipeline.count === 0 ? "No open deals. Add a lead on Pipeline." : k.openPipeline.value > 0 ? `${formatRand(k.openPipeline.value)} priced, ${k.openPipeline.unpriced} unpriced` : "No prices recorded yet"}
        />
        <Kpi
          delay={0.04}
          label="Previews awaiting decision"
          value={String(k.previews.count)}
          sub={k.previews.count === 0 ? "No previews out" : k.previews.oldestDay != null ? `Oldest is on day ${k.previews.oldestDay} of 14${k.previews.undated ? `; ${k.previews.undated} without a sent date` : ""}` : `${k.previews.undated} without a sent date`}
        />
        <Kpi delay={0.08} label="Outstanding" value={formatRand(k.outstanding.amount)} sub={k.outstanding.overdue > 0 ? `${formatRand(k.outstanding.overdue)} of it overdue` : "Nothing overdue"} />
        <Kpi
          delay={0.12}
          label="MRR vs target"
          value={formatRand(k.mrr.total)}
          sub={`${k.mrr.target == null ? "No target set" : `Target ${formatRand(k.mrr.target)}`} · ${k.mrr.active} active${k.mrr.scheduled ? `, ${k.mrr.scheduled} starting soon` : ""}${k.mrr.unpriced ? `, ${k.mrr.unpriced} unpriced` : ""}`}
          meter={k.mrr.target ? { value: k.mrr.total, max: k.mrr.target, tone: k.mrr.total >= k.mrr.target ? "ok" : "info" } : undefined}
        />
        <Kpi
          delay={0.16}
          label="Hours this week"
          value={`${k.hours.committed} / ${k.hours.available} h`}
          sub={`Committed on open builds vs available for both of you. Stretch ${k.hours.stretch} h.${k.hours.missingEstimate ? ` ${k.hours.missingEstimate} build(s) without an estimate.` : ""}`}
          meter={{ value: k.hours.committed, max: k.hours.available, tone: hoursTone }}
        />
        <Kpi
          delay={0.2}
          label="Sites unhealthy"
          value={`${k.sites.unhealthy} / ${k.sites.total}`}
          sub={k.sites.total === 0 ? "No live sites tracked" : k.sites.unchecked ? `${k.sites.unchecked} not checked yet` : k.sites.attention ? `${k.sites.attention} slow, stale or SSL expiring soon` : "Checked every 30 minutes"}
        />
      </div>

      <Card title="Needs action" className="mt-5" delay={0.24}>
        {actions.length === 0 ? (
          <EmptyState title="Nothing needs action.">Items appear here when previews, builds, invoices, follow-ups or sites need you.</EmptyState>
        ) : (
          <div className="space-y-5">
            {GROUPS.map((g) => {
              const items = actions.filter((a) => a.severity === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm">
                    {g.label} <Badge tone={severityTone[g.key]}>{items.length}</Badge>
                  </h3>
                  <ul className="space-y-2">
                    {items.map((a) => (
                      <li key={a.id}>
                        <Link to={SCREEN_PATH[a.screen]} className="inset flex flex-col gap-1 p-3 transition-colors hover:bg-white/5 sm:flex-row sm:items-center sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{a.title}</p>
                            <p className="text-sm text-muted">{a.detail}</p>
                          </div>
                          {a.dueOn && (
                            <span className="shrink-0 text-sm">
                              <Badge tone={severityTone[a.severity]}>{a.severity === "overdue" ? `${diffDays(a.dueOn, today)} days overdue` : relativeDays(today, a.dueOn)}</Badge>
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

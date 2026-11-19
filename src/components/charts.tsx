import type { FunnelResult } from "../domain/funnel";
import { formatRate } from "../domain/funnel";

/** Response-time sparkline. Failed checks show as red ticks on the baseline. */
export function Sparkline({ points, label, width = 160, height = 36 }: { points: { value: number | null; ok: boolean }[]; label: string; width?: number; height?: number }) {
  if (points.length < 2) {
    return <p className="text-xs text-muted">Not enough checks yet for a trend.</p>;
  }
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const max = Math.max(1, ...vals);
  const min = Math.min(...vals, max);
  const span = Math.max(1, max - min);
  const step = width / (points.length - 1);
  const pad = 3;
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  let d = "";
  points.forEach((p, i) => {
    if (p.value == null) return;
    d += `${d === "" || points[i - 1]?.value == null ? "M" : "L"}${(i * step).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label} className="block max-w-[220px]">
      <path d={d} fill="none" stroke="var(--accent-text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {points.map((p, i) => (!p.ok ? <rect key={i} x={i * step - 1} y={height - 6} width="2" height="6" fill="var(--bad)" /> : null))}
      {last.value != null && <circle cx={(points.length - 1) * step} cy={y(last.value)} r="2.5" fill="var(--accent-text)" />}
    </svg>
  );
}

const SHORT: Record<string, string> = {
  New: "New",
  Contacted: "Contacted",
  Replied: "Replied",
  "Preview Sent": "Preview sent",
  "Deposit Paid": "Deposit paid",
  "In Build": "In build",
  "Delivered, Awaiting Balance": "Delivered",
  "Closed, Paid": "Closed, paid",
};

/** Horizontal funnel: bar length = deals that reached each stage. */
export function FunnelChart({ result }: { result: FunnelResult }) {
  const max = Math.max(1, result.stages[0]?.reached ?? 0);
  const rowH = 30;
  const labelW = 104;
  const width = 520;
  const barMax = width - labelW - 44;
  const height = result.stages.length * rowH;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Pipeline funnel: deals that reached each stage" className="block">
      <defs>
        <linearGradient id="fbar" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent-strong)" />
          <stop offset="1" stopColor="var(--accent-text)" />
        </linearGradient>
      </defs>
      {result.stages.map((s, i) => {
        const w = Math.max(2, (s.reached / max) * barMax);
        const yy = i * rowH;
        return (
          <g key={s.status}>
            <text x={labelW - 8} y={yy + rowH / 2 + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
              {SHORT[s.status] ?? s.status}
            </text>
            <rect x={labelW + (barMax - w) / 2} y={yy + 5} width={w} height={rowH - 10} rx="6" fill="url(#fbar)" opacity={s.reached ? 0.9 : 0.25} />
            <text x={width - 4} y={yy + rowH / 2 + 4} textAnchor="end" fontSize="12" fill="var(--text)" className="tabular">
              {s.reached}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function RateCell({ n, rate }: { n: number; rate: number | null }) {
  return (
    <span className="tabular whitespace-nowrap">
      <span className={rate == null ? "text-muted" : "text-ink"}>{formatRate({ n, converted: 0, rate })}</span>
      <span className="ml-1 text-xs text-muted">n={n}</span>
    </span>
  );
}

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { SENSITIVE_HINT } from "../shared/sensitive";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

let firstLoadDone = false;
/** Entrance motion runs on the first load only, and never with prefers-reduced-motion. */
export function useEntrance(delay = 0) {
  const reduce = useReducedMotion();
  const first = useRef(!firstLoadDone);
  useEffect(() => {
    const t = setTimeout(() => (firstLoadDone = true), 900);
    return () => clearTimeout(t);
  }, []);
  if (reduce || !first.current) return { initial: false as const };
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
  };
}

export function Glass({
  children,
  className,
  featured,
  as = "section",
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  featured?: boolean;
  as?: "section" | "div" | "article" | "li";
  delay?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const motionProps = useEntrance(delay);
  const Comp = motion[as];
  return (
    <Comp {...motionProps} {...rest} className={cx("glass", featured && "glass-featured", className)}>
      {children}
    </Comp>
  );
}

export function Card({ title, action, children, className, delay, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; delay?: number; id?: string }) {
  const hid = useId();
  return (
    <Glass className={cx("p-4 sm:p-5", className)} delay={delay} aria-labelledby={title ? hid : undefined}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2" id={id}>
          {title && (
            <h2 id={hid} className="text-base sm:text-lg">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </Glass>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  ok: "text-ok border-ok/40 bg-ok/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  bad: "text-bad border-bad/40 bg-bad/10",
  info: "text-accent-text border-accent-text/40 bg-accent-text/10",
  neutral: "text-muted border-line bg-white/5",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}>{children}</span>;
}

export function Light({ tone, label }: { tone: Tone; label: string }) {
  const color = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-accent-text", neutral: "bg-muted/50" }[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cx("inline-block h-2.5 w-2.5 rounded-full", color, tone !== "neutral" && "shadow-[0_0_10px_currentColor]")} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
  small,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  small?: boolean;
  "aria-label"?: string;
}) {
  const v = {
    primary: "bg-accent-strong text-white hover:bg-[#12867c] shadow-[0_6px_20px_-8px_rgba(26,168,150,.7)]",
    ghost: "border border-line text-ink hover:bg-white/5",
    subtle: "text-accent-text hover:bg-accent-text/10",
    danger: "border border-bad/50 text-bad hover:bg-bad/10",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", small ? "min-h-9 px-3 text-sm" : "min-h-11 px-4", v, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="inset flex flex-col items-start gap-2 p-4 text-sm">
      <p className="font-medium text-ink">{title}</p>
      <div className="text-muted">{children}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="inset p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx("tabular mt-1 text-xl font-semibold", tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Meter({ value, max, tone = "info", label }: { value: number; max: number; tone?: Tone; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--accent-text)", neutral: "var(--muted)" }[tone];
  return (
    <svg className="block h-2 w-full" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={label}>
      <rect x="0" y="0" width="100" height="4" rx="2" fill="rgba(255,255,255,.08)" />
      <rect x="0" y="0" width={pct} height="4" rx="2" fill={color} />
    </svg>
  );
}

/* ---------- Form fields ---------- */

interface FieldBase {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

function FieldShell({ id, label, error, hint, required, className, children }: FieldBase & { id: string; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm text-muted">
        {label}
        {required && <span className="text-bad"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ value, onChange, freeText = true, type = "text", placeholder, ...f }: FieldBase & { value: string; onChange: (v: string) => void; freeText?: boolean; type?: string; placeholder?: string }) {
  const id = useId();
  const hint = f.hint ?? (freeText ? SENSITIVE_HINT : undefined);
  return (
    <FieldShell id={id} {...f} hint={hint}>
      <input id={id} className="field" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!f.error} aria-describedby={f.error ? `${id}-err` : hint ? `${id}-hint` : undefined} />
    </FieldShell>
  );
}

export function TextArea({ value, onChange, rows = 3, ...f }: FieldBase & { value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId();
  const hint = f.hint ?? SENSITIVE_HINT;
  return (
    <FieldShell id={id} {...f} hint={hint}>
      <textarea id={id} rows={rows} className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!f.error} aria-describedby={f.error ? `${id}-err` : `${id}-hint`} />
    </FieldShell>
  );
}

export function NumberInput({ value, onChange, step = "any", min = 0, ...f }: FieldBase & { value: number | null; onChange: (v: number | null) => void; step?: string; min?: number }) {
  const id = useId();
  return (
    <FieldShell id={id} {...f}>
      <input
        id={id}
        className="field tabular"
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        aria-invalid={!!f.error}
        aria-describedby={f.error ? `${id}-err` : f.hint ? `${id}-hint` : undefined}
      />
    </FieldShell>
  );
}

export function DateInput({ value, onChange, ...f }: FieldBase & { value: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  return (
    <FieldShell id={id} {...f}>
      <input id={id} className="field" type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-invalid={!!f.error} aria-describedby={f.error ? `${id}-err` : f.hint ? `${id}-hint` : undefined} />
    </FieldShell>
  );
}

export function Select<T extends string>({ value, onChange, options, allowEmpty, emptyLabel = "Not set", ...f }: FieldBase & { value: T | null; onChange: (v: T | null) => void; options: readonly { value: T; label: string }[]; allowEmpty?: boolean; emptyLabel?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} {...f}>
      <select id={id} className="field" value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as T | null)} aria-invalid={!!f.error}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input id={id} type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Yes / No / Unknown, for facts we may not know yet. */
export function TriState({ value, onChange, ...f }: FieldBase & { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <Select
      {...f}
      value={value == null ? null : value ? "yes" : "no"}
      onChange={(v) => onChange(v == null ? null : v === "yes")}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      allowEmpty
      emptyLabel="Unknown"
    />
  );
}

/* ---------- Overlays ---------- */

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const hid = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.button
            aria-label="Close"
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
          />
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={hid}
            className={cx("overlay-panel relative flex h-full w-full flex-col border-l border-line shadow-2xl outline-none", wide ? "md:max-w-3xl" : "md:max-w-xl")}
            initial={reduce ? false : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? undefined : { x: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
              <h2 id={hid} className="truncate text-lg">
                {title}
              </h2>
              <Button variant="ghost" small onClick={onClose} aria-label="Close panel">
                Close
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const hid = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={hid} className="overlay-panel relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line p-5 outline-none sm:max-w-2xl sm:rounded-2xl">
        <h2 id={hid} className="mb-3 text-lg">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  const m = useEntrance();
  return (
    <motion.header {...m} className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-muted sm:text-base">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </motion.header>
  );
}

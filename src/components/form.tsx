import { useState, type ReactNode } from "react";
import { useData } from "../data/DataContext";
import type { CollectionName, Meta, RecordOf, Stored } from "../shared/schema";
import { containsSensitive, SENSITIVE_ERROR } from "../shared/sensitive";
import { Button, Checkbox, cx, DateInput, NumberInput, Select, TextArea, TextInput, TriState } from "./ui";

type Opt = readonly { value: string; label: string }[];

export type FieldSpec =
  | { type: "section"; label: string }
  | { key: string; label: string; type: "text" | "textarea"; required?: boolean; freeText?: boolean; hint?: string; placeholder?: string; wide?: boolean }
  | { key: string; label: string; type: "number" | "money" | "int"; hint?: string; required?: boolean }
  | { key: string; label: string; type: "date"; hint?: string; required?: boolean }
  | { key: string; label: string; type: "select"; options: Opt; allowEmpty?: boolean; emptyLabel?: string; hint?: string; required?: boolean }
  | { key: string; label: string; type: "checkbox" }
  | { key: string; label: string; type: "tristate"; hint?: string };

export function RecordForm<C extends CollectionName>({
  collection,
  initial,
  base,
  fields,
  onSaved,
  onCancel,
  onDelete,
  transform,
  submitLabel = "Save",
  footer,
}: {
  collection: C;
  initial: RecordOf<C>;
  base: (Meta & { id: string }) | null;
  fields: FieldSpec[];
  onSaved?: (r: Stored<C>) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  transform?: (draft: RecordOf<C>, before: RecordOf<C>) => RecordOf<C>;
  submitLabel?: string;
  footer?: ReactNode;
}) {
  const { save } = useData();
  const [draft, setDraft] = useState<Record<string, unknown>>(initial as unknown as Record<string, unknown>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The version this draft was based on, frozen when the form opened. Background refreshes update
  // `base` but never this, so a save after someone else changed the record always conflicts.
  const [frozenBase, setFrozenBase] = useState(base);
  const changedElsewhere = !!base && !!frozenBase && base.version !== frozenBase.version;

  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "section") continue;
      const v = draft[f.key];
      if ((f.type === "text" || f.type === "textarea") && typeof v === "string" && f.freeText !== false && containsSensitive(v)) errs[f.key] = SENSITIVE_ERROR;
      if ("required" in f && f.required && (v == null || v === "")) errs[f.key] = `${f.label} is required`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setMessage(null);
    const rec = transform ? transform(draft as unknown as RecordOf<C>, initial) : (draft as unknown as RecordOf<C>);
    const r = await save(collection, rec, frozenBase);
    setSaving(false);
    if (r.ok) {
      if (r.record) setFrozenBase(r.record);
      onSaved?.(r.record as unknown as Stored<C>);
      setMessage("Saved.");
    } else {
      setErrors(r.issues);
      setMessage(r.message ?? "Not saved.");
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      {changedElsewhere && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 p-3 text-sm text-warn sm:col-span-2" role="status">
          <span className="flex-1">This record changed since you opened it. Saving will ask before overwriting.</span>
          <Button
            small
            variant="ghost"
            onClick={() => {
              setDraft(initial as unknown as Record<string, unknown>);
              setFrozenBase(base);
              setErrors({});
              setMessage(null);
            }}
          >
            Load latest (discard my edits)
          </Button>
        </div>
      )}
      {fields.map((f, i) => {
        if (f.type === "section") {
          return (
            <h3 key={`s${i}`} className="pt-2 text-sm text-accent-text sm:col-span-2">
              {f.label}
            </h3>
          );
        }
        const v = draft[f.key];
        const common = { label: f.label, error: errors[f.key], hint: "hint" in f ? f.hint : undefined, required: "required" in f ? f.required : undefined };
        switch (f.type) {
          case "text":
            return <TextInput key={f.key} className={cx(f.wide && "sm:col-span-2")} {...common} freeText={f.freeText !== false} placeholder={f.placeholder} value={(v as string) ?? ""} onChange={(x) => set(f.key, x)} />;
          case "textarea":
            return <TextArea key={f.key} className="sm:col-span-2" {...common} value={(v as string) ?? ""} onChange={(x) => set(f.key, x)} />;
          case "number":
          case "money":
          case "int":
            return <NumberInput key={f.key} {...common} step={f.type === "int" ? "1" : f.type === "money" ? "0.01" : "0.25"} value={(v as number | null) ?? null} onChange={(x) => set(f.key, f.type === "int" ? (x == null ? 0 : Math.round(x)) : x)} />;
          case "date":
            return <DateInput key={f.key} {...common} value={(v as string | null) ?? null} onChange={(x) => set(f.key, x)} />;
          case "select":
            return <Select key={f.key} {...common} options={f.options} allowEmpty={f.allowEmpty} emptyLabel={f.emptyLabel} value={(v as string | null) ?? null} onChange={(x) => set(f.key, x)} />;
          case "checkbox":
            return (
              <div key={f.key} className="flex items-end">
                <Checkbox label={f.label} checked={!!v} onChange={(x) => set(f.key, x)} />
              </div>
            );
          case "tristate":
            return <TriState key={f.key} {...common} value={(v as boolean | null) ?? null} onChange={(x) => set(f.key, x)} />;
        }
        return null;
      })}
      {errors._ && <p className="text-sm text-bad sm:col-span-2">{errors._}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-2 sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" onClick={onDelete} className="ml-auto">
            Delete
          </Button>
        )}
        {message && (
          <p className={cx("w-full text-sm", message === "Saved." ? "text-ok" : "text-bad")} role="status">
            {message}
          </p>
        )}
      </div>
      {footer}
    </form>
  );
}

export const opts = <T extends string>(values: readonly T[], label: (v: T) => string = (v) => v) => values.map((v) => ({ value: v, label: label(v) }));

export function useConfirmDelete() {
  const { remove } = useData();
  return async (collection: CollectionName, base: Meta & { id: string }, what: string) => {
    if (!window.confirm(`Delete ${what}? This can't be undone.`)) return false;
    const r = await remove(collection, base);
    if (!r.ok && r.message) window.alert(r.message);
    return r.ok;
  };
}

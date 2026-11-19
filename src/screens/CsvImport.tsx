import { useMemo, useState } from "react";
import { SOURCE_LABEL } from "../components/labels";
import { Badge, Button, Modal, Select } from "../components/ui";
import { useData } from "../data/DataContext";
import { newId } from "../data/store";
import { buildImport, FIELD_LABELS, guessMapping, IMPORT_FIELDS, parseCsv, type ImportField, type Mapping } from "../domain/csv";

const MAX_BYTES = 2_000_000;

/** Lead Tracker import: pick the Google Sheets CSV export, map columns, preview, then commit. Nothing leaves the browser until commit. */
export function CsvImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, bulkCreateLeads } = useData();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [step, setStep] = useState<"pick" | "map" | "preview" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = rows?.[0] ?? [];
  const preview = useMemo(() => (rows && step === "preview" ? buildImport(rows, mapping, data.leads, () => newId("l")) : null), [rows, mapping, data.leads, step]);

  function reset() {
    setRows(null);
    setFileName("");
    setMapping({});
    setStep("pick");
    setError(null);
    setResult(null);
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 2 MB. Export only the Lead Tracker sheet.");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) return setError("No rows found. Export the sheet with File > Download > Comma-separated values.");
    setRows(parsed);
    setFileName(file.name);
    setMapping(guessMapping(parsed[0]));
    setStep("map");
  }

  async function commit() {
    if (!preview?.toCreate.length) return;
    setBusy(true);
    const r = await bulkCreateLeads(preview.toCreate);
    setBusy(false);
    if (r.ok) {
      setResult(`Imported ${preview.toCreate.length} leads.`);
      setStep("done");
    } else setError(r.message ?? "Import failed. Nothing was saved.");
  }

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Import Lead Tracker CSV">
      <ol className="mb-4 flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {["Pick file", "Map columns", "Preview", "Done"].map((s, i) => (
          <li key={s}>
            <Badge tone={["pick", "map", "preview", "done"].indexOf(step) >= i ? "info" : "neutral"}>
              {i + 1}. {s}
            </Badge>
          </li>
        ))}
      </ol>

      {step === "pick" && (
        <div className="space-y-3 text-sm">
          <p className="text-muted">In Google Sheets: File &gt; Download &gt; Comma-separated values (.csv). The file is read in this browser; nothing is saved until you confirm the preview.</p>
          <label className="block">
            <span className="mb-1 block text-muted">CSV file</span>
            <input type="file" accept=".csv,text/csv" className="field" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        </div>
      )}

      {step === "map" && rows && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {fileName}: {rows.length - 1} rows. Match each dashboard field to a column. Business is required; dedupe uses Business + Contact.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f: ImportField) => (
              <Select
                key={f}
                label={FIELD_LABELS[f]}
                required={f === "business"}
                value={mapping[f] != null ? String(mapping[f]) : null}
                onChange={(v) => setMapping((m) => ({ ...m, [f]: v == null ? undefined : Number(v) }))}
                options={headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))}
                allowEmpty
                emptyLabel="Don't import"
              />
            ))}
          </div>
          <p className="text-xs text-muted">Sources map to: {Object.values(SOURCE_LABEL).join(", ")}. Dates are read as day/month/year.</p>
          <div className="flex gap-2">
            <Button onClick={() => setStep("preview")} disabled={mapping.business == null}>
              Preview
            </Button>
            <Button variant="ghost" onClick={reset}>
              Start over
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone="ok">{preview.toCreate.length} new</Badge>
            <Badge tone="neutral">{preview.duplicates.length} duplicates skipped</Badge>
            <Badge tone={preview.errors.length ? "bad" : "neutral"}>{preview.errors.length} rows with errors</Badge>
            <Badge tone={preview.warnings.length ? "warn" : "neutral"}>{preview.warnings.length} warnings</Badge>
          </div>
          {preview.toCreate.length > 0 && (
            <div className="scroll-x max-h-64 overflow-y-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.toCreate.slice(0, 100).map((l) => (
                    <tr key={l.id}>
                      <td>{l.business}</td>
                      <td className="text-muted">{l.contact || "-"}</td>
                      <td>{l.status}</td>
                      <td>{l.source ? SOURCE_LABEL[l.source] : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.toCreate.length > 100 && <p className="mt-1 text-xs text-muted">Showing the first 100.</p>}
            </div>
          )}
          {[...preview.duplicates.map((d) => ({ row: d.row, msg: `${d.business}: ${d.reason}` })), ...preview.errors.map((e) => ({ row: e.row, msg: e.message })), ...preview.warnings.map((w) => ({ row: w.row, msg: w.message }))].length > 0 && (
            <details className="inset p-3">
              <summary className="cursor-pointer">Skipped rows and warnings</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {preview.duplicates.map((d) => (
                  <li key={`d${d.row}`}>
                    Row {d.row}: {d.business} ({d.reason})
                  </li>
                ))}
                {preview.errors.map((e) => (
                  <li key={`e${e.row}`} className="text-bad">
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {preview.warnings.map((w, i) => (
                  <li key={`w${i}`} className="text-warn">
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void commit()} disabled={busy || preview.toCreate.length === 0}>
              {busy ? "Importing..." : `Import ${preview.toCreate.length} leads`}
            </Button>
            <Button variant="ghost" onClick={() => setStep("map")}>
              Back to mapping
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-3 text-sm">
          <p className="text-ok">{result}</p>
          <Button onClick={close}>Close</Button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

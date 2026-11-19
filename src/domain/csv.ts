import { leadSchema, SOURCES, STATUSES, type Lead, type Source, type Status } from "../shared/schema";

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export const IMPORT_FIELDS = ["business", "niche", "source", "contact", "status", "previewSentOn", "notes"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, number>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  business: "Business",
  niche: "Niche",
  source: "Source",
  contact: "Contact",
  status: "Status",
  previewSentOn: "Preview sent on",
  notes: "Notes",
};

const SYNONYMS: Record<ImportField, string[]> = {
  business: ["business", "business name", "company", "name", "client", "lead"],
  niche: ["niche", "industry", "category", "type", "sector"],
  source: ["source", "channel", "lead source", "how found", "found via"],
  contact: ["contact", "phone", "number", "cell", "email", "contact person", "instagram", "handle", "whatsapp"],
  status: ["status", "stage", "pipeline stage", "state"],
  previewSentOn: ["preview sent", "preview sent on", "preview date", "date preview sent", "preview"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const syn = SYNONYMS[field];
    let found = headers.findIndex((h, i) => !used.has(i) && syn.includes(norm(h)));
    if (found < 0) found = headers.findIndex((h, i) => !used.has(i) && syn.some((s) => norm(h).startsWith(s)));
    if (found >= 0) {
      m[field] = found;
      used.add(found);
    }
  }
  return m;
}

export function normaliseSource(v: string): Source | null {
  const s = norm(v);
  if (!s) return null;
  if ((SOURCES as readonly string[]).includes(s.replace(/ /g, "-"))) return s.replace(/ /g, "-") as Source;
  if (/cold|call|phone/.test(s)) return "cold-call";
  if (/insta|\big\b|dm/.test(s)) return "instagram-dm";
  if (/map|scrape|google/.test(s)) return "maps-scrape";
  if (/refer|word of mouth/.test(s)) return "referral";
  return "other";
}

export function normaliseStatus(v: string): Status | null {
  const s = norm(v);
  if (!s) return null;
  const exact = STATUSES.find((st) => norm(st) === s);
  if (exact) return exact;
  if (/lost after/.test(s)) return "Lost After Deposit";
  if (/lost|dead|no$|declined|not interested/.test(s)) return "Lost";
  if (/closed|paid in full|complete/.test(s)) return "Closed, Paid";
  if (/deliver|awaiting balance|live/.test(s)) return "Delivered, Awaiting Balance";
  if (/build/.test(s)) return "In Build";
  if (/deposit/.test(s)) return "Deposit Paid";
  if (/preview/.test(s)) return "Preview Sent";
  if (/repl|interested|responded/.test(s)) return "Replied";
  if (/contact|called|messaged|sent|dm/.test(s)) return "Contacted";
  if (/new|todo|to do/.test(s)) return "New";
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Accepts YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY (South African order), and "19 Nov 2026". */
export function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/))) {
    d = +r[1];
    m = MONTHS.indexOf(r[2].toLowerCase()) + 1;
    y = +r[3];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function dedupeKey(business: string, contact: string): string {
  return `${norm(business)}|${norm(contact)}`;
}

export interface ImportPreview {
  toCreate: Lead[];
  duplicates: { row: number; business: string; reason: "already in dashboard" | "repeated in file" }[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

/**
 * Turns mapped CSV rows into new leads. Rows are numbered as in the sheet (header is row 1).
 * Dedupes by business + contact against existing leads and within the file.
 */
export function buildImport(
  rows: string[][],
  mapping: Mapping,
  existing: Pick<Lead, "business" | "contact">[],
  makeId: () => string,
): ImportPreview {
  const out: ImportPreview = { toCreate: [], duplicates: [], errors: [], warnings: [] };
  if (mapping.business == null) {
    out.errors.push({ row: 1, message: "Map a column to Business before importing." });
    return out;
  }
  const seen = new Set(existing.map((l) => dedupeKey(l.business, l.contact)));
  const inFile = new Set<string>();
  rows.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (f: ImportField) => (mapping[f] != null ? (cells[mapping[f] as number] ?? "").trim() : "");
    const business = get("business");
    if (!business) {
      out.errors.push({ row: rowNo, message: "No business name; row skipped." });
      return;
    }
    const contact = get("contact");
    const key = dedupeKey(business, contact);
    if (seen.has(key)) {
      out.duplicates.push({ row: rowNo, business, reason: "already in dashboard" });
      return;
    }
    if (inFile.has(key)) {
      out.duplicates.push({ row: rowNo, business, reason: "repeated in file" });
      return;
    }
    const rawStatus = get("status");
    let status = normaliseStatus(rawStatus);
    if (rawStatus && !status) out.warnings.push({ row: rowNo, message: `Unknown status "${rawStatus}"; set to New.` });
    status = status ?? "New";
    const rawDate = get("previewSentOn");
    const previewSentOn = parseDateLoose(rawDate);
    if (rawDate && !previewSentOn) out.warnings.push({ row: rowNo, message: `Could not read date "${rawDate}"; left blank.` });
    const parsed = leadSchema.safeParse({
      id: makeId(),
      business,
      niche: get("niche") || null,
      source: normaliseSource(get("source")),
      contact,
      status,
      previewSentOn,
      notes: get("notes"),
    });
    if (!parsed.success) {
      out.errors.push({ row: rowNo, message: parsed.error.issues.map((x) => x.message).join("; ") });
      return;
    }
    inFile.add(key);
    out.toCreate.push(parsed.data);
  });
  return out;
}

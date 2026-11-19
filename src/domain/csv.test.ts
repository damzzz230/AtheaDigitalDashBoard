import { describe, expect, it } from "vitest";
import { buildImport, guessMapping, normaliseSource, normaliseStatus, parseCsv, parseDateLoose } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, commas, doubled quotes, CRLF and a BOM", () => {
    const rows = parseCsv(String.fromCharCode(0xfeff) + 'Business,Notes\r\n"Smith, Co","said ""hi"""\r\nB,\r\n');
    expect(rows).toEqual([
      ["Business", "Notes"],
      ["Smith, Co", 'said "hi"'],
      ["B", ""],
    ]);
  });
  it("keeps newlines inside quoted fields and skips blank lines", () => {
    expect(parseCsv('a,b\n"line1\nline2",x\n\n')).toEqual([["a", "b"], ["line1\nline2", "x"]]);
  });
});

describe("mapping guesses", () => {
  it("maps common Lead Tracker headers", () => {
    const m = guessMapping(["Business Name", "Niche", "Lead Source", "Phone", "Stage", "Preview Sent", "Notes"]);
    expect(m).toEqual({ business: 0, niche: 1, source: 2, contact: 3, status: 4, previewSentOn: 5, notes: 6 });
  });
});

describe("normalisers", () => {
  it("reads sources", () => {
    expect(normaliseSource("Cold call")).toBe("cold-call");
    expect(normaliseSource("IG DM")).toBe("instagram-dm");
    expect(normaliseSource("Google Maps scrape")).toBe("maps-scrape");
    expect(normaliseSource("Referral")).toBe("referral");
    expect(normaliseSource("Flyer")).toBe("other");
    expect(normaliseSource("")).toBeNull();
  });
  it("reads statuses", () => {
    expect(normaliseStatus("preview sent")).toBe("Preview Sent");
    expect(normaliseStatus("Delivered, awaiting balance")).toBe("Delivered, Awaiting Balance");
    expect(normaliseStatus("Lost after deposit")).toBe("Lost After Deposit");
    expect(normaliseStatus("not interested")).toBe("Lost");
    expect(normaliseStatus("???")).toBeNull();
  });
  it("reads dates in South African order", () => {
    expect(parseDateLoose("2026-11-05")).toBe("2026-11-05");
    expect(parseDateLoose("05/11/2026")).toBe("2026-11-05");
    expect(parseDateLoose("5 Nov 2026")).toBe("2026-11-05");
    expect(parseDateLoose("31/02/2026")).toBeNull();
    expect(parseDateLoose("soon")).toBeNull();
  });
});

describe("buildImport", () => {
  let n = 0;
  const id = () => `imp-${++n}`;
  const rows = parseCsv(
    [
      "Business,Contact,Source,Status,Preview Sent,Notes",
      "Alpha Salon,082 000 0000,Cold call,Contacted,,",
      "alpha salon, 082 000 0000 ,IG,Replied,,dupe in file",
      "Existing Co,x@y.co.za,Referral,New,,",
      ",nobody,,,,",
      "Beta Tattoo,@beta,IG DM,weird,02/11/2026,",
      "Gamma,0821234567,Other,New,,password: hunter2",
    ].join("\n"),
  );
  const mapping = guessMapping(rows[0]);
  const out = buildImport(rows, mapping, [{ business: "Existing Co", contact: "x@y.co.za" }], id);

  it("creates only new, valid rows", () => {
    expect(out.toCreate.map((l) => l.business)).toEqual(["Alpha Salon", "Beta Tattoo"]);
    expect(out.toCreate[1].previewSentOn).toBe("2026-11-02");
    expect(out.toCreate[1].status).toBe("New");
  });
  it("dedupes by business + contact against the dashboard and within the file", () => {
    expect(out.duplicates).toEqual([
      { row: 3, business: "alpha salon", reason: "repeated in file" },
      { row: 4, business: "Existing Co", reason: "already in dashboard" },
    ]);
  });
  it("reports rows it skipped and values it could not read", () => {
    expect(out.errors.map((e) => e.row)).toEqual([5, 7]);
    expect(out.errors[1].message).toMatch(/password/);
    expect(out.warnings[0]).toMatchObject({ row: 6 });
  });
  it("refuses to run without a business column", () => {
    expect(buildImport(rows, {}, [], id).errors[0].message).toMatch(/Business/);
  });
});

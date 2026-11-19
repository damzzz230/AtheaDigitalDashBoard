import { describe, expect, it } from "vitest";
import { applyMutation } from "./mutate";
import { leadSchema, normaliseSiteUrl, projectSchema, siteSchema } from "./schema";
import { containsSensitive } from "./sensitive";
import { seedCollections } from "./seed";

describe("sensitive-text guard", () => {
  it("rejects card numbers (Luhn-valid 13-19 digits)", () => {
    expect(containsSensitive("card 4111 1111 1111 1111")).toBe(true);
    expect(containsSensitive("4111-1111-1111-1111")).toBe(true);
  });
  it("rejects password and banking patterns", () => {
    expect(containsSensitive("wp-admin password: abc123")).toBe(true);
    expect(containsSensitive("Acc no 62812345678")).toBe(true);
    expect(containsSensitive("branch code 250655")).toBe(true);
    expect(containsSensitive("login and password in the email")).toBe(true);
  });
  it("allows ordinary notes and SA phone numbers", () => {
    expect(containsSensitive("Call back Tuesday on 082 123 4567")).toBe(false);
    expect(containsSensitive("Client forgot their password reset link, resent it")).toBe(false);
    expect(containsSensitive("Invoice 20261119 sent")).toBe(false);
  });
  it("is enforced by the schemas", () => {
    const r = leadSchema.safeParse({ id: "l", business: "A", notes: "pwd = secret" });
    expect(r.success).toBe(false);
  });
});

describe("site url", () => {
  it("normalises domains and rejects private targets", () => {
    expect(normaliseSiteUrl("bugsza.co.za")).toBe("https://bugsza.co.za");
    expect(normaliseSiteUrl("https://TopDrawProjects.co.za/")).toBe("https://topdrawprojects.co.za");
    expect(normaliseSiteUrl("http://localhost")).toBeNull();
    expect(normaliseSiteUrl("http://127.0.0.1")).toBeNull();
    expect(normaliseSiteUrl("http://169.254.169.254/latest")).toBeNull();
    expect(normaliseSiteUrl("ftp://x.co.za")).toBeNull();
    expect(normaliseSiteUrl("https://a.co.za:8443")).toBeNull();
    expect(siteSchema.safeParse({ id: "s", name: "x", url: "nope" }).success).toBe(false);
  });
});

describe("versioned mutations", () => {
  const now = "2026-11-19T08:00:00.000Z";
  const later = "2026-11-19T08:05:00.000Z";
  const base = seedCollections(now).leads;

  it("creates with expectedVersion 0 and stamps metadata", () => {
    const { result, map } = applyMutation(base, { op: "put", collection: "leads", id: "new1", expectedVersion: 0, record: { business: "New Co" } }, "das", later);
    expect(result.ok).toBe(true);
    expect(map.new1).toMatchObject({ business: "New Co", version: 1, updatedBy: "das", createdAt: later });
    expect(base.new1).toBeUndefined();
  });

  it("refuses to create over an existing id", () => {
    const { result } = applyMutation(base, { op: "put", collection: "leads", id: "l-hair77", expectedVersion: 0, record: { business: "X" } }, "das", later);
    expect(result).toMatchObject({ ok: false, kind: "conflict" });
  });

  it("gives the second of two concurrent saves a conflict instead of overwriting", () => {
    const original = base["l-hair77"];
    const damz = applyMutation(base, { op: "put", collection: "leads", id: "l-hair77", expectedVersion: original.version, record: { ...original, notes: "Damz edit" } }, "damz", later);
    expect(damz.result.ok).toBe(true);
    const das = applyMutation(damz.map, { op: "put", collection: "leads", id: "l-hair77", expectedVersion: original.version, record: { ...original, notes: "Das edit" } }, "das", later);
    expect(das.result.ok).toBe(false);
    if (!das.result.ok && das.result.kind === "conflict") {
      expect((das.result.current as { notes: string }).notes).toBe("Damz edit");
      expect(das.result.current?.version).toBe(2);
    }
    expect((das.map["l-hair77"] as { notes: string }).notes).toBe("Damz edit");
  });

  it("checks the version on delete", () => {
    expect(applyMutation(base, { op: "delete", collection: "leads", id: "l-hair77", expectedVersion: 5 }, "damz", later).result.ok).toBe(false);
    const ok = applyMutation(base, { op: "delete", collection: "leads", id: "l-hair77", expectedVersion: 1 }, "damz", later);
    expect(ok.result.ok).toBe(true);
    expect(ok.map["l-hair77"]).toBeUndefined();
  });

  it("validates records and rejects secrets", () => {
    const bad = applyMutation(base, { op: "put", collection: "leads", id: "x", expectedVersion: 0, record: { business: "" } }, "damz", later);
    expect(bad.result).toMatchObject({ ok: false, kind: "invalid" });
    const secret = applyMutation(base, { op: "put", collection: "leads", id: "y", expectedVersion: 0, record: { business: "Y", notes: "card 4111111111111111" } }, "damz", later);
    expect(secret.result).toMatchObject({ ok: false, kind: "invalid" });
  });

  it("bulk-creates all or nothing", () => {
    const bad = applyMutation(base, { op: "bulkCreate", collection: "leads", records: [{ id: "b1", business: "B1" }, { id: "b2", business: "" }] }, "damz", later);
    expect(bad.result.ok).toBe(false);
    expect(bad.map.b1).toBeUndefined();
    const good = applyMutation(base, { op: "bulkCreate", collection: "leads", records: [{ id: "b1", business: "B1" }, { id: "b2", business: "B2" }] }, "damz", later);
    expect(Object.keys(good.map)).toContain("b2");
  });

  it("strips unknown fields", () => {
    const { map } = applyMutation(seedCollections(now).projects, { op: "put", collection: "projects", id: "p9", expectedVersion: 0, record: { client: "P", cardNumber: "x" } }, "damz", later);
    expect("cardNumber" in map.p9).toBe(false);
    expect(projectSchema.parse(map.p9).client).toBe("P");
  });
});

import { describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "./localAdapter";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("LocalStorageAdapter", () => {
  it("seeds on first load", async () => {
    const a = new LocalStorageAdapter(memoryStorage());
    const s = await a.load();
    expect(Object.keys(s.collections.sites).sort()).toEqual(["s-athea", "s-bugz", "s-topdraw"]);
  });

  it("gives two editors of the same record a conflict on the second save", async () => {
    const storage = memoryStorage();
    const damz = new LocalStorageAdapter(storage, () => "damz");
    const das = new LocalStorageAdapter(storage, () => "das");
    const a = (await damz.load()).collections.projects["p-topdraw"];
    const b = (await das.load()).collections.projects["p-topdraw"];
    const r1 = await damz.mutate({ op: "put", collection: "projects", id: a.id, expectedVersion: a.version, record: { ...a, notes: "Damz" } });
    expect(r1.ok).toBe(true);
    const r2 = await das.mutate({ op: "put", collection: "projects", id: b.id, expectedVersion: b.version, record: { ...b, notes: "Das" } });
    expect(r2).toMatchObject({ ok: false, kind: "conflict" });
    const after = (await das.load()).collections.projects["p-topdraw"];
    expect(after.notes).toBe("Damz");
    expect(after.updatedBy).toBe("damz");
  });

  it("rejects malformed mutations", async () => {
    const a = new LocalStorageAdapter(memoryStorage());
    const r = await a.mutate({ op: "put", collection: "leads", id: "bad id!", expectedVersion: 0, record: {} });
    expect(r.ok).toBe(false);
  });
});

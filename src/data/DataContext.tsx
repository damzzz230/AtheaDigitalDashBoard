import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayJhb } from "../domain/dates";
import { toData, type Data } from "../domain/types";
import { withoutMeta, type MutationResult } from "../shared/mutate";
import type { CollectionName, Meta, Person, RecordOf, Snapshot, Stored } from "../shared/schema";
import { Button, Modal } from "../components/ui";
import { AuthRequiredError, type DataStore } from "./store";

export type SaveOutcome = { ok: true; record?: Stored<CollectionName> } | { ok: false; issues: Record<string, string>; message?: string };

interface Conflict {
  collection: CollectionName;
  mine: Record<string, unknown>;
  theirs: Stored<CollectionName> | null;
  resolve: (o: SaveOutcome) => void;
}

interface Ctx {
  store: DataStore;
  snapshot: Snapshot;
  data: Data;
  user: Person;
  today: string;
  now: Date;
  /** Saves a record. Pass the stored version you edited (or null for a new record). */
  save<C extends CollectionName>(collection: C, record: RecordOf<C>, base: (Meta & { id: string }) | null): Promise<SaveOutcome>;
  remove(collection: CollectionName, base: Meta & { id: string }): Promise<SaveOutcome>;
  bulkCreateLeads(records: RecordOf<"leads">[]): Promise<SaveOutcome>;
  refresh(): Promise<void>;
  stored<C extends CollectionName>(collection: C, id: string): Stored<C> | undefined;
}

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
}

const META_KEYS = new Set(["version", "createdAt", "updatedAt", "updatedBy"]);
const NAMES: Record<string, string> = { damz: "Damz", das: "Das", system: "the seed" };

function diffFields(mine: Record<string, unknown>, theirs: Record<string, unknown> | null) {
  if (!theirs) return [];
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  return [...keys].filter((k) => !META_KEYS.has(k) && JSON.stringify(mine[k] ?? null) !== JSON.stringify(theirs[k] ?? null));
}

const show = (v: unknown) => (v == null || v === "" ? "(blank)" : typeof v === "object" ? JSON.stringify(v) : String(v));

function issuesToMap(issues: { path: string; message: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const i of issues) m[i.path.split(".")[0] || "_"] ??= i.message;
  return m;
}

export function DataProvider({ store, initial, onAuthLost, children }: { store: DataStore; initial: Snapshot; onAuthLost: () => void; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [now, setNow] = useState(() => new Date());
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await store.load());
      setNow(new Date());
    } catch (e) {
      if (e instanceof AuthRequiredError) onAuthLost();
    }
  }, [store, onAuthLost]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const poll = setInterval(() => !busy.current && document.visibilityState === "visible" && void refresh(), 120_000);
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const apply = useCallback((collection: CollectionName, result: Extract<MutationResult, { ok: true }>) => {
    setSnapshot((s) => {
      const col = { ...s.collections[collection] } as Record<string, unknown>;
      for (const r of result.records) col[r.id] = r;
      if (result.deletedId) delete col[result.deletedId];
      return { ...s, collections: { ...s.collections, [collection]: col } };
    });
  }, []);

  const run = useCallback(
    async (collection: CollectionName, fn: () => Promise<MutationResult>, mine: Record<string, unknown>): Promise<SaveOutcome> => {
      busy.current = true;
      try {
        const r = await fn();
        if (r.ok) {
          apply(collection, r);
          return { ok: true, record: r.records[0] };
        }
        if (r.kind === "invalid") return { ok: false, issues: issuesToMap(r.issues), message: r.issues[0]?.message };
        return await new Promise<SaveOutcome>((resolve) => setConflict({ collection, mine, theirs: r.current, resolve }));
      } catch (e) {
        if (e instanceof AuthRequiredError) {
          onAuthLost();
          return { ok: false, issues: {}, message: "Your session ended. Sign in again." };
        }
        return { ok: false, issues: {}, message: e instanceof Error ? e.message : "Save failed" };
      } finally {
        busy.current = false;
      }
    },
    [apply, onAuthLost],
  );

  const save = useCallback(
    <C extends CollectionName>(collection: C, record: RecordOf<C>, base: (Meta & { id: string }) | null) => {
      const rec = record as unknown as Record<string, unknown>;
      const id = rec.id as string;
      return run(collection, () => store.mutate({ op: "put", collection, id, expectedVersion: base?.version ?? 0, record: rec }), rec);
    },
    [run, store],
  );

  const remove = useCallback(
    (collection: CollectionName, base: Meta & { id: string }) =>
      run(collection, () => store.mutate({ op: "delete", collection, id: base.id, expectedVersion: base.version }), { id: base.id, deleted: true }),
    [run, store],
  );

  const bulkCreateLeads = useCallback(
    (records: RecordOf<"leads">[]) => run("leads", () => store.mutate({ op: "bulkCreate", collection: "leads", records: records as unknown as Record<string, unknown>[] }), {}),
    [run, store],
  );

  const value = useMemo<Ctx>(() => {
    const data = toData(snapshot.collections, snapshot.siteChecks);
    return {
      store,
      snapshot,
      data,
      user: snapshot.user,
      today: todayJhb(now),
      now,
      save,
      remove,
      bulkCreateLeads,
      refresh,
      stored: <C extends CollectionName>(c: C, id: string) => snapshot.collections[c][id] as Stored<C> | undefined,
    };
  }, [snapshot, now, store, save, remove, bulkCreateLeads, refresh]);

  const close = (o: SaveOutcome) => {
    conflict?.resolve(o);
    setConflict(null);
  };

  const fields = conflict ? diffFields(conflict.mine, conflict.theirs as Record<string, unknown> | null) : [];
  const theirs = conflict?.theirs as (Record<string, unknown> & Meta) | null | undefined;

  return (
    <DataCtx.Provider value={value}>
      {children}
      <Modal open={!!conflict} onClose={() => close({ ok: false, issues: {}, message: "Not saved: the record changed while you were editing." })} title="Someone else changed this first">
        {conflict && (
          <div className="space-y-4 text-sm">
            <p className="text-muted">
              {theirs ? (
                <>
                  {NAMES[theirs.updatedBy] ?? theirs.updatedBy} saved this record at {new Date(theirs.updatedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })} while you were editing. Nothing has been overwritten.
                </>
              ) : (
                <>This record was deleted or created by someone else while you were editing. Nothing has been overwritten.</>
              )}
            </p>
            {fields.length > 0 && (
              <div className="scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Yours</th>
                      <th>Theirs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f}>
                        <td className="text-muted">{f}</td>
                        <td className="break-words">{show(conflict.mine[f])}</td>
                        <td className="break-words">{show(theirs?.[f])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  void refresh();
                  close({ ok: false, issues: {}, message: "Kept their version. Your changes were discarded." });
                }}
              >
                Keep theirs
              </Button>
              {!("deleted" in conflict.mine) && (
                <Button
                  onClick={async () => {
                    const c = conflict;
                    setConflict(null);
                    const rec = withoutMeta({ ...(c.mine as Record<string, unknown> & Meta) });
                    const r = await store.mutate({ op: "put", collection: c.collection, id: c.mine.id as string, expectedVersion: c.theirs?.version ?? 0, record: rec });
                    if (r.ok) {
                      apply(c.collection, r);
                      c.resolve({ ok: true, record: r.records[0] });
                    } else {
                      void refresh();
                      c.resolve({ ok: false, issues: {}, message: "It changed again. Reopen the record and retry." });
                    }
                  }}
                >
                  Save mine over theirs
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </DataCtx.Provider>
  );
}

export { withoutMeta };

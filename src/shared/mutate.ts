import {
  recordSchemas,
  type CollectionMap,
  type CollectionName,
  type Meta,
  type Mutation,
  type Person,
  type Stored,
} from "./schema";

export type MutationResult =
  | { ok: true; records: Stored<CollectionName>[]; deletedId?: string }
  | { ok: false; kind: "conflict"; current: Stored<CollectionName> | null }
  | { ok: false; kind: "invalid"; issues: { path: string; message: string }[] };

export interface ApplyOutcome {
  map: CollectionMap<CollectionName>;
  result: MutationResult;
  changed: boolean;
}

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }, prefix = "") {
  return error.issues.map((i) => ({ path: prefix + i.path.map(String).join("."), message: i.message }));
}

function stamp<T>(data: T, prev: Meta | undefined, user: Person, now: string): T & Meta {
  return {
    ...data,
    version: (prev?.version ?? 0) + 1,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    updatedBy: user,
  };
}

/**
 * Applies one mutation to one collection with optimistic concurrency.
 * A put with expectedVersion 0 creates; it conflicts if the id already exists.
 * A put or delete with expectedVersion n conflicts unless the stored version is exactly n.
 * Never mutates the input map.
 */
export function applyMutation(
  map: CollectionMap<CollectionName>,
  mutation: Mutation,
  user: Person,
  now: string,
): ApplyOutcome {
  const schema = recordSchemas[mutation.collection];

  if (mutation.op === "bulkCreate") {
    const next = { ...map };
    const created: Stored<CollectionName>[] = [];
    const issues: { path: string; message: string }[] = [];
    mutation.records.forEach((raw, idx) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        issues.push(...issuesOf(parsed.error, `records.${idx}.`));
        return;
      }
      const rec = parsed.data as { id: string };
      if (next[rec.id]) {
        issues.push({ path: `records.${idx}.id`, message: "Id already exists" });
        return;
      }
      const stored = stamp(rec, undefined, user, now) as Stored<CollectionName>;
      next[rec.id] = stored;
      created.push(stored);
    });
    if (issues.length) return { map, result: { ok: false, kind: "invalid", issues }, changed: false };
    return { map: next, result: { ok: true, records: created }, changed: true };
  }

  const current = map[mutation.id] ?? null;
  const currentVersion = current?.version ?? 0;
  if (currentVersion !== mutation.expectedVersion) {
    return { map, result: { ok: false, kind: "conflict", current }, changed: false };
  }

  if (mutation.op === "delete") {
    if (mutation.collection === "settings") {
      return { map, result: { ok: false, kind: "invalid", issues: [{ path: "id", message: "Settings cannot be deleted" }] }, changed: false };
    }
    const next = { ...map };
    delete next[mutation.id];
    return { map: next, result: { ok: true, records: [], deletedId: mutation.id }, changed: true };
  }

  const parsed = schema.safeParse({ ...mutation.record, id: mutation.id });
  if (!parsed.success) {
    return { map, result: { ok: false, kind: "invalid", issues: issuesOf(parsed.error) }, changed: false };
  }
  const stored = stamp(parsed.data, current ?? undefined, user, now) as Stored<CollectionName>;
  return { map: { ...map, [mutation.id]: stored }, result: { ok: true, records: [stored] }, changed: true };
}

/** Strips the metadata fields so a stored record can be edited and re-sent. */
export function withoutMeta<T extends Meta>(rec: T): Omit<T, keyof Meta> {
  const { version: _v, createdAt: _c, updatedAt: _u, updatedBy: _b, ...rest } = rec;
  return rest;
}

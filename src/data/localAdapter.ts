import { applyMutation, type MutationResult } from "../shared/mutate";
import {
  COLLECTIONS,
  mutationSchema,
  type CollectionMap,
  type CollectionName,
  type Collections,
  type Mutation,
  type Person,
  type Snapshot,
} from "../shared/schema";
import { emptyCollections, seedCollections } from "../shared/seed";
import type { DataStore } from "./store";

import { STORAGE_KEY } from "./keys";

export { STORAGE_KEY };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Dev and test adapter. Keeps all collections in one localStorage entry and applies the same
 * versioned mutation engine as the server, so conflicts behave identically.
 */
export class LocalStorageAdapter implements DataStore {
  readonly mode = "local" as const;

  constructor(
    private storage: StorageLike,
    private user: () => Person = () => "damz",
    private now: () => Date = () => new Date(),
  ) {}

  private read(): Collections {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedCollections(this.now().toISOString());
      this.write(seeded);
      return seeded;
    }
    try {
      return { ...emptyCollections(), ...(JSON.parse(raw) as Partial<Collections>) };
    } catch {
      throw new Error("Local dev data is unreadable. Reset it from Settings or clear this site's storage.");
    }
  }

  private write(c: Collections) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(c));
  }

  async load(): Promise<Snapshot> {
    const collections = this.read();
    return { user: this.user(), collections, siteChecks: {}, pagespeedEnabled: false };
  }

  async mutate(m: Mutation): Promise<MutationResult> {
    const parsed = mutationSchema.safeParse(m);
    if (!parsed.success) {
      return { ok: false, kind: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
    }
    const all = this.read();
    const col = parsed.data.collection as CollectionName;
    const outcome = applyMutation(all[col] as CollectionMap<CollectionName>, parsed.data, this.user(), this.now().toISOString());
    if (outcome.changed) this.write({ ...all, [col]: outcome.map });
    return outcome.result;
  }

  async logout(): Promise<void> {}

  /** Replaces everything (used by the dev-only sample loader and reset). */
  replaceAll(c: Collections) {
    const clean = emptyCollections();
    for (const k of COLLECTIONS) (clean as Record<string, unknown>)[k] = c[k] ?? {};
    this.write(clean);
  }

  reset() {
    this.storage.removeItem(STORAGE_KEY);
  }
}

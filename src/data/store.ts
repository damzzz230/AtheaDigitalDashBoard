import type { MutationResult } from "../shared/mutate";
import type { Mutation, Person, Snapshot } from "../shared/schema";

/** Where the dashboard's records live. Both adapters enforce the same versioned writes. */
export interface DataStore {
  readonly mode: "local" | "remote";
  load(): Promise<Snapshot>;
  mutate(m: Mutation): Promise<MutationResult>;
  logout(): Promise<void>;
}

export interface Auth {
  session(): Promise<Person | null>;
  login(user: Person, passphrase: string): Promise<{ ok: true } | { ok: false; message: string }>;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign in required");
  }
}

export function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  return `${prefix}-${s}`;
}

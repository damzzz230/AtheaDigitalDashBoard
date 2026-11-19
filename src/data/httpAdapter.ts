import type { MutationResult } from "../shared/mutate";
import type { Mutation, Person, Snapshot } from "../shared/schema";
import { AuthRequiredError, type Auth, type DataStore } from "./store";

const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
}

/** Production adapter: Netlify Blobs behind the authenticated /api functions. */
export class HttpAdapter implements DataStore, Auth {
  readonly mode = "remote" as const;

  async load(): Promise<Snapshot> {
    const res = await call("/api/data", { headers: { Accept: "application/json" } });
    if (res.status === 401) throw new AuthRequiredError();
    if (!res.ok) throw new Error(`Could not load data (${res.status})`);
    return (await res.json()) as Snapshot;
  }

  async mutate(m: Mutation): Promise<MutationResult> {
    const res = await call("/api/records", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(m) });
    if (res.status === 401) throw new AuthRequiredError();
    if (res.status === 200 || res.status === 409 || res.status === 400) {
      const body = (await res.json()) as MutationResult & { error?: string };
      if (res.status === 400 && !("kind" in body)) {
        return { ok: false, kind: "invalid", issues: [{ path: "", message: body.error ?? "Invalid request" }] };
      }
      return body;
    }
    throw new Error(`Save failed (${res.status})`);
  }

  async logout(): Promise<void> {
    await call("/api/logout", { method: "POST", headers: JSON_HEADERS, body: "{}" });
  }

  async session(): Promise<Person | null> {
    const res = await call("/api/session", { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return ((await res.json()) as { user: Person }).user;
  }

  async login(user: Person, passphrase: string) {
    const res = await call("/api/login", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ user, passphrase }) });
    if (res.ok) return { ok: true as const };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false as const, message: body.error ?? `Sign-in failed (${res.status})` };
  }
}

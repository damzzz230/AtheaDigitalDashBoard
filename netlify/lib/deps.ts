import type { Deps } from "./handlers";
import { getEnv } from "./http";
import { AUTH_STORE, blobsKV, CHECKS_STORE, DATA_STORE } from "./kv";

export function productionDeps(): Deps {
  return {
    data: blobsKV(DATA_STORE),
    auth: blobsKV(AUTH_STORE),
    checks: blobsKV(CHECKS_STORE),
    env: getEnv,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

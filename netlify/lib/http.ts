/** Function responses don't get netlify.toml [[headers]], so every response carries these. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

export function json(body: unknown, status = 200, extra: Record<string, string> | Headers = {}): Response {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", "application/json; charset=utf-8");
  new Headers(extra).forEach((v, k) => headers.append(k, v));
  return new Response(JSON.stringify(body), { status, headers });
}

export function error(status: number, message: string, extra: Record<string, string> = {}): Response {
  return json({ error: message }, status, extra);
}

/** Mutating requests must be JSON. A cross-site form can't send this content type without a CORS preflight. */
export function requireJson(req: Request): Response | null {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) return error(415, "Content-Type must be application/json");
  return null;
}

/** Rejects requests whose Origin header names another site. */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = new URL(req.url).host;
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    /* fall through */
  }
  return error(403, "Cross-origin request refused");
}

export class BodyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new BodyError(413, "Request body too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new BodyError(413, "Request body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400, "Body is not valid JSON");
  }
}

export function getEnv(name: string): string | undefined {
  const g = globalThis as { Netlify?: { env?: { get(k: string): string | undefined } } };
  return g.Netlify?.env?.get(name) ?? process.env[name];
}

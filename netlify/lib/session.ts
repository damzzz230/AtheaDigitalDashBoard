import { createHmac, timingSafeEqual } from "node:crypto";
import { PEOPLE, type Person } from "../../src/shared/schema";

export const COOKIE_NAME = "__Host-athea_session";
export const SESSION_DAYS = 14;
const MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function secretOk(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}

export function createToken(user: Person, secret: string, nowMs: number): string {
  const payload = Buffer.from(JSON.stringify({ u: user, iat: nowMs, exp: nowMs + MAX_AGE_S * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string | undefined | null, secret: string, nowMs: number): Person | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; exp?: number };
    if (typeof data.exp !== "number" || data.exp <= nowMs) return null;
    return (PEOPLE as readonly string[]).includes(data.u ?? "") ? (data.u as Person) : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readCookie(req: Request, name = COOKIE_NAME): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function userFromRequest(req: Request, secret: string | undefined, nowMs: number): Person | null {
  if (!secretOk(secret)) return null;
  return verifyToken(readCookie(req), secret, nowMs);
}

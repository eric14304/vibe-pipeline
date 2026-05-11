import { createHash, randomBytes } from "node:crypto";
import type { AuthSession } from "./storage";

export const COOKIE_NAME = "vp_auth";
export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateCookieValue(): string {
  return randomBytes(32).toString("hex");
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export function findSession(
  cookieValue: string | null,
  sessions: AuthSession[]
): AuthSession | null {
  if (!cookieValue) return null;
  const hash = sha256hex(cookieValue);
  return sessions.find((s) => s.cookieHash === hash) ?? null;
}

export function setCookieHeader(value: string): string {
  return [
    COOKIE_NAME + "=" + value,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=" + COOKIE_MAX_AGE,
  ].join("; ");
}

export function clearCookieHeader(): string {
  return [
    COOKIE_NAME + "=",
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

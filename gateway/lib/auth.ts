import { findActiveTokenBySha, sha256Hex, touchLastUsed } from "./tokens";
import type { AuthContext } from "../types";

export function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !m[1]) return null;
  return m[1].trim();
}

export function getMasterToken(): string | null {
  const t = process.env.MASTER_TOKEN;
  if (!t || t.length < 16) return null;
  return t;
}

export async function authenticateMaster(req: Request): Promise<AuthContext | null> {
  const presented = extractBearer(req);
  if (!presented) return null;
  const master = getMasterToken();
  if (!master) return null;
  if (!timingSafeEqualStr(presented, master)) return null;
  return { kind: "master" };
}

export async function authenticateEnduser(req: Request): Promise<AuthContext | null> {
  const presented = extractBearer(req);
  if (!presented) return null;
  const sha = sha256Hex(presented);
  const found = await findActiveTokenBySha(sha);
  if (!found) return null;
  touchLastUsed(found.tokenId).catch(() => {});
  return { kind: "enduser", tokenId: found.tokenId, tokenSha: sha };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

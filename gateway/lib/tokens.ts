import { createHash, randomBytes } from "node:crypto";
import { db, COLLECTIONS } from "./firestore";
import type { TokenSummary } from "../types";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateToken(): { tokenId: string; token: string; sha: string } {
  const raw = randomBytes(24);
  const token = raw.toString("base64url");
  const sha = sha256Hex(token);
  const tokenId = sha.slice(0, 16);
  return { tokenId, token, sha };
}

export interface EnduserTokenDoc {
  sha256: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
}

export async function createEnduserToken(label: string): Promise<{ tokenId: string; token: string }> {
  const { tokenId, token, sha } = generateToken();
  const doc: EnduserTokenDoc = {
    sha256: sha,
    label,
    createdAt: Date.now(),
    lastUsedAt: null,
    revoked: false,
  };
  await db().collection(COLLECTIONS.enduserTokens).doc(tokenId).set(doc);
  return { tokenId, token };
}

export async function findActiveTokenBySha(sha: string): Promise<{ tokenId: string; doc: EnduserTokenDoc } | null> {
  const snap = await db()
    .collection(COLLECTIONS.enduserTokens)
    .where("sha256", "==", sha)
    .where("revoked", "==", false)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const first = snap.docs[0];
  if (!first) return null;
  return { tokenId: first.id, doc: first.data() as EnduserTokenDoc };
}

export async function touchLastUsed(tokenId: string): Promise<void> {
  await db().collection(COLLECTIONS.enduserTokens).doc(tokenId).update({ lastUsedAt: Date.now() });
}

export async function revokeToken(tokenId: string): Promise<boolean> {
  const ref = db().collection(COLLECTIONS.enduserTokens).doc(tokenId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({ revoked: true });
  return true;
}

export async function listTokens(): Promise<TokenSummary[]> {
  const snap = await db().collection(COLLECTIONS.enduserTokens).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => {
    const data = d.data() as EnduserTokenDoc;
    return {
      tokenId: d.id,
      label: data.label,
      createdAt: data.createdAt,
      lastUsedAt: data.lastUsedAt,
      revoked: data.revoked,
    };
  });
}

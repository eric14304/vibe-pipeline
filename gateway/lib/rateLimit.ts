import { FieldValue } from "firebase-admin/firestore";
import { db, COLLECTIONS } from "./firestore";

const LIMIT_PER_MINUTE = 60;

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

function epochMinute(now: number): number {
  return Math.floor(now / 60000);
}

export async function rateLimitCheck(keyId: string): Promise<RateLimitResult> {
  const now = Date.now();
  const minute = epochMinute(now);
  const resetAt = (minute + 1) * 60000;
  const docId = `${keyId}_${minute}`;
  const ref = db().collection(COLLECTIONS.rateLimits).doc(docId);
  const ttlSeconds = 120;
  const expiresAt = new Date(now + ttlSeconds * 1000);
  await ref.set(
    {
      count: FieldValue.increment(1),
      keyId,
      minute,
      expiresAt,
    },
    { merge: true },
  );
  const after = await ref.get();
  const data = after.data() as { count?: number } | undefined;
  const count = data?.count ?? 1;
  return {
    ok: count <= LIMIT_PER_MINUTE,
    count,
    limit: LIMIT_PER_MINUTE,
    resetAt,
  };
}

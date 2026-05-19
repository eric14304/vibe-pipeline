import { FieldValue } from "firebase-admin/firestore";
import { db, COLLECTIONS } from "./firestore";

const LIMIT_PER_MINUTE = 60;
const TOKEN_ISSUE_LIMIT_PER_DAY = 5;

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
  resetAt: number;
}

function epochMinute(now: number): number {
  return Math.floor(now / 60000);
}

function ymdUtc(now: number): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export async function tokenIssueRateLimitCheck(ipHash: string): Promise<RateLimitResult> {
  const now = Date.now();
  const ymd = ymdUtc(now);
  const resetAt = nextUtcMidnight(now);
  const docId = `${ipHash}_day_${ymd}`;
  const ref = db().collection(COLLECTIONS.tokenIssueRateLimits).doc(docId);
  const ttlSeconds = 60 * 60 * 48;
  const expiresAt = new Date(now + ttlSeconds * 1000);
  await ref.set(
    {
      count: FieldValue.increment(1),
      ipHash,
      ymd,
      expiresAt,
    },
    { merge: true },
  );
  const after = await ref.get();
  const data = after.data() as { count?: number } | undefined;
  const count = data?.count ?? 1;
  return {
    ok: count <= TOKEN_ISSUE_LIMIT_PER_DAY,
    count,
    limit: TOKEN_ISSUE_LIMIT_PER_DAY,
    resetAt,
  };
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

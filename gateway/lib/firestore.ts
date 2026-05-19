import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let firestoreInstance: Firestore | null = null;

export function getProjectId(): string {
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "vibe-pipeline";
}

export function ensureFirebaseApp(): void {
  if (getApps().length > 0) return;
  initializeApp({
    credential: applicationDefault(),
    projectId: getProjectId(),
  });
}

export function db(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  ensureFirebaseApp();
  firestoreInstance = getFirestore();
  return firestoreInstance;
}

export const COLLECTIONS = {
  enduserTokens: "enduserTokens",
  tokens: "tokens",
  rateLimits: "rateLimits",
  tokenIssueRateLimits: "tokenIssueRateLimits",
} as const;

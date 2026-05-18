import { getMessaging } from "firebase-admin/messaging";
import { ensureFirebaseApp, db } from "./firestore";
import type { SendFailure } from "../types";

ensureFirebaseApp();

export interface DeviceDoc {
  deviceToken: string;
  label: string | null;
  createdAt: number;
  lastSentAt: number | null;
}

function devicesCol(enduserId: string) {
  return db().collection("tokens").doc(enduserId).collection("devices");
}

function deviceIdFromToken(deviceToken: string): string {
  // Stable, Firestore-safe doc id derived from deviceToken
  const safe = deviceToken.replace(/[^A-Za-z0-9_-]/g, "_");
  return safe.length > 120 ? safe.slice(0, 120) : safe;
}

export async function registerDevice(
  enduserId: string,
  deviceToken: string,
  label: string | undefined,
): Promise<string> {
  const deviceId = deviceIdFromToken(deviceToken);
  const ref = devicesCol(enduserId).doc(deviceId);
  const snap = await ref.get();
  const doc: DeviceDoc = {
    deviceToken,
    label: label ?? null,
    createdAt: snap.exists ? ((snap.data() as DeviceDoc).createdAt ?? Date.now()) : Date.now(),
    lastSentAt: snap.exists ? ((snap.data() as DeviceDoc).lastSentAt ?? null) : null,
  };
  await ref.set(doc);
  return deviceId;
}

export async function unregisterDevice(enduserId: string, deviceToken: string): Promise<number> {
  const deviceId = deviceIdFromToken(deviceToken);
  const ref = devicesCol(enduserId).doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) {
    const q = await devicesCol(enduserId).where("deviceToken", "==", deviceToken).get();
    let n = 0;
    for (const d of q.docs) {
      await d.ref.delete();
      n++;
    }
    return n;
  }
  await ref.delete();
  return 1;
}

export interface SendPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  ticketId?: string;
}

export async function sendToEnduser(
  enduserId: string,
  payload: SendPayload,
): Promise<{ sent: number; failed: SendFailure[] }> {
  const devSnap = await devicesCol(enduserId).get();
  if (devSnap.empty) return { sent: 0, failed: [] };

  const messaging = getMessaging();
  const failed: SendFailure[] = [];
  let sent = 0;

  const dataPayload: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data || {})) {
    if (v === undefined || v === null) continue;
    dataPayload[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  if (payload.ticketId) dataPayload.ticketId = payload.ticketId;
  dataPayload.title = payload.title;
  dataPayload.body = payload.body;

  for (const doc of devSnap.docs) {
    const dev = doc.data() as DeviceDoc;
    try {
      await messaging.send({
        token: dev.deviceToken,
        data: dataPayload,
      });
      sent++;
      doc.ref.update({ lastSentAt: Date.now() }).catch(() => {});
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      failed.push({
        deviceId: doc.id,
        deviceToken: dev.deviceToken,
        error: message,
        code,
      });
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        doc.ref.delete().catch(() => {});
      }
    }
  }

  return { sent, failed };
}

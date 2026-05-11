import { useEffect, useState } from "react";
import { authedFetch } from "./authApi";
import { useConfirm } from "../../ui/ConfirmDialog";
import { AddDeviceDialog } from "./AddDeviceDialog";
import type { AuthStatus, SessionInfo } from "./types";

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

function formatBoundAt(ts: number | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "剛剛";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 個月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function SecurityTab({
  status,
  onActionError,
}: {
  status: AuthStatus;
  onActionError?: (message: string) => void;
}) {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    authedFetch("/api/auth/sessions")
      .then(async (res) => {
        const body = (await res.json()) as Envelope<{ sessions: SessionInfo[] } | SessionInfo[]>;
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          throw new Error(body.error?.message ?? `sessions ${res.status}`);
        }
        const data = body.data;
        const list = Array.isArray(data) ? data : data?.sessions ?? [];
        setSessions(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setSessions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  async function revoke(cookieHash: string) {
    try {
      const res = await authedFetch(`/api/auth/sessions/${cookieHash}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error(`revoke ${res.status}`);
      }
      setTick((n) => n + 1);
    } catch (e) {
      onActionError?.(e instanceof Error ? e.message : "撤銷失敗");
    }
  }

  async function reset() {
    const ok = await confirm({
      title: "重置 TOTP",
      warning: "重置後所有裝置將立即登出，需重新掃描 QR Code 才能存取。",
      description: "確定要繼續嗎？",
      confirmLabel: "重置",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await authedFetch("/api/auth/reset", { method: "POST" });
      if (!res.ok && res.status !== 204) {
        throw new Error(`reset ${res.status}`);
      }
      window.location.href = "/setup";
    } catch (e) {
      onActionError?.(e instanceof Error ? e.message : "重置失敗");
    }
  }

  const hint: React.CSSProperties = {
    fontSize: 11,
    color: "var(--fg-faint)",
    lineHeight: 1.5,
    marginBottom: 8,
  };

  const sessionRow: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 12,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          fontSize: 12.5,
        }}
      >
        <span style={{ color: "var(--done)", fontFamily: "var(--font-mono)" }}>✓</span>
        <span style={{ color: "var(--fg)" }}>已綁定</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          {formatBoundAt(status.boundAt)}
        </span>
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--fg-mute)",
          fontWeight: 600,
          marginTop: 12,
          marginBottom: 4,
        }}
      >
        活躍 Sessions
      </div>
      {sessions === null ? (
        <div style={hint}>載入中…</div>
      ) : sessions.length === 0 ? (
        <div style={hint}>無活躍 session。</div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {sessions.map((s) => (
            <div key={s.cookieHash} style={sessionRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ color: "var(--fg)", fontSize: 12 }}>
                  {s.ip}
                </div>
                <div
                  className="mono"
                  style={{
                    color: "var(--fg-faint)",
                    fontSize: 10.5,
                    marginTop: 2,
                    wordBreak: "break-all",
                  }}
                  title={s.ua}
                >
                  {truncate(s.ua, 56)}
                </div>
                <div style={{ color: "var(--fg-mute)", fontSize: 10.5, marginTop: 2 }}>
                  最後活動 {formatRelativeTime(s.lastActiveAt)}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => void revoke(s.cookieHash)}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                撤銷
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--failed)",
            marginBottom: 8,
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => setAddDeviceOpen(true)}>
          擴增裝置
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void reset()}
        >
          重置 TOTP
        </button>
      </div>

      {addDeviceOpen && <AddDeviceDialog onClose={() => setAddDeviceOpen(false)} />}
    </div>
  );
}

import { useEffect, useState } from "react";
import { authedFetch } from "./authApi";

type SetupInitData = { qr_svg: string; setup_token: string; otpauth_url?: string };
type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

export function AddDeviceDialog({ onClose }: { onClose: () => void }) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authedFetch("/api/auth/setup-init", { method: "POST" })
      .then(async (res) => {
        const body = (await res.json()) as Envelope<SetupInitData>;
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.data) {
          throw new Error(body.error?.message ?? `setup-init ${res.status}`);
        }
        setQrSvg(body.data.qr_svg);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="擴增裝置"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          boxShadow: "var(--shadow-lg)",
          padding: "18px 20px 16px",
          width: "min(360px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--fg)",
            marginBottom: 10,
          }}
        >
          擴增裝置
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--fg-mute)",
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          在新裝置的 Authenticator App 掃描此 QR Code。無需重新驗證，此 QR 使用相同的 secret。
        </div>
        {loading && (
          <div style={{ fontSize: 12, color: "var(--fg-faint)", textAlign: "center", padding: 24 }}>
            載入中…
          </div>
        )}
        {error && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--failed)",
              marginBottom: 10,
              wordBreak: "break-word",
            }}
          >
            {error}
          </div>
        )}
        {qrSvg && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 12,
              background: "#fff",
              borderRadius: 6,
              marginBottom: 14,
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: backend 產生的 QR SVG 內容
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

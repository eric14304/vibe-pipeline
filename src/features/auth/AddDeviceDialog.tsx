import { useEffect, useState } from "react";
import { authedFetch } from "./authApi";
import "./auth.css";

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
      className="auth-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-dialog-box">
        <div className="auth-dialog-title">
          擴增裝置
        </div>
        <div className="auth-dialog-desc">
          在新裝置的 Authenticator App 掃描此 QR Code。無需重新驗證，此 QR 使用相同的 secret。
        </div>
        {loading && (
          <div className="auth-dialog-loading">
            載入中…
          </div>
        )}
        {error && (
          <div className="mono auth-dialog-error">
            {error}
          </div>
        )}
        {qrSvg && (
          <div
            className="auth-qr-wrapper"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: backend 產生的 QR SVG 內容
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}
        <div className="auth-dialog-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

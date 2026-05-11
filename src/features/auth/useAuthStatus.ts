import { useEffect, useState } from "react";
import { authedFetch } from "./authApi";
import type { AuthStatus } from "./types";

type AuthEnvelope<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

export function useAuthStatus(): {
  status: AuthStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authedFetch("/api/auth/status")
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as AuthEnvelope<AuthStatus>;
        if (cancelled) return;
        if (body.ok && body.data) {
          setStatus(body.data);
        } else {
          setStatus({ bound: false });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus({ bound: false });
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { status, loading, error, refetch: () => setTick((n) => n + 1) };
}

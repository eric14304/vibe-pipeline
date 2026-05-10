import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const LS_KEY = "vibe-pipeline:lastProjectHash";

export function useActiveProjectHash(): {
  hash: string | null;
  setHash: (next: string | null) => void;
} {
  const [params, setParams] = useSearchParams();
  const urlHash = params.get("project");
  const [fallback, setFallback] = useState<string | null>(() => {
    if (urlHash) return urlHash;
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (urlHash) {
      try {
        localStorage.setItem(LS_KEY, urlHash);
      } catch {}
      setFallback(urlHash);
    }
  }, [urlHash]);

  const setHash = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams(params);
      if (next) {
        p.set("project", next);
        try {
          localStorage.setItem(LS_KEY, next);
        } catch {}
      } else {
        p.delete("project");
        try {
          localStorage.removeItem(LS_KEY);
        } catch {}
      }
      setParams(p, { replace: false });
    },
    [params, setParams]
  );

  return { hash: urlHash ?? fallback, setHash };
}

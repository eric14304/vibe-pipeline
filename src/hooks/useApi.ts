// useApi — 收斂前端 polling boilerplate
//
// 設計意圖:
// BoardScreen / TicketDrawer / QADrawer / NotificationsScreen 等至少 6 處,
// 各自手寫一份「mount fetch + setInterval + visibilitychange + focus + cancelled flag + cleanup」
// 的 useEffect (參考 src/features/pipeline/BoardScreen.tsx 約 247-279 行)。
// 邏輯幾乎一致但每處微差(interval ms / gate 條件 / 是否聽 focus),改一個地方常漏其他幾處,
// 而且每個 call site 都要小心 setState-on-unmounted race。
//
// 本 hook 把這段樣板收斂成單一實作:
//   - mount 立即 fetch
//   - intervalMs 設定後輪詢;gate=false 時可選降頻(idleMs)或完全暫停
//   - refetchOnVisible / refetchOnFocus 預設開,document.visibilitychange + window.focus 觸發 refetch
//   - unmount 自動 cancel + 清 timer + 移 listener
//   - fetcher throw 不崩 UI,寫進 error state
//   - deps 變動視同新 instance(重跑整段)
//
// 本 ticket 只新增 hook 本身,call site 替換另開 ticket 處理。

import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";

// in-memory cache(跨 component / 跨 mount 共用,session 內)
const memCache = new Map<string, unknown>();
const LS_PREFIX = "vp-cache:";

function readCache<T>(key: string): T | null {
  if (memCache.has(key)) return memCache.get(key) as T;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      memCache.set(key, parsed);
      return parsed;
    }
  } catch {
    // ignore — quota / parse error
  }
  return null;
}

function writeCache<T>(key: string, data: T): void {
  memCache.set(key, data);
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(data));
  } catch {
    // quota exceeded / serialize error — memory still有,LS skip
  }
}

export interface UseApiOptions {
  intervalMs?: number;
  gate?: boolean;
  idleMs?: number;
  refetchOnVisible?: boolean;
  refetchOnFocus?: boolean;
  deps?: DependencyList;
  // 設了 cacheKey → mount 立刻顯 cached(in-memory + localStorage),背景 fetch 更新
  // (stale-while-revalidate)。PWA reload 體感像沒 reload(立刻看到上次資料)
  cacheKey?: string;
}

export interface UseApiResult<T> {
  data: T | null;
  error: Error | null;
  refetch: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  opts: UseApiOptions = {}
): UseApiResult<T> {
  const {
    intervalMs,
    gate = true,
    idleMs,
    refetchOnVisible = true,
    refetchOnFocus = true,
    deps = [],
    cacheKey,
  } = opts;

  // mount 時若有 cacheKey + cache 存在 → 立刻 hydrate(背景 fetch 仍跑)
  const [data, setData] = useState<T | null>(() =>
    cacheKey ? readCache<T>(cacheKey) : null
  );
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // cacheKey 後續才有(mount 時 undefined,project fetch 完才填)的 case:
  // hydrate 補一次。functional setter 避免覆蓋背景 fetch 拿到的新資料(prev 有就不蓋)
  useEffect(() => {
    if (!cacheKey) return;
    const cached = readCache<T>(cacheKey);
    if (cached !== null) setData((prev) => prev ?? cached);
  }, [cacheKey]);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps 由 caller 控制
  useEffect(() => {
    let cancelled = false;

    const run = () => {
      Promise.resolve()
        .then(() => fetcherRef.current())
        .then((v) => {
          if (cancelled) return;
          setData(v);
          setError(null);
          if (cacheKey) writeCache(cacheKey, v);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e : new Error(String(e)));
        });
    };

    run();

    let timerId: ReturnType<typeof setInterval> | null = null;

    const stopTimer = () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
    const startTimer = () => {
      if (timerId !== null) return;
      if (typeof intervalMs !== "number" || intervalMs <= 0) return;
      const effective = gate ? intervalMs : typeof idleMs === "number" && idleMs > 0 ? idleMs : null;
      if (effective !== null) {
        timerId = setInterval(run, effective);
      }
    };

    // hidden 完全暫停 polling(0 network),visible 立刻 refetch + 恢復 interval
    if (!document.hidden) startTimer();

    const onVisible = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        run();
        startTimer();
      }
    };
    const onFocus = () => {
      run();
    };
    if (refetchOnVisible) document.addEventListener("visibilitychange", onVisible);
    if (refetchOnFocus) window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      stopTimer();
      if (refetchOnVisible) document.removeEventListener("visibilitychange", onVisible);
      if (refetchOnFocus) window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, gate, idleMs, refetchOnVisible, refetchOnFocus, reloadKey, cacheKey, ...deps]);

  return { data, error, refetch };
}

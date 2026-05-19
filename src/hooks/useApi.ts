// useApi — 收斂前端 polling boilerplate
//
// 設計意圖:
// BoardScreen / TicketDrawer / QADrawer / NotificationsScreen 等至少 6 處,
// 各自手寫一份「mount fetch + setTimeout self-reschedule + visibilitychange + cancelled flag + cleanup」
// 的 useEffect 樣板。本 hook 把這段收斂成單一實作:
//   - mount 立即 fetch
//   - intervalMs 設定後輪詢;gate=false 時可選降頻(idleMs)或完全暫停
//   - refetchOnVisible 預設開,document.visibilitychange 觸發 refetch
//   - Page Lifecycle freeze/resume 雙保險(防 Chrome tab 凍結後 catch-up burst)
//   - unmount 自動 cancel + 清 timer + 移 listener
//   - fetcher throw 不崩 UI,寫進 error state
//   - deps 變動視同新 instance(重跑整段)
//
// **deps 用 primitive(string / boolean / number),不要傳 object reference**:
// 否則 parent setState 拿新 ref(內容相同)就會 trigger useEffect 重 fire,造成
// 「mount 已 fetch 又再 fetch」連續重複 request(實證:BoardScreen 用 `[project]`
// 當 deps 導致 mount 時 pipelines / config / branches 各打 2 次)。
//
// **不收 refetchOnFocus**:`window.focus` 在「DevTools 點回 page / 切視窗回來」等
// 場景頻繁 fire,但這些不算「user 真的離開」,refetch 重複又無意義。
// visibilitychange 已 cover 真正的 tab 切換,intervalMs polling cover 時間久的場景,
// 兩者就夠。

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
    let lastRunAt = 0;

    // dedupe 300ms 防 visibility + freeze/resume edge case 重複 fire
    const run = () => {
      const now = Date.now();
      if (now - lastRunAt < 300) return;
      lastRunAt = now;
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

    // self-reschedule setTimeout(不用 setInterval):Chrome tab freeze(hidden > 5 分,
    // Page Lifecycle API)會把 setInterval callback 排隊,resume 時 catch-up 一次全 fire
    // (N 個積壓 → 爆量 request)。self-reschedule = frozen 期間沒 schedule 下一次 →
    // 沒 queue → resume 不爆量。
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const stopTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };
    const scheduleNext = () => {
      if (cancelled) return;
      if (typeof intervalMs !== "number" || intervalMs <= 0) return;
      const effective = gate ? intervalMs : typeof idleMs === "number" && idleMs > 0 ? idleMs : null;
      if (effective === null) return;
      timerId = setTimeout(() => {
        timerId = null;
        run();
        scheduleNext();
      }, effective);
    };
    const startTimer = () => {
      if (timerId !== null) return;
      scheduleNext();
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
    // Chrome Page Lifecycle freeze/resume:visibilitychange 通常先 fire,但某些 edge
    // case(瀏覽器 background tab 直接 freeze 沒 fire visibility)靠這對兜底。
    // 雙保險:stopTimer 冪等,重複呼 OK
    const onFreeze = () => stopTimer();
    const onResume = () => {
      if (!document.hidden) {
        run();
        startTimer();
      }
    };
    if (refetchOnVisible) document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);

    return () => {
      cancelled = true;
      stopTimer();
      if (refetchOnVisible) document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
    };
  }, [intervalMs, gate, idleMs, refetchOnVisible, reloadKey, cacheKey, ...deps]);

  return { data, error, refetch };
}

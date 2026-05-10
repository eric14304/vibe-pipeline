import { createContext, useCallback, useContext, useEffect, useState } from "react";
import "./confirmDialog.css";

export type ConfirmOptions = {
  title: string;
  description?: string;
  // markdown 列表用 \n 分行,UI 用 white-space: pre-wrap 顯示
  confirmLabel?: string;
  cancelLabel?: string;
  // danger 用紅色 confirm 按鈕(刪除 / 重置等危險操作)
  danger?: boolean;
  // 三選一場景:給第三顆 secondary 按鈕(沒設就是普通 binary)
  // 例:merge 前 sync 確認 → primary='先 sync 再 merge' / tertiary='直接 merge' / cancel='取消'
  tertiaryLabel?: string;
  // 顯眼警告 banner — 渲染在 description 上方紅色框,給有資料遺失風險的 case 用
  warning?: string;
};

export type ConfirmResult = "confirm" | "tertiary" | "cancel";

type State = ConfirmOptions & { resolve: (r: ConfirmResult) => void };

const Ctx = createContext<((opts: ConfirmOptions) => Promise<ConfirmResult>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<ConfirmResult>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (!state) return;
      if (e.key === "Escape") {
        state.resolve("cancel");
        setState(null);
      } else if (e.key === "Enter" && !state.danger) {
        // 非 danger:Enter = confirm(primary) 加速操作
        // danger 不接受 Enter 觸發,避免 user 亂打 Enter 觸發資料遺失動作
        state.resolve("confirm");
        setState(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state]);

  function close(r: ConfirmResult) {
    if (!state) return;
    state.resolve(r);
    setState(null);
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div className="confirm-stage" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <button
            type="button"
            className="confirm-scrim"
            onClick={() => close("cancel")}
            aria-label="取消"
          />
          <div className="confirm-card fade-up">
            <div id="confirm-title" className="confirm-title">{state.title}</div>
            {state.warning && (
              <div className="confirm-warning">
                <span className="confirm-warning-icon" aria-hidden>⚠</span>
                <span className="confirm-warning-text">{state.warning}</span>
              </div>
            )}
            {state.description && (
              <div className="confirm-desc">{state.description}</div>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="btn confirm-cancel"
                onClick={() => close("cancel")}
                // danger 時把 autoFocus 給取消,user 亂按 Enter / Space 是取消而非執行
                // biome-ignore lint/a11y/noAutofocus: 為了在 danger confirm 上預設 focus 取消按鈕,降低誤觸風險
                autoFocus={state.danger}
              >
                {state.cancelLabel ?? "取消"}
                <span className="kbd-inline mono">Esc</span>
              </button>
              {state.tertiaryLabel && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => close("tertiary")}
                >
                  {state.tertiaryLabel}
                </button>
              )}
              <button
                type="button"
                className={"btn " + (state.danger ? "btn-danger" : "btn-primary")}
                onClick={() => close("confirm")}
                // 非 danger 才 autoFocus confirm + 顯 ↵ 提示。danger 上不接受 Enter,提示移除
                // biome-ignore lint/a11y/noAutofocus: 非 danger 預期立刻可以 Enter 確認,符合 UX 慣例
                autoFocus={!state.danger}
              >
                {state.confirmLabel ?? "確認"}
                {!state.danger && <span className="kbd-inline mono">↵</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// 預設回 boolean(confirm=true / cancel=false),沒設 tertiaryLabel 時舊呼叫端不用改。
// 設了 tertiaryLabel 想拿三態結果 → 改用 useTriConfirm()。
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm 要在 ConfirmProvider 內用");
  return useCallback(async (opts) => {
    const r = await fn(opts);
    return r === "confirm";
  }, [fn]);
}

export function useTriConfirm(): (opts: ConfirmOptions) => Promise<ConfirmResult> {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useTriConfirm 要在 ConfirmProvider 內用");
  return fn;
}

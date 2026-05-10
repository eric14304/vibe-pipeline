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
};

type State = ConfirmOptions & { resolve: (ok: boolean) => void };

const Ctx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (!state) return;
      if (e.key === "Escape") {
        state.resolve(false);
        setState(null);
      } else if (e.key === "Enter") {
        // 避免在 form input focus 時誤觸 — 但這個 modal 沒 input,Enter = confirm
        state.resolve(true);
        setState(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state]);

  function close(ok: boolean) {
    if (!state) return;
    state.resolve(ok);
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
            onClick={() => close(false)}
            aria-label="取消"
          />
          <div className="confirm-card fade-up">
            <div id="confirm-title" className="confirm-title">{state.title}</div>
            {state.description && (
              <div className="confirm-desc">{state.description}</div>
            )}
            <div className="confirm-actions">
              <button type="button" className="btn confirm-cancel" onClick={() => close(false)}>
                {state.cancelLabel ?? "取消"}
                <span className="kbd-inline mono">Esc</span>
              </button>
              <button
                type="button"
                className={"btn " + (state.danger ? "btn-danger" : "btn-primary")}
                onClick={() => close(true)}
                // biome-ignore lint/a11y/noAutofocus: modal confirm 預期立刻可以 Enter 確認,符合 UX 慣例
                autoFocus
              >
                {state.confirmLabel ?? "確認"}
                <span className="kbd-inline mono">↵</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm 要在 ConfirmProvider 內用");
  return fn;
}

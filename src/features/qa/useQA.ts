import { useCallback, useEffect, useState } from "react";
import * as qaApi from "../../api/qa";
import type { Draft, TicketSpec } from "../../api/qa";

export type QAState = {
  open: boolean;
  pipelineId: string | null;
  draft: Draft | null;
  busy: boolean;
  error: string | null;
};

const INITIAL: QAState = {
  open: false,
  pipelineId: null,
  draft: null,
  busy: false,
  error: null,
};

export function useQA(projectHash: string | null) {
  const [state, setState] = useState<QAState>(INITIAL);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const refreshDrafts = useCallback(async () => {
    if (!projectHash) {
      setDrafts([]);
      return;
    }
    try {
      const list = await qaApi.listDrafts(projectHash);
      setDrafts(list);
    } catch {
      setDrafts([]);
    }
  }, [projectHash]);

  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  // 接續 QA 時:若 draft 最後一條是 user message(代表 AI 還在 backend 跑或沒回完),
  // poll getDraft 等 AI 寫進 disk;同時讓 UI 顯「AI 思考中」(由 derived isWaitingForAI 控)。
  // 3 分鐘 timeout 安全網,避免 AI 失敗後永遠 spin。
  const draftId = state.draft?.draftId;
  const turnsLen = state.draft?.turns.length ?? 0;
  const lastRole =
    turnsLen > 0 ? state.draft?.turns[turnsLen - 1]?.role : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用 derived deps 避免 state.draft ref 變動每次 re-poll
  useEffect(() => {
    if (!projectHash || !draftId || lastRole !== "user") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const d = await qaApi.getDraft(projectHash, draftId);
        if (cancelled) return;
        const newLast = d.turns[d.turns.length - 1];
        if (newLast && newLast.role === "ai") {
          setState((s) => (s.draft?.draftId === d.draftId ? { ...s, draft: d } : s));
        }
      } catch {}
    };
    const interval = setInterval(poll, 3000);
    const timeout = setTimeout(() => {
      cancelled = true;
      clearInterval(interval);
    }, 180_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [projectHash, draftId, lastRole, turnsLen]);

  const draftFor = useCallback(
    (pipelineId: string) => drafts.find((d) => d.pipelineId === pipelineId) ?? null,
    [drafts]
  );

  const open = useCallback(
    async (pipelineId: string) => {
      if (!projectHash) return;
      setState((s) => ({ ...s, open: true, pipelineId, busy: true, error: null }));
      // 接續 QA 時:不靠 in-memory drafts(可能 stale,e.g. 別 tab 改、或 close 後沒同步)
      // 直接打 backend listDrafts 拿最新,再決定 resume / start
      let latest: Draft[] = [];
      try {
        latest = await qaApi.listDrafts(projectHash);
        setDrafts(latest);
      } catch {
        // 拉清單失敗 → 用 in-memory 的 drafts fallback,不擋
        latest = drafts;
      }
      const existing = latest.find((d) => d.pipelineId === pipelineId);
      if (existing) {
        try {
          const d = await qaApi.getDraft(projectHash, existing.draftId);
          setState({ open: true, pipelineId, draft: d, busy: false, error: null });
        } catch (e) {
          setState({
            open: true,
            pipelineId,
            draft: null,
            busy: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }
      try {
        const { draft } = await qaApi.startQA(projectHash, pipelineId);
        setState({ open: true, pipelineId, draft, busy: false, error: null });
        await refreshDrafts();
      } catch (e) {
        setState({
          open: true,
          pipelineId,
          draft: null,
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [projectHash, drafts, refreshDrafts]
  );

  // close 時若 draft 還是空(沒任何 user turn、沒 spec 進展)→ auto-cancel,
  // 不留殘骸佔 rail QA badge。非空 draft 也要 refreshDrafts,確保 hasActiveDraft / draftFor 正確
  const close = useCallback(async () => {
    const draft = state.draft;
    setState(INITIAL);
    if (!projectHash || !draft) return;
    const userTurns = draft.turns.filter((t) => t.role === "user").length;
    const specEntries = draft.spec ? Object.keys(draft.spec).length : 0;
    if (userTurns === 0 && specEntries === 0) {
      try {
        await qaApi.cancelQA(projectHash, draft.draftId);
      } catch {
        // 失敗就算了,下次 open 同 pipeline 會 resume 看到空 draft
      }
    }
    // 永遠 refresh,讓 FocusColumn 的「+ ticket / 接續 QA」label 即時對齊 disk 狀態
    await refreshDrafts();
  }, [projectHash, state.draft, refreshDrafts]);

  const sendTurn = useCallback(
    async (userMessage: string) => {
      if (!projectHash || !state.draft) return;
      const optimistic: Draft = {
        ...state.draft,
        turns: [
          ...state.draft.turns,
          { role: "user", message: userMessage, ts: Date.now() },
        ],
      };
      setState((s) => ({ ...s, draft: optimistic, busy: true, error: null }));
      try {
        const { draft } = await qaApi.turnQA(projectHash, state.draft.draftId, userMessage);
        setState((s) => ({ ...s, draft, busy: false }));
      } catch (e) {
        setState((s) => ({
          ...s,
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [projectHash, state.draft]
  );

  const cancel = useCallback(async () => {
    if (!projectHash || !state.draft) {
      setState(INITIAL);
      return;
    }
    setState((s) => ({ ...s, busy: true }));
    try {
      await qaApi.cancelQA(projectHash, state.draft.draftId);
    } catch {}
    setState(INITIAL);
    await refreshDrafts();
  }, [projectHash, state.draft, refreshDrafts]);

  // 跑 split-check 預覽(不寫)。回 { count, specs }。
  const previewSplit = useCallback(
    async (edits?: Partial<TicketSpec>) => {
      if (!projectHash || !state.draft) return null;
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        return await qaApi.previewSplitQA(projectHash, state.draft.draftId, edits);
      } finally {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [projectHash, state.draft]
  );

  // finalize: splitInto 帶就寫 N 張,沒帶就寫 1 張(原本 spec)。
  // 寫成功後關 drawer
  const finalize = useCallback(
    async (edits?: Partial<TicketSpec>, splitInto?: TicketSpec[]): Promise<unknown | null> => {
      if (!projectHash || !state.draft) return null;
      const draftId = state.draft.draftId;
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const result = await qaApi.finalizeQA(projectHash, draftId, edits, splitInto);
        setState(INITIAL);
        await refreshDrafts();
        return result;
      } catch (e) {
        setState((s) => ({
          ...s,
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        }));
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
    [projectHash, state.draft, refreshDrafts]
  );

  return {
    state,
    drafts,
    draftFor,
    open,
    close,
    sendTurn,
    cancel,
    finalize,
    previewSplit,
    refreshDrafts,
  };
}

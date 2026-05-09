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

  const draftFor = useCallback(
    (pipelineId: string) => drafts.find((d) => d.pipelineId === pipelineId) ?? null,
    [drafts]
  );

  const open = useCallback(
    async (pipelineId: string) => {
      if (!projectHash) return;
      setState((s) => ({ ...s, open: true, pipelineId, busy: true, error: null }));
      const existing = drafts.find((d) => d.pipelineId === pipelineId);
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

  const close = useCallback(() => {
    setState(INITIAL);
  }, []);

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

  const finalize = useCallback(
    async (edits?: Partial<TicketSpec>): Promise<unknown | null> => {
      if (!projectHash || !state.draft) return null;
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const result = await qaApi.finalizeQA(projectHash, state.draft.draftId, edits);
        setState(INITIAL);
        await refreshDrafts();
        return result;
      } catch (e) {
        setState((s) => ({
          ...s,
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        }));
        return null;
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
    refreshDrafts,
  };
}

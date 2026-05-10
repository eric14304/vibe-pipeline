// 持久化型別 source of truth 在 shared/types.ts(凡是寫進 pipeline.json 的欄位都在那);
// 本檔僅做轉發,保留歷史 import 路徑相容。UI-only 計算欄位若有日後再加。
export type {
  Pipeline,
  PipelineState,
  Ticket,
  TicketStatus,
  TicketMode,
  IterStage,
  IterState,
  IterRound,
  Verdict,
  CommitRef,
} from "../../shared/types";

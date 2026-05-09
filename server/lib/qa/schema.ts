export const QA_REPLY_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    complete: { type: "boolean" },
    spec: {
      type: ["object", "null"],
      properties: {
        title: { type: "string" },
        goal: { type: "string" },
        acceptance: { type: "array", items: { type: "string" } },
        prompt: { type: "string" },
        mode: { type: "string", enum: ["step", "iter"] },
      },
      required: ["title", "goal", "acceptance", "prompt", "mode"],
    },
  },
  required: ["message", "options", "complete"],
} as const;

export type TicketSpec = {
  title: string;
  goal: string;
  acceptance: string[];
  prompt: string;
  mode: "step" | "iter";
};

// 對話中:spec 是目前已收齊的部分(可選欄位)
// complete=true:spec 必須全 5 欄齊全
export type PartialSpec = Partial<TicketSpec>;

export type QAReply = {
  message: string;
  options: string[];
  optionsMode?: "single" | "multi"; // 預設 single;多項可同時成立的問題用 multi
  complete: boolean;
  spec: PartialSpec | null;
};

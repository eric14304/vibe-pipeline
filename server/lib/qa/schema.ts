export type { TicketSpec, PartialSpec, QAReply } from "../../../shared/types";
export { isCompleteSpec } from "../../../shared/types";

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

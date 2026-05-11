// CLI adapter helper:依 taskClass 選擇對應 adapter。
// 目前永遠回 ClaudeAdapter,Ticket 2 起會加 codex 分支(由 user config 決定 / per-task class 切換)。

import type { CliAdapter, TaskClass } from "./adapter";
import { ClaudeAdapter } from "./claudeAdapter";

export type { CliAdapter, TaskClass } from "./adapter";
export type {
  SpawnOpts,
  QASpawnOpts,
  RunnerSpawnOpts,
  SplitSpawnOpts,
  MergeSpawnOpts,
  CliCapabilities,
  SpawnedProcess,
} from "./adapter";
export { ClaudeAdapter } from "./claudeAdapter";

const claudeAdapter = new ClaudeAdapter();

export function getAdapter(_taskClass: TaskClass): CliAdapter {
  // Ticket 2 才依 taskClass 切 ClaudeAdapter / CodexAdapter。當前一律走 claude。
  return claudeAdapter;
}

import type {
  Effort,
  ModelName,
  PushEventKey,
  TaskClass,
  TaskModelConfig,
  UserConfig,
} from "../../shared/types";
import { call } from "./_client";

export type { UserConfig, TaskClass, TaskModelConfig, ModelName, Effort, PushEventKey };

export type UserConfigPatch = {
  defaults?: Partial<Record<TaskClass, Partial<TaskModelConfig>>>;
  pushEvents?: Partial<Record<PushEventKey, boolean>>;
};

export function getUserConfig(): Promise<UserConfig> {
  return call<UserConfig>("/api/user/config");
}

export function updateUserConfig(patch: UserConfigPatch, signal?: AbortSignal): Promise<UserConfig> {
  return call<UserConfig>("/api/user/config", {
    method: "PUT",
    body: patch,
    signal,
  });
}

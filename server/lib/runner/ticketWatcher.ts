// 監看 <target>/.vibe-pipeline/pipelines/<id>.json 的變化,
// diff ticket.status 變動 → emit notif (ticket_started / ticket_done / ticket_failed)
// 主 agent 透過 Bash 寫 pipeline.json,我們不依賴主 agent 主動 emit。

import { watch, type FSWatcher } from "node:fs";
import * as pipelineDir from "../pipelineDir";
import * as notifs from "../notifs/store";
import type { NotifEventType } from "../../../shared/types";

type Active = { unwatch: () => void };
const watchers = new Map<string, Active>(); // key: <projHash>:<pipelineId>

function key(projectHash: string, pipelineId: string): string {
  return `${projectHash}:${pipelineId}`;
}

function statusToEvent(status: string): NotifEventType | null {
  if (status === "running") return "ticket_started";
  if (status === "done") return "ticket_done";
  if (status === "failed" || status === "failed_iter_limit" || status === "failed_transient")
    return "ticket_failed";
  return null;
}

type TicketLite = { id?: string; title?: string; status?: string; n?: number };

async function snapshot(projectPath: string, pipelineId: string): Promise<Map<string, string>> {
  const p = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    tickets?: TicketLite[];
  } | null;
  const out = new Map<string, string>();
  if (p && Array.isArray(p.tickets)) {
    for (const t of p.tickets) {
      if (t.id && t.status) out.set(t.id, t.status);
    }
  }
  return out;
}

export async function start(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
}): Promise<void> {
  const k = key(opts.projectHash, opts.pipelineId);
  if (watchers.has(k)) return;

  const file = pipelineDir.pipelineFile(opts.projectPath, opts.pipelineId);
  let last = await snapshot(opts.projectPath, opts.pipelineId);
  let debounce: ReturnType<typeof setTimeout> | null = null;

  let w: FSWatcher;
  try {
    w = watch(file, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        try {
          const cur = await snapshot(opts.projectPath, opts.pipelineId);
          const p = (await pipelineDir.readPipeline(
            opts.projectPath,
            opts.pipelineId
          )) as { tickets?: TicketLite[]; name?: string } | null;
          const tickets = (p?.tickets ?? []) as TicketLite[];
          for (const [tid, status] of cur) {
            const prev = last.get(tid);
            if (prev === status) continue;
            const ev = statusToEvent(status);
            if (!ev) continue;
            const t = tickets.find((x) => x.id === tid);
            const titlePart = t?.title || tid;
            const numPart = t?.n != null ? `#${t.n} ` : "";
            notifs.emit(opts.projectPath, {
              type: ev,
              title: `${numPart}${titlePart}: ${status}`,
              pipelineId: opts.pipelineId,
            });
          }
          last = cur;
        } catch (e) {
          console.error(`[ticketWatcher ${opts.pipelineId}] error:`, e);
        }
      }, 200);
    });
  } catch (e) {
    console.error(`[ticketWatcher ${opts.pipelineId}] watch failed:`, e);
    return;
  }

  watchers.set(k, {
    unwatch: () => {
      try {
        w.close();
      } catch {}
      if (debounce) clearTimeout(debounce);
    },
  });
}

export function stop(opts: { projectHash: string; pipelineId: string }): void {
  const k = key(opts.projectHash, opts.pipelineId);
  const a = watchers.get(k);
  if (!a) return;
  a.unwatch();
  watchers.delete(k);
}

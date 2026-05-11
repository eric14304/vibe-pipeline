import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../shell/AppShell";
import { Rail } from "../../shell/Rail";
import { TopBar } from "../../shell/TopBar";
import { FocusColumn } from "./FocusColumn";
import { TicketDrawer } from "./TicketDrawer";
import { CreateCard, CreatePlaceholder } from "../pipelineCreate/CreateCard";
import { EmptyProject } from "./EmptyProject";
import { InitPopup } from "../init/InitPopup";
import { InboxColumn } from "../notifications/InboxColumn";
import { QADrawer } from "../qa/QADrawer";
import { useQA } from "../qa/useQA";
import { SettingsPopover } from "../settings/SettingsPopover";
import { GearIcon } from "../../ui/icons";
import type { NotifItem } from "../../types/notif";
import { useActiveProjectHash } from "../../hooks/useActiveProject";
import * as api from "../../api/projects";
import * as qaApi from "../../api/qa";
import type { Pipeline, Ticket } from "../../types/pipeline";
import type { Project } from "../../../shared/types";
import type { InboxFilter, InboxState } from "../../types/notif";

export function BoardScreen({
  density = "medium",
  startCreating = false,
}: {
  density?: "compact" | "medium";
  startCreating?: boolean;
}) {
  const { hash } = useActiveProjectHash();
  const [project, setProject] = useState<Project | null>(null);
  // 切兩種 error:
  // - loadError = 開專案時 status fetch 失敗 → 全屏 EmptyProject
  // - actionError = 跑 / 暫停 / 刪 / 建 等動作失敗 → top banner 顯示+自動消
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [creating, setCreating] = useState(startCreating);
  const [tick, setTick] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [popupDismissed, setPopupDismissed] = useState(false);

  const qa = useQA(hash);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [splittingTicketId, setSplittingTicketId] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [maxParallel, setMaxParallel] = useState<number>(0);
  const [defaultAutoMerge, setDefaultAutoMerge] = useState<boolean>(false);

  const [inboxState, setInboxState] = useState<InboxState>("collapsed");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [items, setItems] = useState<NotifItem[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const unreadCount = items.filter((i) => i.unread).length;

  function markRead(id: string) {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, unread: false } : it)));
    if (hash) api.markNotifRead(hash, id).catch(() => {});
  }
  function dismissNotif(id: string) {
    setItems((arr) => arr.filter((it) => it.id !== id));
    if (hash) api.dismissNotif(hash, id).catch(() => {});
  }
  function markAllRead() {
    setItems((arr) => arr.map((it) => ({ ...it, unread: false })));
    if (hash) api.markAllNotifsRead(hash).catch(() => {});
  }
  function focusNotif(id: string, pipelineId?: string) {
    setInboxState("expanded");
    if (pipelineId) setActiveId(pipelineId);
    setHighlightId(id);
    markRead(id);
  }

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Fetch notifs every 3s while project is open + visibility/focus refetch
  useEffect(() => {
    if (!hash) {
      setItems([]);
      return;
    }
    let cancelled = false;
    function fetchNotifs() {
      if (!hash) return;
      api
        .listNotifs(hash)
        .then((records) => {
          if (cancelled) return;
          setItems(records.map(toNotifItem));
        })
        .catch(() => {});
    }
    fetchNotifs();
    const id = setInterval(fetchNotifs, 3000);
    const onVis = () => {
      if (!document.hidden) fetchNotifs();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", fetchNotifs);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", fetchNotifs);
    };
  }, [hash]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setCreating(startCreating);
  }, [startCreating]);

  useEffect(() => {
    if (!creating) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCreating(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [creating]);

  // actionError 自動消(6s),跟切換 project 一起 reset
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 6000);
    return () => clearTimeout(t);
  }, [actionError]);

  // browser tab title 反映 project / pipeline 狀態(背景 tab 也看得見)
  useEffect(() => {
    const base = "vibe-pipeline";
    if (!project) {
      document.title = base;
      return;
    }
    const projectName = project.name;
    const running = pipelines.find(
      (p) => p.state === "running" || p.state === "stopping"
    );
    const blockingNotifs = items.filter((i) => i.sev === "block" && i.unread).length;
    let prefix = "";
    if (blockingNotifs > 0) prefix = `[!${blockingNotifs}] `;
    else if (running) prefix = `[▶] `;
    else if (unreadCount > 0) prefix = `(${unreadCount}) `;
    const main = running ? `${running.name} 跑中` : projectName;
    document.title = `${prefix}${main} · ${base}`;
    return () => {
      document.title = base;
    };
  }, [project, pipelines, items, unreadCount]);

  // hash 切換時 reset 該 project 專屬 UI state
  // biome-ignore lint/correctness/useExhaustiveDependencies: hash is the intentional trigger
  useEffect(() => {
    setPopupDismissed(false);
    setActionError(null);
  }, [hash]);

  // reloadKey 是手動 force-refetch counter,改變即使內容沒變也要重抓
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is a force-refetch trigger
  useEffect(() => {
    if (!hash) {
      setProject(null);
      setPipelines([]);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    api
      .status(hash)
      .then((p) => {
        if (cancelled) return;
        setProject(p);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [hash, reloadKey]);

  // Pipelines fetch + polling:
  // - 永遠跑 1.5s interval(原本 gate 在「有 running pipeline」會被 inactive tab 的 setInterval 節流卡死,
  //   切回 tab 時看到舊的 running 直到下一次 fire)
  // - 加 visibilitychange / focus refetch,tab 重新可見立刻 sync
  // Fetch branch list once when project loads (for CreateCard base picker)
  useEffect(() => {
    if (!project?.hasGit) {
      setBranches([]);
      return;
    }
    api
      .listBranches(project.hash)
      .then((bs) => setBranches(bs))
      .catch(() => setBranches([]));
  }, [project]);

  // max_parallel 只在 hash / hasInit 變動時抓一次。Settings 儲存完透過 onConfigSaved
  // 或 reloadKey 也會 trigger,不另開 polling(避免 1.5s 衝撞 listPipelines)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is a force-refetch trigger
  useEffect(() => {
    if (!project?.hasInit) {
      setMaxParallel(0);
      return;
    }
    let cancelled = false;
    api
      .getConfig(project.hash)
      .then((c) => {
        if (cancelled) return;
        setMaxParallel(c.defaults.max_parallel);
        setDefaultAutoMerge(!!c.defaults.auto_merge);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project, reloadKey]);

  // reloadKey 同上 — force-refetch trigger
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is a force-refetch trigger
  useEffect(() => {
    if (!project?.hasInit) {
      setPipelines([]);
      return;
    }
    let cancelled = false;
    const fetchPipelines = () => {
      api
        .listPipelines(project.hash)
        .then((arr) => {
          if (cancelled) return;
          const sorted = [...((arr as Pipeline[]) ?? [])].sort((a, b) =>
            a.id < b.id ? 1 : a.id > b.id ? -1 : 0
          );
          setPipelines(sorted);
          if (sorted.length > 0) setActiveId((id) => id || sorted[0].id);
        })
        .catch(() => {});
    };
    fetchPipelines();
    const id = setInterval(fetchPipelines, 1500);
    const onVis = () => {
      if (!document.hidden) fetchPipelines();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", fetchPipelines);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", fetchPipelines);
    };
  }, [project, reloadKey]);

  const active = useMemo(
    () => pipelines.find((p) => p.id === activeId) || pipelines[0],
    [activeId, pipelines]
  );

  async function handleCreate({
    name,
    baseBranch,
    autoMerge,
  }: {
    name: string;
    baseBranch: string;
    autoMerge: boolean;
  }) {
    if (!project) return;
    const body = {
      name,
      branch: "pipeline/" + name,
      baseBranch,
      state: "planning" as const,
      tickets: [],
      autoMerge,
    };
    try {
      const created = (await api.createPipeline(project.hash, body)) as Pipeline;
      setPipelines((arr) => [created, ...arr]);
      setActiveId(created.id);
      setCreating(false);
      setActionError(`✓ pipeline "${name}" 已建立`);
    } catch (e) {
      setActionError(`建立 pipeline 失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // running 條數從 pipelines 推(pipelines 已 1.5s polling,不另起 setInterval)。
  // 視覺上 stopping 還佔 slot,算進去。
  const runningCount = pipelines.filter(
    (p) => p.state === "running" || p.state === "stopping"
  ).length;
  // queue 順位:state=queued 的依 id desc(列表 sort 順序)排,但 backend FIFO 是 enqueue 時間。
  // 沒 enqueueAt 持久化,只能近似 — 顯示順位從 1 起算同一批 queued 的 index。
  // (跨 server restart 會 reset 到 paused,reset 後重排 OK。)
  const queuedIds = pipelines
    .filter((p) => p.state === "queued")
    .map((p) => p.id)
    .sort();
  function queuePositionOf(pid: string): number {
    const i = queuedIds.indexOf(pid);
    return i < 0 ? 0 : i + 1;
  }

  const topBar = (
    <TopBar
      runningCount={runningCount}
      maxParallel={maxParallel}
      settingsSlot={
        <SettingsButton
          hash={hash}
          onConfigSaved={(cfg) => {
            setMaxParallel(cfg.defaults.max_parallel);
            setDefaultAutoMerge(!!cfg.defaults.auto_merge);
          }}
        />
      }
    />
  );
  // actionError 用右下角小 toast 浮現,別用 NotifBanner(那是 prototype 用,真 notif 走 inbox)
  const actionToast = actionError ? (
    <div
      role="alert"
      className="action-toast"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2000,
        maxWidth: 420,
        padding: "10px 14px 10px 12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--failed)",
        borderLeft: "3px solid var(--failed)",
        borderRadius: 6,
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        fontSize: 12.5,
        lineHeight: 1.45,
        color: "var(--fg)",
      }}
    >
      <span style={{ flex: 1, wordBreak: "break-word" }}>{actionError}</span>
      <button type="button"
        onClick={() => setActionError(null)}
        title="關閉"
        aria-label="關閉"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          color: "var(--fg-faint)",
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  ) : null;
  const inboxAside = (
    <InboxColumn
      state={inboxState}
      setState={setInboxState}
      items={items}
      filter={filter}
      setFilter={setFilter}
      unreadCount={unreadCount}
      highlightId={highlightId}
      onMarkRead={markRead}
      onDismiss={dismissNotif}
      onMarkAllRead={markAllRead}
      onItemClick={focusNotif}
    />
  );
  const shellRootClass = "notif-root is-inbox-" + inboxState;

  if (!hash) {
    return (
      <AppShell
        density={density}
        rootClassName={shellRootClass}
        topBar={topBar}
        rail={<Rail pipelines={[]} activeId="" onSelect={() => {}} />}
        main={<EmptyProject />}
        aside={inboxAside}
      />
    );
  }

  if (loadError) {
    return (
      <AppShell
        density={density}
        rootClassName={shellRootClass}
        topBar={topBar}
        rail={<Rail pipelines={[]} activeId="" onSelect={() => {}} />}
        main={<EmptyProject message="找不到這個專案" hint={loadError} />}
        aside={inboxAside}
      />
    );
  }

  if (!project) {
    return (
      <AppShell
        density={density}
        rootClassName={shellRootClass}
        topBar={topBar}
        rail={<Rail pipelines={[]} activeId="" onSelect={() => {}} />}
        main={<EmptyProject message="載入中…" hint="" pointToTopBar={false} />}
        aside={inboxAside}
      />
    );
  }

  const initOverlay = !project.hasInit && !popupDismissed ? (
    <InitPopup
      project={project}
      onInitialized={(next) => {
        setProject(next);
        setReloadKey((k) => k + 1);
      }}
      onDismiss={() => setPopupDismissed(true)}
    />
  ) : null;

  const qaOverlay = qa.state.open && qa.state.pipelineId ? (
    <QADrawer
      pipelineName={
        pipelines.find((p) => p.id === qa.state.pipelineId)?.name ?? qa.state.pipelineId
      }
      draft={qa.state.draft}
      busy={qa.state.busy}
      error={qa.state.error}
      onSendTurn={qa.sendTurn}
      onCancel={qa.cancel}
      onClose={qa.close}
      onFinalize={async (edits, splitInto) => {
        // QA AI 已在對話中提案 splitInto(若範圍多件)→ QADrawer 上 user 已選好拆/保 1。
        // 這裡直接 finalize,沒額外 AI call,瞬間關 drawer。
        try {
          const result = (await qa.finalize(edits, splitInto)) as
            | { pipeline: Pipeline; tickets: Array<{ id: string }>; splitCount: number }
            | null;
          if (result) {
            setPipelines((arr) =>
              arr.map((p) => (p.id === result.pipeline.id ? result.pipeline : p))
            );
            setActionError(
              result.splitCount > 1
                ? `✓ 已建立 ${result.splitCount} 張 ticket`
                : "✓ ticket 已建立"
            );
          }
        } catch (e) {
          setActionError(`送出 ticket 失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      }}
    />
  ) : null;

  // Re-pick latest ticket data when pipelines update so drawer reflects polled changes
  const liveTicket = openTicket && active
    ? active.tickets.find((t) => t.id === openTicket.id) ?? openTicket
    : null;
  const ticketOverlay = liveTicket && active ? (
    <TicketDrawer
      ticket={liveTicket}
      pipelineName={active.name}
      pipelineBranch={active.branch}
      pipelineId={active.id}
      projectHash={project.hash}
      onClose={() => setOpenTicket(null)}
      onResetTicket={async (ticketId) => {
        if (!project || !active) return;
        const next: Pipeline = {
          ...active,
          // pipeline.state 也要回 planning,讓 RunButton 重出現
          state: "planning",
          tickets: active.tickets.map((t) => {
            if (t.id !== ticketId) return t;
            // strip iter/commits/liveLog/reason,status 回 draft
            const { iter: _i, commits: _c, liveLog: _l, reason: _r, ...rest } = t;
            void _i; void _c; void _l; void _r;
            return { ...rest, status: "draft" };
          }),
        };
        try {
          await api.savePipeline(project.hash, active.id, next);
          setReloadKey((k) => k + 1);
          setActionError("✓ ticket 已重置回 draft");
        } catch (e) {
          setActionError(`重置 ticket 失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      }}
      isSplitting={splittingTicketId === openTicket?.id}
      onSplitTicket={async (ticketId) => {
        if (!project || !active) return;
        setSplittingTicketId(ticketId);
        try {
          const r = await qaApi.splitTicket(project.hash, active.id, ticketId);
          if ("nothingToSplit" in r) {
            setActionError("✓ AI 認為這張 ticket 不需拆");
          } else {
            setActionError(`✓ 已拆成 ${r.count} 張 ticket`);
            setOpenTicket(null); // 關 drawer,讓 user 看到新 ticket 列表
          }
          setReloadKey((k) => k + 1);
        } catch (e) {
          setActionError(`AI 拆分失敗: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setSplittingTicketId(null);
        }
      }}
      onDeleteTicket={async (ticketId) => {
        if (!project || !active) return;
        try {
          await qaApi.deleteTicket(project.hash, active.id, ticketId);
          setOpenTicket(null);
          setReloadKey((k) => k + 1);
          setActionError("✓ ticket 已刪除");
        } catch (e) {
          setActionError(`刪除 ticket 失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      }}
      onToggleMode={async (ticketId, nextMode) => {
        if (!project || !active) return;
        const next: Pipeline = {
          ...active,
          tickets: active.tickets.map((t) =>
            t.id === ticketId ? { ...t, mode: nextMode } : t
          ),
        };
        try {
          await api.savePipeline(project.hash, active.id, next);
          setReloadKey((k) => k + 1);
        } catch (e) {
          setActionError(`切換 mode 失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      }}
      onChangeIterLimit={async (ticketId, limit) => {
        if (!project || !active) return;
        const next: Pipeline = {
          ...active,
          tickets: active.tickets.map((t) =>
            t.id === ticketId ? { ...t, iterLimit: limit } : t
          ),
        };
        try {
          await api.savePipeline(project.hash, active.id, next);
          setReloadKey((k) => k + 1);
        } catch (e) {
          setActionError(`改 iter 上限失敗: ${e instanceof Error ? e.message : String(e)}`);
        }
      }}
    />
  ) : null;

  const overlay = (
    <>
      {initOverlay}
      {qaOverlay}
      {ticketOverlay}
      {actionToast}
    </>
  );

  const isUninit = !project.hasInit;

  return (
    <AppShell
      density={density}
      rootClassName={shellRootClass}
      topBar={topBar}
      rail={
        <Rail
          pipelines={pipelines}
          activeId={activeId}
          onSelect={setActiveId}
          creating={creating}
          onStartCreate={
            isUninit ? () => setPopupDismissed(false) : () => setCreating(true)
          }
          addLabel={isUninit ? "開始初始化" : "新 pipeline"}
          draftPipelineIds={new Set(qa.drafts.map((d) => d.pipelineId))}
          createSlot={
            <CreateCard
              onCancel={() => setCreating(false)}
              onSubmit={handleCreate}
              existingNames={pipelines.map((p) => p.name)}
              branches={branches}
              defaultAutoMerge={defaultAutoMerge}
            />
          }
        />
      }
      main={
        creating ? (
          <CreatePlaceholder />
        ) : isUninit ? (
          <EmptyProject
            message="這個專案還沒初始化"
            hint="點左邊「開始初始化」打開引導,或在上方專案切換器選其他資料夾。"
            pointToTopBar={false}
          />
        ) : pipelines.length === 0 ? (
          <EmptyProject
            message="還沒任何 pipeline"
            hint="點左邊「+ 新 pipeline」建立第一條。"
            pointToTopBar={false}
          />
        ) : (
          <FocusColumn
            pipeline={active}
            tick={tick}
            projectHash={project.hash}
            queuePosition={queuePositionOf(active.id)}
            splittingTicketId={splittingTicketId}
            onAddTicket={(pid) => qa.open(pid)}
            hasActiveDraft={!!qa.draftFor(active.id)}
            onTicketClick={(t) => setOpenTicket(t)}
            onRun={async (pid) => {
              if (!project) return;
              try {
                await api.runPipeline(project.hash, pid);
                setReloadKey((k) => k + 1);
                setActionError("✓ pipeline 已啟動,runner 接手中…");
              } catch (e) {
                setActionError(`開始運行失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onPause={async (pid) => {
              if (!project) return;
              try {
                await api.pausePipeline(project.hash, pid);
                setReloadKey((k) => k + 1);
                setActionError("✓ 已送出暫停請求(等 ticket 收完)");
              } catch (e) {
                setActionError(`暫停失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onDelete={async (pid) => {
              if (!project) return;
              const targetName = pipelines.find((p) => p.id === pid)?.name ?? pid;
              try {
                await api.deletePipeline(project.hash, pid);
                // 從本地移除,順便切到下一條(若有)
                setPipelines((arr) => {
                  const next = arr.filter((p) => p.id !== pid);
                  if (pid === activeId) setActiveId(next[0]?.id ?? "");
                  return next;
                });
                setActionError(`✓ pipeline "${targetName}" 已刪除`);
              } catch (e) {
                setActionError(`刪除失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onRename={async (pid, newName) => {
              if (!project) return;
              const target = pipelines.find((p) => p.id === pid);
              if (!target) return;
              // pipeline.id 與 .json filename 不變;branch 也不變(已 push 出去的可能有人引用)
              const next: Pipeline = { ...target, name: newName };
              try {
                await api.savePipeline(project.hash, pid, next);
                setPipelines((arr) =>
                  arr.map((p) => (p.id === pid ? next : p))
                );
                setActionError(`✓ 已改名為 "${newName}"`);
              } catch (e) {
                setActionError(`改名失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onResetAll={async (pid) => {
              if (!project) return;
              const target = pipelines.find((p) => p.id === pid);
              if (!target) return;
              const next: Pipeline = {
                ...target,
                state: "planning",
                tickets: target.tickets.map((t) => {
                  const isTerminal =
                    t.status === "done" ||
                    t.status === "failed" ||
                    t.status === "failed_iter_limit" ||
                    t.status === "failed_transient";
                  if (!isTerminal) return t;
                  const { iter: _i, commits: _c, liveLog: _l, reason: _r, ...rest } = t;
                  void _i; void _c; void _l; void _r;
                  return { ...rest, status: "draft" };
                }),
              };
              try {
                await api.savePipeline(project.hash, pid, next);
                setReloadKey((k) => k + 1);
                const cnt = next.tickets.filter((t) => t.status === "draft").length;
                setActionError(`✓ 已重置 ${cnt} 張 ticket 回 draft`);
              } catch (e) {
                setActionError(`重跑全部失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            existingNames={pipelines.map((p) => p.name)}
            onRevealWorktree={async (pid) => {
              if (!project) return;
              try {
                await api.revealWorktree(project.hash, pid);
              } catch (e) {
                setActionError(`開啟 worktree 失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onPruneWorktree={async (pid) => {
              if (!project) return;
              try {
                await api.pruneWorktree(project.hash, pid);
                setReloadKey((k) => k + 1);
                setActionError("✓ worktree 已清除");
              } catch (e) {
                setActionError(`清除 worktree 失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onMerge={async (pid) => {
              if (!project) return;
              // merge 流程本身已含「AI 解衝突」+ 「事後 auto-rebase worktree」,pre-sync 多餘,直接走
              try {
                await api.mergePipeline(project.hash, pid);
                setReloadKey((k) => k + 1);
                setActionError("✓ AI 合併已啟動,runner 接手中…");
              } catch (e) {
                setActionError(`觸發 AI 合併失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onSync={async (pid) => {
              if (!project) return;
              try {
                const r = await api.syncPipeline(project.hash, pid);
                setReloadKey((k) => k + 1);
                if (r.nothingToDo) {
                  setActionError("✓ worktree 已是最新,沒事可同步");
                } else {
                  setActionError(`✓ AI 同步已啟動(落後 ${r.behind} commit),runner 接手中…`);
                }
              } catch (e) {
                setActionError(`觸發 AI 同步失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            onToggleAutoMerge={async (pid, nextValue) => {
              if (!project) return;
              const target = pipelines.find((p) => p.id === pid);
              if (!target) return;
              const next: Pipeline = { ...target, autoMerge: nextValue };
              // optimistic 先更
              setPipelines((arr) => arr.map((p) => (p.id === pid ? next : p)));
              try {
                await api.savePipeline(project.hash, pid, next);
                setActionError(
                  nextValue
                    ? "✓ 已啟用自動合併"
                    : "✓ 已關閉自動合併"
                );
              } catch (e) {
                // rollback
                setPipelines((arr) => arr.map((p) => (p.id === pid ? target : p)));
                setActionError(`切換自動合併失敗: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          />
        )
      }
      overlay={overlay}
      aside={inboxAside}
    />
  );
}

// ── Notif adapter: backend NotifRecord → frontend NotifItem ──
const SEV_BY_EVENT: Record<string, "block" | "info" | "muted"> = {
  pipeline_started: "muted",
  pipeline_paused: "info",
  pipeline_ready_to_merge: "info",
  pipeline_failed: "block",
  pipeline_merged: "info",
  pipeline_merge_cleanup_failed: "info",
  pipeline_auto_merge_started: "info",
  merge_started: "muted",
  merge_blocked: "block",
  ticket_started: "muted",
  ticket_done: "info",
  ticket_failed: "block",
  iter_critic_pass: "info",
  iter_critic_fail: "muted",
  budget_warn: "info",
  budget_hard_cap: "block",
  runner_stall: "block",
  runner_crash: "block",
};

function iconFor(sev: "block" | "info" | "muted"): { icon: string; iconKind: "alert" | "warn" | "check" | "iter" | "skill" | "dot" } {
  if (sev === "block") return { icon: "🚨", iconKind: "alert" };
  if (sev === "info") return { icon: "✓", iconKind: "check" };
  return { icon: "·", iconKind: "dot" };
}

function fmtTs(ms: number): { ts: string; since: number } {
  const since = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (since < 60) return { ts: "just now", since };
  if (since < 3600) return { ts: `${Math.floor(since / 60)} min`, since };
  if (since < 86400) return { ts: `${Math.floor(since / 3600)} h`, since };
  return { ts: `${Math.floor(since / 86400)} d`, since };
}

// Gear button + Settings popover。原本在 shell/TopBar 內,因為 SettingsPopover 屬 features/
// 不該被 shell 認識,改由 BoardScreen 注入 TopBar 的 settingsSlot。
function SettingsButton({
  hash,
  onConfigSaved,
}: {
  hash: string | null;
  onConfigSaved?: (cfg: api.ProjectConfig) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        className={"icon-btn" + (open ? " is-active" : "")}
        title={hash ? "設定" : "選擇 project 後可開設定"}
        onClick={() => hash && setOpen((o) => !o)}
        disabled={!hash}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <GearIcon />
      </button>
      {hash && (
        <SettingsPopover
          hash={hash}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={(cfg) => {
            onConfigSaved?.(cfg);
          }}
          anchorRef={btnRef}
        />
      )}
    </span>
  );
}

function toNotifItem(r: api.NotifRecord): NotifItem {
  const sev = (SEV_BY_EVENT[r.type] ?? "muted") as "block" | "info" | "muted";
  const { icon, iconKind } = iconFor(sev);
  const { ts, since } = fmtTs(r.ts);
  return {
    id: r.id,
    sev,
    icon,
    iconKind,
    title: r.title,
    sub: r.sub ?? "",
    ts,
    since,
    unread: r.unread,
    pipelineId: r.pipelineId,
  };
}

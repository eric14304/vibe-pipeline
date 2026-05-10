import { useEffect, useMemo, useState } from "react";
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
import type { NotifItem } from "../../types/notif";
import { useActiveProjectHash } from "../../hooks/useActiveProject";
import * as api from "../../api/projects";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [creating, setCreating] = useState(startCreating);
  const [tick, setTick] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [popupDismissed, setPopupDismissed] = useState(false);

  const qa = useQA(hash);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);

  const [inboxState, setInboxState] = useState<InboxState>("collapsed");
  const toggleInbox = () =>
    setInboxState((s) => (s === "expanded" ? "collapsed" : "expanded"));
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

  useEffect(() => {
    setPopupDismissed(false);
  }, [hash]);

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
  useEffect(() => {
    if (!project || !project.hasInit) {
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

  async function handleCreate({ name, baseBranch }: { name: string; baseBranch: string }) {
    if (!project) return;
    const body = {
      name,
      branch: "pipeline/" + name,
      baseBranch,
      state: "planning" as const,
      tickets: [],
    };
    try {
      const created = (await api.createPipeline(project.hash, body)) as Pipeline;
      setPipelines((arr) => [created, ...arr]);
      setActiveId(created.id);
      setCreating(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  const topBar = (
    <TopBar
      onBellClick={toggleInbox}
      notifActive={inboxState === "expanded"}
      unreadCount={unreadCount}
    />
  );
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
        main={<EmptyProject message="載入中…" hint="" />}
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
      onFinalize={async (edits) => {
        const result = (await qa.finalize(edits)) as
          | { pipeline: Pipeline; ticket: unknown }
          | null;
        if (result) {
          setPipelines((arr) =>
            arr.map((p) => (p.id === result.pipeline.id ? result.pipeline : p))
          );
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
    />
  ) : null;

  const overlay = (
    <>
      {initOverlay}
      {qaOverlay}
      {ticketOverlay}
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
          />
        ) : pipelines.length === 0 ? (
          <EmptyProject
            message="還沒任何 pipeline"
            hint="點左邊「+ 新 pipeline」建立第一條。"
          />
        ) : (
          <FocusColumn
            pipeline={active}
            tick={tick}
            onAddTicket={(pid) => qa.open(pid)}
            hasActiveDraft={!!qa.draftFor(active.id)}
            onTicketClick={(t) => setOpenTicket(t)}
            onRun={async (pid) => {
              if (!project) return;
              try {
                await api.runPipeline(project.hash, pid);
                setReloadKey((k) => k + 1);
              } catch (e) {
                setLoadError(e instanceof Error ? e.message : String(e));
              }
            }}
            onPause={async (pid) => {
              if (!project) return;
              try {
                await api.pausePipeline(project.hash, pid);
                setReloadKey((k) => k + 1);
              } catch (e) {
                setLoadError(e instanceof Error ? e.message : String(e));
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

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../shell/AppShell";
import { Rail } from "../../shell/Rail";
import { TopBar } from "../../shell/TopBar";
import { FocusColumn } from "./FocusColumn";
import { CreateCard, CreatePlaceholder } from "../pipelineCreate/CreateCard";
import { EmptyProject } from "./EmptyProject";
import { InitPopup } from "../init/InitPopup";
import { InboxColumn } from "../notifications/InboxColumn";
import { QADrawer } from "../qa/QADrawer";
import { useQA } from "../qa/useQA";
import type { NotifItem } from "../../types/notif";
import { useActiveProjectHash } from "../../hooks/useActiveProject";
import * as api from "../../api/projects";
import type { Pipeline } from "../../types/pipeline";
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

  const [inboxState, setInboxState] = useState<InboxState>("collapsed");
  const toggleInbox = () =>
    setInboxState((s) => (s === "expanded" ? "collapsed" : "expanded"));
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [items, setItems] = useState<NotifItem[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const unreadCount = items.filter((i) => i.unread).length;

  function markRead(id: string) {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, unread: false } : it)));
  }
  function dismissNotif(id: string) {
    setItems((arr) => arr.filter((it) => it.id !== id));
  }
  function markAllRead() {
    setItems((arr) => arr.map((it) => ({ ...it, unread: false })));
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

  useEffect(() => {
    if (!project || !project.hasInit) {
      setPipelines([]);
      return;
    }
    let cancelled = false;
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
      .catch(() => {
        if (cancelled) return;
        setPipelines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

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

  const overlay = (
    <>
      {initOverlay}
      {qaOverlay}
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
          />
        )
      }
      overlay={overlay}
      aside={inboxAside}
    />
  );
}

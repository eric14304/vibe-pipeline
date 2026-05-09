import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../shell/AppShell";
import { Rail } from "../../shell/Rail";
import { FocusColumn } from "../pipeline/FocusColumn";
import { NotifBanner } from "./NotifBanner";
import { InboxColumn } from "./InboxColumn";
import { NOTIFS_SEED } from "../../data/notifications";
import { PIPELINES } from "../../data/pipelines";
import type { InboxFilter, InboxState } from "../../types/notif";

export function NotificationsScreen({
  inboxState: initial = "expanded",
  showBanner = false,
  filter: initialFilter = "all",
  density = "medium",
  showAllBanners = false,
}: {
  inboxState?: InboxState;
  showBanner?: boolean;
  filter?: InboxFilter;
  density?: "compact" | "medium";
  showAllBanners?: boolean;
}) {
  const [inboxState, setInboxState] = useState<InboxState>(initial);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [items, setItems] = useState(NOTIFS_SEED);
  const [activeId, setActiveId] = useState("feat-auth");
  const [tick, setTick] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => setInboxState(initial), [initial]);
  useEffect(() => setFilter(initialFilter), [initialFilter]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const id = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(id);
  }, [highlightId]);

  const active = useMemo(() => PIPELINES.find((p) => p.id === activeId) || PIPELINES[0], [activeId]);

  const unreadCount = items.filter((i) => i.unread).length;
  const blockItems = items.filter((i) => i.sev === "block");

  function markRead(id: string) {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, unread: false } : it)));
  }
  function dismiss(id: string) {
    setItems((arr) => arr.filter((it) => it.id !== id));
  }
  function markAllRead() {
    setItems((arr) => arr.map((it) => ({ ...it, unread: false })));
  }
  function focusItem(id: string, pipelineId?: string) {
    if (inboxState !== "expanded") setInboxState("expanded");
    if (pipelineId) setActiveId(pipelineId);
    setHighlightId(id);
    markRead(id);
  }

  const visibleBanners = showBanner ? (showAllBanners ? blockItems : blockItems.slice(0, 1)) : [];

  return (
    <AppShell
      rootClassName={"notif-root is-inbox-" + inboxState}
      density={density}
      bannerStack={
        visibleBanners.length > 0 ? (
          <div className="notif-banner-stack">
            {visibleBanners.map((b) => (
              <NotifBanner key={b.id} item={b} onDismiss={() => dismiss(b.id)} onPrimary={() => focusItem(b.id, b.pipelineId)} />
            ))}
          </div>
        ) : null
      }
      rail={<Rail pipelines={PIPELINES} activeId={activeId} onSelect={setActiveId} />}
      main={<FocusColumn pipeline={active} tick={tick} />}
      aside={
        <InboxColumn
          state={inboxState}
          setState={setInboxState}
          items={items}
          filter={filter}
          setFilter={setFilter}
          unreadCount={unreadCount}
          highlightId={highlightId}
          onMarkRead={markRead}
          onDismiss={dismiss}
          onMarkAllRead={markAllRead}
          onItemClick={focusItem}
        />
      }
    />
  );
}

// proto/notif.jsx — Notifications system. Stacks banners + inbox column on top of Board layout.

const { useState: useNS, useEffect: useNE, useMemo: useNM } = React;

/* ───── data ───── */
const NOTIFS_SEED = [
{
  id: "n1", sev: "block", icon: "⚠", iconKind: "warn",
  title: "OAuth flow stalled",
  sub: "feat-auth · ticket #2 · iter 6 · critic 連續 3 次 reject",
  ts: "2 min", since: 120, unread: true,
  pipelineId: "feat-auth",
  primary: { label: "介入 →", kind: "block" },
  secondary: { label: "重試 as-is" }
},
{
  id: "n2", sev: "block", icon: "🚨", iconKind: "alert",
  title: "每日預算硬上限",
  sub: "$5.00 / $5.00 daily · 所有 ticket 已自動 paused",
  ts: "5 min", since: 300, unread: true,
  primary: { label: "調整 budget", kind: "block" },
  secondary: { label: "今日續開" }
},
{
  id: "n3", sev: "info", icon: "✓", iconKind: "check",
  title: "refactor-api ready to merge",
  sub: "4 / 4 ticket done · +482 −137 · 14 commits",
  ts: "just now", since: 8, unread: true,
  pipelineId: "refactor-api",
  primary: { label: "Review diff", kind: "info" }
},
{
  id: "n4", sev: "info", icon: "✦", iconKind: "skill",
  title: "新 SKILL 候選 ×2",
  sub: "從 feat-search · ticket #2 蒸餾出來,等審核",
  ts: "12 min", since: 720, unread: true,
  primary: { label: "前往 SKILL.md" }
},
{
  id: "n5", sev: "info", icon: "↻", iconKind: "iter",
  title: "ranking algo · iter 3 critic 通過",
  sub: "feat-search · ticket #2 → 進入 done",
  ts: "18 min", since: 1080,
  pipelineId: "feat-search"
},
{
  id: "n6", sev: "muted", icon: "·", iconKind: "dot",
  title: "ticket #1 done",
  sub: "feat-auth · DB schema 設計 · 12 min elapsed",
  ts: "20 min", since: 1200,
  pipelineId: "feat-auth"
},
{
  id: "n7", sev: "muted", icon: "·", iconKind: "dot",
  title: "perf-db · iter 1 done",
  sub: "ranking warm-up · 2 / 4 done",
  ts: "34 min", since: 2040
},
{
  id: "n8", sev: "muted", icon: "·", iconKind: "dot",
  title: "infra-ci pipeline created",
  sub: "由 keith — 還沒新增 ticket",
  ts: "1 h", since: 3600
}];


const SEV_COLOR = {
  block: "var(--paused)",
  info: "var(--done)",
  muted: "var(--fg-faint)"
};

const SECTION_LABEL = {
  block: "需要介入",
  info: "進度",
  muted: "更早"
};

/* ───── NotifScreen ───── */
function NotifScreen({
  inboxState: initial = "expanded",
  showBanner = true,
  filter: initialFilter = "all",
  density = "medium",
  showAllBanners = false
}) {
  const [inboxState, setInboxState] = useNS(initial);
  const [filter, setFilter] = useNS(initialFilter);
  const [items, setItems] = useNS(NOTIFS_SEED);
  const [activeId, setActiveId] = useNS("feat-auth");
  const [tick, setTick] = useNS(0);
  const [highlightId, setHighlightId] = useNS(null);

  useNE(() => setInboxState(initial), [initial]);
  useNE(() => setFilter(initialFilter), [initialFilter]);

  useNE(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // clear highlight after a moment
  useNE(() => {
    if (!highlightId) return;
    const id = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(id);
  }, [highlightId]);

  const active = useNM(
    () => PIPELINES.find((p) => p.id === activeId) || PIPELINES[0],
    [activeId]
  );

  const unreadCount = items.filter((i) => i.unread).length;
  const blockItems = items.filter((i) => i.sev === "block");

  function markRead(id) {
    setItems((arr) => arr.map((it) => it.id === id ? { ...it, unread: false } : it));
  }
  function dismiss(id) {
    setItems((arr) => arr.filter((it) => it.id !== id));
  }
  function markAllRead() {
    setItems((arr) => arr.map((it) => ({ ...it, unread: false })));
  }
  function focusItem(id, pipelineId) {
    if (inboxState !== "expanded") setInboxState("expanded");
    if (pipelineId) setActiveId(pipelineId);
    setHighlightId(id);
    markRead(id);
  }

  const visibleBanners = showBanner ? showAllBanners ? blockItems : blockItems.slice(0, 1) : [];

  return (
    <div
      className={"board-root notif-root is-inbox-" + inboxState}
      data-density={density}>
      
      <TopBar />
      {visibleBanners.length > 0 &&
      <div className="notif-banner-stack">
          {visibleBanners.map((b) =>
        <NotifBanner
          key={b.id}
          item={b}
          onDismiss={() => dismiss(b.id)}
          onPrimary={() => focusItem(b.id, b.pipelineId)} />

        )}
        </div>
      }
      <div className="board-body">
        <Rail
          pipelines={PIPELINES}
          activeId={activeId}
          onSelect={setActiveId}
          creating={false}
          onStartCreate={() => {}}
          onCancelCreate={() => {}}
          onSubmitCreate={() => {}} />
        
        <FocusColumn pipeline={active} tick={tick} />
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
          onItemClick={focusItem} />
        
      </div>
    </div>);

}

/* ───── Banner ───── */
function NotifBanner({ item, onDismiss, onPrimary }) {
  const c = SEV_COLOR[item.sev];
  return (
    <div className="notif-banner" style={{ "--banner-color": c }}>
      <span className="notif-banner-icon">
        <BannerIcon kind={item.iconKind} />
      </span>
      <div className="notif-banner-body">
        <div className="notif-banner-title">{item.title}</div>
        <div className="notif-banner-sub">
          {item.pipelineId && <span className="notif-banner-meta-mono">{item.pipelineId}</span>}
          {item.sub}
        </div>
      </div>
      <div className="notif-banner-actions">
        {item.secondary &&
        <button className="btn btn-ghost">{item.secondary.label}</button>
        }
        {item.primary &&
        <button className="btn btn-primary" onClick={onPrimary}>
            {item.primary.label}
          </button>
        }
        <button className="notif-banner-x" onClick={onDismiss} title="忽略 (一小時後重提)" aria-label="忽略">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </div>);

}

/* ───── InboxColumn (router) ───── */
function InboxColumn(props) {
  if (props.state === "hidden") return null;
  if (props.state === "collapsed") {
    return (
      <aside className="inbox-col" aria-label="Inbox 收合">
        <InboxStrip
          items={props.items}
          unreadCount={props.unreadCount}
          onExpand={() => props.setState("expanded")}
          onItemClick={props.onItemClick} />
        
      </aside>);

  }
  return (
    <aside className="inbox-col" aria-label="Inbox 展開">
      <InboxPanel
        items={props.items}
        filter={props.filter}
        setFilter={props.setFilter}
        unreadCount={props.unreadCount}
        highlightId={props.highlightId}
        onCollapse={() => props.setState("collapsed")}
        onMarkRead={props.onMarkRead}
        onDismiss={props.onDismiss}
        onMarkAllRead={props.onMarkAllRead}
        onItemClick={props.onItemClick} />
      
    </aside>);

}

/* ───── Strip (collapsed) ───── */
function InboxStrip({ items, unreadCount, onExpand, onItemClick }) {
  const blocks = items.filter((i) => i.sev === "block");
  const infos = items.filter((i) => i.sev === "info" && i.unread);
  const muted = items.filter((i) => i.sev === "muted" || i.sev === "info" && !i.unread);

  return (
    <div className="inbox-strip">
      <button className="inbox-strip-expand" onClick={onExpand} title="展開 inbox" aria-label="展開">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className={"inbox-strip-count" + (unreadCount > 0 ? " has-unread" : "")}>
        {unreadCount}
      </div>
      <div className="inbox-strip-divider"></div>

      {blocks.map((b, i) =>
      <button
        key={b.id}
        className={"inbox-strip-item is-block" + (i === 0 ? " has-pulse" : "")}
        style={{ "--strip-color": SEV_COLOR.block }}
        onClick={() => onItemClick(b.id, b.pipelineId)}>
        
          <BannerIcon kind={b.iconKind} small />
          <span className="inbox-strip-tooltip">{b.title} · {b.ts}</span>
        </button>
      )}

      {infos.map((b) =>
      <button
        key={b.id}
        className="inbox-strip-item"
        style={{ "--strip-color": SEV_COLOR.info }}
        onClick={() => onItemClick(b.id, b.pipelineId)}>
        
          <BannerIcon kind={b.iconKind} small />
          <span className="inbox-strip-tooltip">{b.title} · {b.ts}</span>
        </button>
      )}

      {muted.length > 0 &&
      <div className="inbox-strip-pips">
          {muted.slice(0, 6).map((m) => <span key={m.id} title={m.title} />)}
        </div>
      }

      <div className="inbox-strip-spacer"></div>
      <div className="inbox-strip-label">INBOX</div>
    </div>);

}

/* ───── Panel (expanded) ───── */
function InboxPanel({
  items, filter, setFilter, unreadCount, highlightId, onCollapse,
  onMarkRead, onDismiss, onMarkAllRead, onItemClick
}) {
  const filtered = items.filter((it) => {
    if (filter === "unread") return it.unread;
    if (filter === "blocking") return it.sev === "block";
    return true;
  });

  const grouped = { block: [], info: [], muted: [] };
  filtered.forEach((it) => grouped[it.sev].push(it));

  const blockCount = items.filter((i) => i.sev === "block").length;

  return (
    <div className="inbox-panel">
      <div className="inbox-head">
        <h3>Inbox</h3>
        {unreadCount > 0 && <span className="inbox-head-count mono">{unreadCount} 未讀</span>}
        <div className="inbox-head-actions">
          <button className="icon-btn" title="收合" onClick={onCollapse} aria-label="收合">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div className="inbox-filter">
        {[
        ["all", "全部", items.length],
        ["unread", "未讀", unreadCount],
        ["blocking", "阻斷", blockCount]].
        map(([key, label, count]) =>
        <button
          key={key}
          className={"inbox-filter-btn" + (filter === key ? " is-active" : "")}
          onClick={() => setFilter(key)}>
          
            {label}
            {count > 0 && <span className="inbox-filter-count mono">{count}</span>}
          </button>
        )}
      </div>

      <div className="inbox-list">
        {filtered.length === 0 ?
        <div className="inbox-empty">
            <div className="inbox-empty-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5 11-11" /></svg>
            </div>
            <div>都看過了</div>
          </div> :

        ["block", "info", "muted"].map((sev) => {
          if (grouped[sev].length === 0) return null;
          return (
            <React.Fragment key={sev}>
                <div className={"inbox-section-label sev-" + sev}>
                  <span className="label-text">{SECTION_LABEL[sev]}</span>
                  <span className="inbox-section-count">· {grouped[sev].length}</span>
                  <span className="inbox-section-bar"></span>
                </div>
                {grouped[sev].map((it) =>
              <InboxItem
                key={it.id}
                item={it}
                highlight={highlightId === it.id}
                onMarkRead={onMarkRead}
                onDismiss={onDismiss}
                onClick={() => onItemClick(it.id, it.pipelineId)} />

              )}
              </React.Fragment>);

        })
        }
      </div>

      <div className="inbox-foot">
        <span>3 days · 24 通知</span>
        <span style={{ flex: 1 }} />
        <a className="inbox-foot-link" href="#" onClick={(e) => e.preventDefault()}>檢視全部 →</a>
      </div>
    </div>);

}

function InboxItem({ item, highlight, onMarkRead, onDismiss, onClick }) {
  const c = SEV_COLOR[item.sev];
  return (
    <div
      className={
      "inbox-item is-" + item.sev + (
      item.unread ? " is-unread" : "") + (
      highlight ? " fade-up" : "")
      }
      style={{ "--item-color": c }}
      onClick={onClick}
      role="button"
      tabIndex={0}>
      
      {item.unread && <span className="inbox-item-unread-dot" />}
      <div className="inbox-item-head">
        <span className="inbox-item-icon">
          <BannerIcon kind={item.iconKind} small />
        </span>
        <span className="inbox-item-title">{item.title}</span>
        <span className="inbox-item-ts mono">{item.ts}</span>
      </div>
      <div className="inbox-item-sub">{item.sub}</div>
      {(item.primary || item.secondary) &&
      <div className="inbox-item-actions">
          {item.secondary &&
        <button
          className="inbox-item-action"
          onClick={(e) => {e.stopPropagation();onMarkRead(item.id);}}>
          
              {item.secondary.label}
            </button>
        }
          {item.primary &&
        <button
          className={
          "inbox-item-action" + (
          item.primary.kind === "block" ? " is-primary" :
          item.primary.kind === "info" ? " is-primary-info" : "")
          }
          onClick={(e) => {e.stopPropagation();onClick();}}>
          
              {item.primary.label}
            </button>
        }
        </div>
      }
    </div>);

}

/* ───── icons ───── */
function BannerIcon({ kind, small }) {
  const sw = small ? 1.7 : 1.9;
  const s = small ? 13 : 16;
  if (kind === "warn")
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 2 21h20L12 3Z" />
        <path d="M12 9v5" />
        <circle cx="12" cy="17.5" r="0.8" fill="currentColor" />
      </svg>);

  if (kind === "alert")
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6" />
        <circle cx="12" cy="16.5" r="0.8" fill="currentColor" />
      </svg>);

  if (kind === "check")
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw + 0.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="m4 12.5 5.5 5.5L20 6" />
      </svg>);

  if (kind === "skill")
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 14 9l6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L2 10l6-1 4-6Z" />
      </svg>);

  if (kind === "iter")
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 4v4h-4" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 20v-4h4" />
      </svg>);

  // dot
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" />
    </svg>);

}

Object.assign(window, { NotifScreen });
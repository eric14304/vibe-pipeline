import { BannerIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, InboxEmptyIcon } from "../../ui/icons";
// BannerIcon 仍用在 expanded panel 的 InboxItem;ChevronLeft 用在 strip。
import { SEV_COLOR } from "../../data/notifications";
import type { InboxFilter, InboxState, NotifItem } from "../../types/notif";

type Common = {
  items: NotifItem[];
  filter: InboxFilter;
  setFilter: (f: InboxFilter) => void;
  unreadCount: number;
  highlightId: string | null;
  state: InboxState;
  setState: (s: InboxState) => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onMarkAllRead: () => void;
  onItemClick: (id: string, pipelineId?: string) => void;
};

export function InboxColumn(props: Common) {
  if (props.state === "hidden") return null;
  if (props.state === "collapsed") {
    return (
      <aside className="inbox-col" aria-label="Inbox 收合">
        <InboxStrip
          items={props.items}
          unreadCount={props.unreadCount}
          onExpand={() => props.setState("expanded")}
          onItemClick={props.onItemClick}
        />
      </aside>
    );
  }
  return (
    <aside className="inbox-col" aria-label="Inbox 展開">
      <InboxPanel {...props} onCollapse={() => props.setState("collapsed")} />
    </aside>
  );
}

function InboxStrip({
  items,
  unreadCount,
  onExpand,
  onItemClick,
}: {
  items: NotifItem[];
  unreadCount: number;
  onExpand: () => void;
  onItemClick: (id: string, pipelineId?: string) => void;
}) {
  // 一律 flat:items 已 newest-first,直接拿前 N 顯示;不再分 block/info/muted 三段層級
  // sev 走 pip 顏色 + unread 走 ring(實心/外圈),不再「大 icon vs pip」雙視覺
  const SHOW = 12;
  const visible = items.slice(0, SHOW);
  const overflow = Math.max(0, items.length - SHOW);

  return (
    <div className="inbox-strip">
      <button type="button" className="inbox-strip-expand" onClick={onExpand} title="展開 inbox" aria-label="展開">
        <ChevronLeftIcon />
      </button>
      <div className={"inbox-strip-count" + (unreadCount > 0 ? " has-unread" : "")}>{unreadCount}</div>
      <div className="inbox-strip-divider"></div>

      <div className="inbox-strip-pips">
        {visible.map((it) => (
          <button type="button"
            key={it.id}
            className={
              "inbox-strip-pip" +
              (it.unread ? " is-unread" : "") +
              " is-" + it.sev
            }
            style={{ ["--strip-color" as string]: SEV_COLOR[it.sev] } as React.CSSProperties}
            onClick={() => onItemClick(it.id, it.pipelineId)}
            title={it.title + " · " + it.ts}
            aria-label={it.title}
          />
        ))}
        {overflow > 0 && (
          <span className="inbox-strip-overflow mono" title={`還有 ${overflow} 條`}>
            +{overflow}
          </span>
        )}
      </div>

      <div className="inbox-strip-spacer"></div>
      <div className="inbox-strip-label">INBOX</div>
    </div>
  );
}

function InboxPanel({
  items,
  filter,
  setFilter,
  unreadCount,
  highlightId,
  onCollapse,
  onMarkRead,
  onDismiss,
  onMarkAllRead,
  onItemClick,
}: Common & { onCollapse: () => void }) {
  const filtered = items.filter((it) => {
    if (filter === "unread") return !!it.unread;
    if (filter === "blocking") return it.sev === "block";
    return true;
  });

  const blockCount = items.filter((i) => i.sev === "block").length;

  return (
    <div className="inbox-panel">
      <div className="inbox-head">
        <h3>Inbox</h3>
        {unreadCount > 0 && <span className="inbox-head-count mono">{unreadCount} 未讀</span>}
        <div className="inbox-head-actions">
          <button type="button" className="icon-btn" title="收合" onClick={onCollapse} aria-label="收合">
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className="inbox-filter">
        {(
          [
            ["all", "全部", items.length],
            ["unread", "未讀", unreadCount],
            ["blocking", "阻斷", blockCount],
          ] as const
        ).map(([key, label, count]) => (
          <button type="button"
            key={key}
            className={"inbox-filter-btn" + (filter === key ? " is-active" : "")}
            onClick={() => setFilter(key as InboxFilter)}
          >
            {label}
            {count > 0 && <span className="inbox-filter-count mono">{count}</span>}
          </button>
        ))}
      </div>

      <div className="inbox-list">
        {filtered.length === 0 ? (
          <div className="inbox-empty">
            <div className="inbox-empty-icon">
              <InboxEmptyIcon />
            </div>
            <div>都看過了</div>
          </div>
        ) : (
          filtered.map((it) => (
            <InboxItem
              key={it.id}
              item={it}
              highlight={highlightId === it.id}
              onMarkRead={onMarkRead}
              onDismiss={onDismiss}
              onClick={() => onItemClick(it.id, it.pipelineId)}
            />
          ))
        )}
      </div>

      <div className="inbox-foot">
        <span>共 {items.length} 通知{unreadCount > 0 ? ` · ${unreadCount} 未讀` : ""}</span>
        <span style={{ flex: 1 }} />
        {items.length > 0 && unreadCount > 0 && (
          <button type="button"
            className="inbox-foot-link"
            onClick={(e) => {
              e.preventDefault();
              onMarkAllRead();
            }}
          >
            全部標已讀
          </button>
        )}
      </div>
    </div>
  );
}

function InboxItem({
  item,
  highlight,
  onMarkRead,
  onDismiss,
  onClick,
}: {
  item: NotifItem;
  highlight: boolean;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  void onMarkRead;
  const c = SEV_COLOR[item.sev];
  return (
    // 整張 card 點擊 → 跳該 pipeline。card 內含 X 按鈕和 action 按鈕,不能用 <button> wrap(invalid HTML),
    // 改 div + role="button" + onKeyDown 是務實解。
    // biome-ignore lint/a11y/useSemanticElements: nested action buttons block <button> wrapper
    <div
      className={"inbox-item is-" + item.sev + (item.unread ? " is-unread" : "") + (highlight ? " fade-up" : "")}
      style={{ ["--item-color" as string]: c } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {item.unread && <span className="inbox-item-unread-dot" />}
      <button type="button"
        className="inbox-item-x"
        title="移除"
        aria-label="移除"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
      >
        <CloseIcon />
      </button>
      <div className="inbox-item-head">
        <span className="inbox-item-icon">
          <BannerIcon kind={item.iconKind} small />
        </span>
        <span className="inbox-item-title">{item.title}</span>
      </div>
      <div className="inbox-item-sub">{item.sub}</div>
      <span className="inbox-item-ts mono">{item.ts}</span>
      {(item.primary || item.secondary) && (
        <div className="inbox-item-actions">
          {item.secondary && (
            <button type="button"
              className="inbox-item-action"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(item.id);
              }}
            >
              {item.secondary.label}
            </button>
          )}
          {item.primary && (
            <button type="button"
              className={
                "inbox-item-action" +
                (item.primary.kind === "block"
                  ? " is-primary"
                  : item.primary.kind === "info"
                  ? " is-primary-info"
                  : "")
              }
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              {item.primary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

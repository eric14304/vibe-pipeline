import { BannerIcon, ChevronLeftIcon, ChevronRightIcon, InboxEmptyIcon } from "../../ui/icons";
import { SECTION_LABEL, SEV_COLOR } from "../../data/notifications";
import type { InboxFilter, InboxState, NotifItem, NotifSeverity } from "../../types/notif";

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
  const blocks = items.filter((i) => i.sev === "block");
  const infos = items.filter((i) => i.sev === "info" && i.unread);
  const muted = items.filter((i) => i.sev === "muted" || (i.sev === "info" && !i.unread));

  return (
    <div className="inbox-strip">
      <button className="inbox-strip-expand" onClick={onExpand} title="展開 inbox" aria-label="展開">
        <ChevronLeftIcon />
      </button>
      <div className={"inbox-strip-count" + (unreadCount > 0 ? " has-unread" : "")}>{unreadCount}</div>
      <div className="inbox-strip-divider"></div>

      {blocks.map((b, i) => (
        <button
          key={b.id}
          className={"inbox-strip-item is-block" + (i === 0 ? " has-pulse" : "")}
          style={{ ["--strip-color" as string]: SEV_COLOR.block } as React.CSSProperties}
          onClick={() => onItemClick(b.id, b.pipelineId)}
        >
          <BannerIcon kind={b.iconKind} small />
          <span className="inbox-strip-tooltip">
            {b.title} · {b.ts}
          </span>
        </button>
      ))}

      {infos.map((b) => (
        <button
          key={b.id}
          className="inbox-strip-item"
          style={{ ["--strip-color" as string]: SEV_COLOR.info } as React.CSSProperties}
          onClick={() => onItemClick(b.id, b.pipelineId)}
        >
          <BannerIcon kind={b.iconKind} small />
          <span className="inbox-strip-tooltip">
            {b.title} · {b.ts}
          </span>
        </button>
      ))}

      {muted.length > 0 && (
        <div className="inbox-strip-pips">
          {muted.slice(0, 6).map((m) => (
            <span key={m.id} title={m.title} />
          ))}
        </div>
      )}

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

  const grouped: Record<NotifSeverity, NotifItem[]> = { block: [], info: [], muted: [] };
  filtered.forEach((it) => grouped[it.sev].push(it));

  const blockCount = items.filter((i) => i.sev === "block").length;

  return (
    <div className="inbox-panel">
      <div className="inbox-head">
        <h3>Inbox</h3>
        {unreadCount > 0 && <span className="inbox-head-count mono">{unreadCount} 未讀</span>}
        <div className="inbox-head-actions">
          <button className="icon-btn" title="收合" onClick={onCollapse} aria-label="收合">
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
          <button
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
          (["block", "info", "muted"] as const).map((sev) => {
            if (grouped[sev].length === 0) return null;
            return (
              <div key={sev} style={{ display: "contents" }}>
                <div className={"inbox-section-label sev-" + sev}>
                  <span className="label-text">{SECTION_LABEL[sev]}</span>
                  <span className="inbox-section-count">· {grouped[sev].length}</span>
                  <span className="inbox-section-bar"></span>
                </div>
                {grouped[sev].map((it) => (
                  <InboxItem
                    key={it.id}
                    item={it}
                    highlight={highlightId === it.id}
                    onMarkRead={onMarkRead}
                    onDismiss={onDismiss}
                    onClick={() => onItemClick(it.id, it.pipelineId)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="inbox-foot">
        <span>3 days · 24 通知</span>
        <span style={{ flex: 1 }} />
        <a className="inbox-foot-link" href="#" onClick={(e) => e.preventDefault()}>
          檢視全部 →
        </a>
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
  const c = SEV_COLOR[item.sev];
  return (
    <div
      className={"inbox-item is-" + item.sev + (item.unread ? " is-unread" : "") + (highlight ? " fade-up" : "")}
      style={{ ["--item-color" as string]: c } as React.CSSProperties}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {item.unread && <span className="inbox-item-unread-dot" />}
      <div className="inbox-item-head">
        <span className="inbox-item-icon">
          <BannerIcon kind={item.iconKind} small />
        </span>
        <span className="inbox-item-title">{item.title}</span>
        <span className="inbox-item-ts mono">{item.ts}</span>
      </div>
      <div className="inbox-item-sub">{item.sub}</div>
      {(item.primary || item.secondary) && (
        <div className="inbox-item-actions">
          {item.secondary && (
            <button
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
            <button
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

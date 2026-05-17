import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellIcon, ChevronRightIcon, CloseIcon, InboxEmptyIcon } from "../../ui/icons";
// strip 改 bell + 數字 badge 一顆按鈕(取代原本 ChevronLeft 展開鈕 + 獨立 count box 兩件)。
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
  onDismissAll: () => void;
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
  // strip 整塊當一個觸碰區。dots 是視覺索引,但不再個別當 button(太小難點)。
  // hover 進入 → 進 preview mode,顯第一則(idx=0);滾輪改 idx;點擊跳該則。
  // 滑出 strip → preview popover 消失,idx 清空
  const SHOW = 12;
  const visible = items.slice(0, SHOW);
  const overflow = Math.max(0, items.length - SHOW);

  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const pipsRef = useRef<HTMLButtonElement>(null);
  // popover 用 portal 跳出 .inbox-col 的 overflow:hidden,改 fixed 定位
  const [previewPos, setPreviewPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (previewIdx === null) {
      setPreviewPos(null);
      return;
    }
    const el = pipsRef.current;
    if (!el) return;
    // 抓被 preview 那顆 dot 的 rect,垂直對齊它;水平錨在 pips 區左外 8px
    const dot = el.querySelectorAll<HTMLElement>(".inbox-strip-pip")[previewIdx];
    const pipsRect = el.getBoundingClientRect();
    const dotRect = dot?.getBoundingClientRect();
    setPreviewPos({
      top: dotRect ? dotRect.top + dotRect.height / 2 : pipsRect.top + pipsRect.height / 2,
      right: window.innerWidth - pipsRect.left + 8,
    });
  }, [previewIdx]);

  // wheel 換 preview 項。preventDefault 不讓頁面跟著捲(passive: false)
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (visible.length === 0) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setPreviewIdx((prev) => {
        const cur = prev ?? 0;
        const next = cur + dir;
        if (next < 0) return 0;
        if (next >= visible.length) return visible.length - 1;
        return next;
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [visible.length]);

  const previewItem = previewIdx !== null ? visible[previewIdx] : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover previews are visual-only; actions stay on child buttons
    <div
      className="inbox-strip"
      ref={stripRef}
      onMouseEnter={() => {
        if (visible.length > 0) setPreviewIdx(0);
      }}
      onMouseLeave={() => setPreviewIdx(null)}
    >
      <button
        type="button"
        className={"inbox-strip-bell" + (unreadCount > 0 ? " has-unread" : "")}
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        title={unreadCount > 0 ? `展開 inbox(${unreadCount} 未讀)` : "展開 inbox"}
        aria-label={unreadCount > 0 ? `展開 inbox,${unreadCount} 未讀` : "展開 inbox"}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="inbox-strip-bell-num mono" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <div className="inbox-strip-divider"></div>

      {/* dots 區整塊當一個觸碰區:click 跳當前 preview 項,沒 preview 就展開 inbox */}
      <button
        ref={pipsRef}
        type="button"
        className="inbox-strip-pips"
        onClick={() => {
          if (previewItem) {
            onItemClick(previewItem.id, previewItem.pipelineId);
          } else if (visible.length > 0) {
            // 沒 hover 進來就點(touch 或鍵盤)→ 跳第一則
            onItemClick(visible[0].id, visible[0].pipelineId);
          } else {
            onExpand();
          }
        }}
        title={
          previewItem
            ? "點擊跳該 pipeline · 滾輪切換"
            : visible.length > 0
            ? "hover 預覽 · 滾輪切換 · 點擊跳"
            : "展開 inbox"
        }
        aria-label="通知列表"
      >
        {visible.map((it, i) => (
          <span
            key={it.id}
            className={
              "inbox-strip-pip" +
              (it.unread ? " is-unread" : "") +
              " is-" + it.sev +
              (i === previewIdx ? " is-preview" : "")
            }
            style={{ ["--strip-color" as string]: SEV_COLOR[it.sev] } as React.CSSProperties}
            aria-hidden="true"
          />
        ))}
        {overflow > 0 && (
          <span className="inbox-strip-overflow mono" title={`還有 ${overflow} 條`}>
            +{overflow}
          </span>
        )}
      </button>

      <div className="inbox-strip-spacer"></div>
      <div className="inbox-strip-label">INBOX</div>

      {previewItem && previewPos && createPortal(
        <div
          className="inbox-strip-preview"
          style={{
            ["--preview-color" as string]: SEV_COLOR[previewItem.sev],
            top: previewPos.top,
            right: previewPos.right,
          } as React.CSSProperties}
        >
          <div className="inbox-strip-preview-head">
            <span className={"inbox-strip-preview-dot is-" + previewItem.sev} />
            <span className="inbox-strip-preview-title">{previewItem.title}</span>
          </div>
          {previewItem.sub && (
            <div className="inbox-strip-preview-sub">{previewItem.sub}</div>
          )}
          <div className="inbox-strip-preview-meta mono">
            {previewItem.ts} · {previewIdx! + 1}/{visible.length}
            {previewItem.unread ? " · 未讀" : ""}
          </div>
        </div>,
        document.body
      )}
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
  onDismissAll,
  onItemClick,
}: Common & { onCollapse: () => void }) {
  const filtered = items.filter((it) => {
    if (filter === "unread") return !!it.unread;
    if (filter === "blocking") return it.sev === "block";
    if (filter === "frontend") return typeof it.type === "string" && it.type.startsWith("frontend_action_");
    return true;
  });

  const blockCount = items.filter((i) => i.sev === "block").length;
  const frontendCount = items.filter(
    (i) => typeof i.type === "string" && i.type.startsWith("frontend_action_")
  ).length;

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
            ["frontend", "前端動作", frontendCount],
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
            <div>
              {items.length === 0
                ? "目前沒有通知"
                : filter === "unread"
                  ? "都看過了"
                  : filter === "blocking"
                    ? "沒有阻斷類通知"
                    : filter === "frontend"
                      ? "沒有前端動作紀錄"
                      : "目前沒有通知"}
            </div>
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
        {items.length > 0 && (
          <button type="button"
            className="inbox-foot-link"
            title="清除所有通知"
            onClick={(e) => {
              e.preventDefault();
              onDismissAll();
            }}
          >
            全部清除
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
        <span className={"inbox-item-dot" + (item.unread ? " is-unread" : " is-read")} />
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

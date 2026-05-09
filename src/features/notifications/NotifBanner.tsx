import { BannerIcon, CloseIcon } from "../../ui/icons";
import { SEV_COLOR } from "../../data/notifications";
import type { NotifItem } from "../../types/notif";

export function NotifBanner({
  item,
  onDismiss,
  onPrimary,
}: {
  item: NotifItem;
  onDismiss: () => void;
  onPrimary: () => void;
}) {
  const c = SEV_COLOR[item.sev];
  return (
    <div className="notif-banner" style={{ ["--banner-color" as string]: c } as React.CSSProperties}>
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
        {item.secondary && <button className="btn btn-ghost">{item.secondary.label}</button>}
        {item.primary && (
          <button className="btn btn-primary" onClick={onPrimary}>
            {item.primary.label}
          </button>
        )}
        <button className="notif-banner-x" onClick={onDismiss} title="忽略 (一小時後重提)" aria-label="忽略">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

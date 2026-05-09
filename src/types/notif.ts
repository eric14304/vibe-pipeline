import type { BannerKind } from "../ui/icons";

export type NotifSeverity = "block" | "info" | "muted";

export type NotifAction = {
  label: string;
  kind?: "block" | "info";
};

export type NotifItem = {
  id: string;
  sev: NotifSeverity;
  icon: string;
  iconKind: BannerKind;
  title: string;
  sub: string;
  ts: string;
  since: number;
  unread?: boolean;
  pipelineId?: string;
  primary?: NotifAction;
  secondary?: NotifAction;
};

export type InboxState = "expanded" | "collapsed" | "hidden";
export type InboxFilter = "all" | "unread" | "blocking";

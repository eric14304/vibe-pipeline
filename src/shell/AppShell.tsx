import type { ReactNode } from "react";
import { TopBar } from "./TopBar";

export function AppShell({
  rootClassName = "",
  density = "medium",
  topBar = <TopBar />,
  bannerStack,
  rail,
  main,
  aside,
  overlay,
  mobileTabBar,
}: {
  rootClassName?: string;
  density?: "compact" | "medium";
  topBar?: ReactNode;
  bannerStack?: ReactNode;
  rail: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
  overlay?: ReactNode;
  mobileTabBar?: ReactNode;
}) {
  return (
    <div className={"board-root " + rootClassName} data-density={density}>
      {topBar}
      {bannerStack}
      <div className="board-body">
        {rail}
        {main}
        {aside}
      </div>
      {mobileTabBar}
      {overlay}
    </div>
  );
}

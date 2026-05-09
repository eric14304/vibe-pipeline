import type { ReactNode } from "react";

export function EmptyShell({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

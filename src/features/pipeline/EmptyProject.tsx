import { FolderQuestionIcon } from "../../ui/icons";

export function EmptyProject({
  message = "還沒選資料夾",
  hint = "從上方專案切換器選擇本地資料夾,vibe-pipeline 會自動偵測 .vibe-pipeline/ 並引導你初始化。",
  pointToTopBar = true,
}: {
  message?: string;
  hint?: string;
  pointToTopBar?: boolean;
}) {
  return (
    <div className="empty-project-root">
      {pointToTopBar && (
        <div aria-hidden="true" className="empty-project-topbar-hint">
          <span className="empty-project-topbar-arrow">↑</span>
          <span className="mono">點上方專案切換器</span>
        </div>
      )}
      <div className="empty-project-icon">
        <FolderQuestionIcon />
      </div>
      <div className="empty-project-message">{message}</div>
      <div className="empty-project-hint">{hint}</div>
    </div>
  );
}

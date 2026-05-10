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
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 32,
        color: "var(--fg-mute)",
        position: "relative",
      }}
    >
      {pointToTopBar && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            color: "var(--accent)",
            fontSize: 11,
            letterSpacing: "0.04em",
            opacity: 0.85,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>↑</span>
          <span className="mono">點上方專案切換器</span>
        </div>
      )}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <FolderQuestionIcon />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>{message}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 380, textAlign: "center" }}>{hint}</div>
    </div>
  );
}

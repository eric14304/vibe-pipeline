import { FolderQuestionIcon } from "../../ui/icons";

export function EmptyProject({
  message = "還沒選資料夾",
  hint = "從上方專案切換器選擇本地資料夾,vibe-pipeline 會自動偵測 .tickets/ 並引導你初始化。",
}: {
  message?: string;
  hint?: string;
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
      }}
    >
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

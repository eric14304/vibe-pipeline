// OS native folder picker.
// Windows: pwsh OpenFolderDialog (Win11/.NET 8) → fallback FolderBrowserDialog
// macOS: osascript "choose folder" (Cocoa)
// Linux: kdialog (KDE) → fallback zenity (GNOME)
//
// Returns null if user cancels.

// PowerShell 7+ + .NET 8 → 現代 WPF OpenFolderDialog;舊環境 fallback 老的 FolderBrowserDialog。
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$picked = $null
try {
  Add-Type -AssemblyName PresentationFramework
  $dlg = New-Object Microsoft.Win32.OpenFolderDialog
  $dlg.Title = '選擇專案資料夾'
  $dlg.Multiselect = $false
  if ($dlg.ShowDialog()) { $picked = $dlg.FolderName }
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  $f = New-Object System.Windows.Forms.FolderBrowserDialog
  $f.Description = '選擇專案資料夾'
  $f.UseDescriptionForTitle = $true
  $f.ShowNewFolderButton = $true
  if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $picked = $f.SelectedPath }
}
if ($picked) { Write-Output $picked }
`.trim();

export async function pickFolder(): Promise<string | null> {
  const platform = process.platform;
  if (platform === "win32") return pickFolderWindows();
  if (platform === "darwin") return pickFolderMac();
  if (platform === "linux") return pickFolderLinux();
  throw new Error(`Unsupported platform: ${platform}`);
}

async function spawnText(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out;
}

async function hasCommand(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", name], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function pickFolderWindows(): Promise<string | null> {
  // Prefer pwsh (PowerShell 7+, .NET 8 → has OpenFolderDialog); fallback to legacy powershell.
  const exe = (await hasCommand("pwsh")) ? "pwsh" : "powershell";
  const out = await spawnText([exe, "-NoProfile", "-STA", "-Command", PS_SCRIPT]);
  return out || null;
}

async function pickFolderMac(): Promise<string | null> {
  const script = `try
  set f to choose folder with prompt "選擇專案資料夾"
  return POSIX path of f
on error
  return ""
end try`;
  const out = await spawnText(["osascript", "-e", script]);
  return out || null;
}

export async function revealFolder(path: string): Promise<void> {
  const platform = process.platform;
  if (platform === "win32") {
    Bun.spawn(["explorer", path], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  if (platform === "darwin") {
    Bun.spawn(["open", path], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  if (platform === "linux") {
    Bun.spawn(["xdg-open", path], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

async function pickFolderLinux(): Promise<string | null> {
  if (await hasCommand("kdialog")) {
    const out = await spawnText(["kdialog", "--getexistingdirectory", "--title", "選擇專案資料夾"]);
    return out || null;
  }
  if (await hasCommand("zenity")) {
    const out = await spawnText([
      "zenity",
      "--file-selection",
      "--directory",
      "--title=選擇專案資料夾",
    ]);
    return out || null;
  }
  throw new Error("No folder picker available (install kdialog or zenity)");
}

// OS native folder picker.
// Windows: powershell FolderBrowserDialog
// macOS: osascript "choose folder"
// Linux: zenity --file-selection --directory
//
// Returns null if user cancels.

const PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select a project folder"
$f.ShowNewFolderButton = $true
$result = $f.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $f.SelectedPath
}
`.trim();

export async function pickFolder(): Promise<string | null> {
  const platform = process.platform;
  if (platform === "win32") return pickFolderWindows();
  if (platform === "darwin") return pickFolderMac();
  if (platform === "linux") return pickFolderLinux();
  throw new Error(`Unsupported platform: ${platform}`);
}

async function pickFolderWindows(): Promise<string | null> {
  const proc = Bun.spawn(["powershell", "-NoProfile", "-STA", "-Command", PS_SCRIPT], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out || null;
}

async function pickFolderMac(): Promise<string | null> {
  const script = `try
  set f to choose folder with prompt "Select a project folder"
  return POSIX path of f
on error
  return ""
end try`;
  const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out || null;
}

async function pickFolderLinux(): Promise<string | null> {
  const proc = Bun.spawn(
    ["zenity", "--file-selection", "--directory", "--title=Select a project folder"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out || null;
}

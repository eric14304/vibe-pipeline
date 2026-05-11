// 從 public/icon.svg 用 ImageMagick 產出 PWA / notification 用的 PNG。
// 改 icon.svg 後 `bun run icons` 重生即可。需要本機裝 ImageMagick:
//   winget install ImageMagick.ImageMagick
//
// 為什麼不用 sharp / jimp:省一個 npm dep,build 流程外部執行,專案乾淨。
// 為什麼 SVG 也保留:browser tab favicon 用 SVG 比較銳利,manifest 提供
// SVG fallback 給支援的 platform(modern Chrome / Edge)。

import { existsSync } from "node:fs";

const MAGICK_CANDIDATES = [
  "magick",
  "C:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe",
  "/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe",
];

function resolveMagick(): string {
  for (const c of MAGICK_CANDIDATES) {
    if (c === "magick") {
      // PATH 查
      try {
        const r = Bun.spawnSync(["magick", "-version"]);
        if (r.exitCode === 0) return "magick";
      } catch {}
      continue;
    }
    if (existsSync(c)) return c;
  }
  throw new Error("找不到 ImageMagick magick 執行檔。請 `winget install ImageMagick.ImageMagick`");
}

const SVG = "public/icon.svg";
const OUTPUTS: Array<{ size: number; out: string }> = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
];

const magick = resolveMagick();
console.log(`[gen-icons] using: ${magick}`);

for (const o of OUTPUTS) {
  const args = ["-background", "none", SVG, "-resize", `${o.size}x${o.size}`, o.out];
  const r = Bun.spawnSync([magick, ...args]);
  if (r.exitCode !== 0) {
    console.error(`[gen-icons] FAILED ${o.out}:`, new TextDecoder().decode(r.stderr));
    process.exit(1);
  }
  console.log(`[gen-icons] wrote ${o.out}`);
}

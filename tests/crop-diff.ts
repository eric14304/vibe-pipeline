import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";

const a = PNG.sync.read(readFileSync("tests/.snapshots/qa-drawer-light.proto.png"));
const b = PNG.sync.read(readFileSync("tests/.snapshots/qa-drawer-light.mine.png"));

const X = 880, Y = 80, W = 540, H = 120;
function crop(src: PNG): PNG {
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = ((Y + y) * src.width + (X + x)) * 4;
      const di = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
    }
  }
  return out;
}

writeFileSync("tests/.diffs/qa-crop-proto.png", PNG.sync.write(crop(a)));
writeFileSync("tests/.diffs/qa-crop-mine.png", PNG.sync.write(crop(b)));
console.log("cropped");

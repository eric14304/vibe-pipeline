import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const a = PNG.sync.read(readFileSync("tests/.snapshots/qa-drawer-light.proto.png"));
const b = PNG.sync.read(readFileSync("tests/.snapshots/qa-drawer-light.mine.png"));
const w = a.width, h = a.height;

let minX = w, minY = h, maxX = -1, maxY = -1;
let count = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i+1] !== b.data[i+1] || a.data[i+2] !== b.data[i+2] || a.data[i+3] !== b.data[i+3]) {
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
console.log(`raw diff pixels: ${count}, bbox: x=${minX}..${maxX}, y=${minY}..${maxY}`);

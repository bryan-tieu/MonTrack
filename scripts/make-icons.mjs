// Draws the app icon (accent square with three ledger lines) as PNGs without extra dependencies.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function icon(size) {
  const s = size / 64;
  // Bars in the 64-unit design grid: [x, y, width, height]
  const bars = [[14, 18, 36, 6], [14, 29, 26, 6], [14, 40, 31, 6]];
  const inBar = (x, y) =>
    bars.some(([bx, by, bw, bh]) => {
      const r = bh / 2;
      const px = x / s, py = y / s;
      if (py < by || py > by + bh) return false;
      const cx = Math.min(Math.max(px, bx + r), bx + bw - r);
      return (px - cx) ** 2 + (py - (by + r)) ** 2 <= r * r;
    });
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      const white = inBar(x + 0.5, y + 0.5);
      raw[o] = white ? 255 : 0x00;
      raw[o + 1] = white ? 255 : 0x7a;
      raw[o + 2] = white ? 255 : 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/apple-touch-icon.png", icon(180));
writeFileSync("public/icon-192.png", icon(192));
writeFileSync("public/icon-512.png", icon(512));
console.log("Icons written to public/");

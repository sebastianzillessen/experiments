#!/usr/bin/env node
// Generates the PWA PNG icons (no native deps — pure zlib PNG encoder) plus a
// favicon.svg. Run with `npm run gen-icons`. Draws a white dumbbell on the
// brand-orange background; the maskable variant keeps the glyph inside the
// safe zone.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [0xff, 0x5a, 0x3c]; // brand orange
const FG = [0xff, 0xff, 0xff];

// --- minimal PNG encoder ---------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // rows with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- drawing ---------------------------------------------------------------
function makeIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++) set(x, y, color);
  };

  // background
  rect(0, 0, size, size, BG);

  // dumbbell geometry (normalised). Maskable shrinks into the safe zone.
  const s = maskable ? 0.66 : 0.82;
  const cx = size / 2;
  const cy = size / 2;
  const u = (v) => v * size * s; // half-extent helper
  // central bar
  rect(cx - u(0.34), cy - u(0.07), cx + u(0.34), cy + u(0.07), FG);
  // inner plates
  rect(cx - u(0.42), cy - u(0.16), cx - u(0.32), cy + u(0.16), FG);
  rect(cx + u(0.32), cy - u(0.16), cx + u(0.42), cy + u(0.16), FG);
  // outer plates
  rect(cx - u(0.52), cy - u(0.26), cx - u(0.44), cy + u(0.26), FG);
  rect(cx + u(0.44), cy - u(0.26), cx + u(0.52), cy + u(0.26), FG);

  return encodePng(size, size, buf);
}

const targets = [
  ["pwa-192x192.png", 192, {}],
  ["pwa-512x512.png", 512, {}],
  ["maskable-icon-512x512.png", 512, { maskable: true }],
  ["apple-touch-icon-180x180.png", 180, {}],
  ["pwa-64x64.png", 64, {}],
];

for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), makeIcon(size, opts));
  console.log("wrote", name);
}

// favicon.svg — same dumbbell as a crisp vector.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#ff5a3c"/>
  <g fill="#fff">
    <rect x="21" y="29" width="22" height="6"/>
    <rect x="16" y="25" width="6" height="14"/>
    <rect x="42" y="25" width="6" height="14"/>
    <rect x="11" y="21" width="5" height="22"/>
    <rect x="48" y="21" width="5" height="22"/>
  </g>
</svg>
`;
writeFileSync(join(OUT, "favicon.svg"), favicon);
console.log("wrote favicon.svg");

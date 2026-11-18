// Draws the cabinet's walnut grain: assets/textures/walnut-grain.png.
//
// The figure is computed, not photographed: annual rings bent by a slow
// warp, long fibre streaks, and a scatter of open pores. Every term is
// periodic in both directions, so the tile repeats without a seam. The file
// carries only shade: black where the grain is dark, cream where it catches
// the light, and the alpha says how much. It is laid over the cabinet's own
// colour, which stays where it was.
//
//   node scripts/make-walnut-grain.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 1024;
const H = 512;

// A small seeded generator, so the same plank comes out every time.
let seed = 0x5eed1957;
const rnd = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
};

const TAU = Math.PI * 2;

// The slow warp that bends the rings into cathedrals.
const warpTerms = Array.from({ length: 7 }, () => ({
  kx: 1 + Math.floor(rnd() * 3),
  ky: Math.floor(rnd() * 3),
  amp: 0.15 + rnd() * 0.45,
  phase: rnd() * TAU,
}));
const warp = (u, v) => warpTerms.reduce((s, t) => s + t.amp * Math.sin(TAU * (t.kx * u + t.ky * v) + t.phase), 0);

// Periodic value noise on a lattice far longer than it is tall: fibre.
function fibre(cellsX, cellsY) {
  const lattice = Float32Array.from({ length: cellsX * cellsY }, () => rnd());
  return (u, v) => {
    const fx = u * cellsX;
    const x0 = Math.floor(fx) % cellsX;
    const x1 = (x0 + 1) % cellsX;
    const t = fx - Math.floor(fx);
    const s = t * t * (3 - 2 * t);
    const fy = v * cellsY;
    const y0 = Math.floor(fy) % cellsY;
    const y1 = (y0 + 1) % cellsY;
    const ty = fy - Math.floor(fy);
    const a = lattice[y0 * cellsX + x0] * (1 - s) + lattice[y0 * cellsX + x1] * s;
    const b = lattice[y1 * cellsX + x0] * (1 - s) + lattice[y1 * cellsX + x1] * s;
    return a * (1 - ty) + b * ty;
  };
}
const longFibre = fibre(4, 170);
const fineFibre = fibre(14, 256);
const cloud = fibre(4, 6);

const RINGS = 19;
const shade = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = x / W;
    const v = y / H;
    const r = v * RINGS + warp(u, v) * 0.5;
    const s = r - Math.floor(r);
    // Early wood pales slowly; late wood closes in a dark line.
    const ring = Math.pow(s, 3.2) - 0.24;
    const f = (longFibre(u, v) - 0.5) * 0.9 + (fineFibre(u, v) - 0.5) * 0.5;
    const c = (cloud(u, v) - 0.5) * 0.7;
    shade[y * W + x] = -(ring * 0.6) + f * 0.75 + c * 0.8;
  }
}

// Open pores: short dark dashes lying along the grain.
for (let i = 0; i < 5200; i++) {
  const px = Math.floor(rnd() * W);
  const py = Math.floor(rnd() * H);
  const len = 5 + Math.floor(rnd() * 22);
  const depth = 0.25 + rnd() * 0.45;
  for (let k = 0; k < len; k++) {
    const edge = Math.min(k, len - 1 - k) / (len / 2);
    shade[py * W + ((px + k) % W)] -= depth * Math.min(1, edge * 2 + 0.3);
  }
}

// Centre the shade so the plank neither lightens nor darkens the cabinet much.
let mean = 0;
for (const v of shade) mean += v;
mean /= shade.length;

const DARK = 0.30; // the most a pixel may darken
const LIGHT = 0.085; // the most it may catch the light
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const v = Math.max(-1, Math.min(1, (shade[y * W + x] - mean) * 1.15));
    const o = y * (W * 4 + 1) + 1 + x * 4;
    if (v < 0) {
      raw[o] = 6; raw[o + 1] = 3; raw[o + 2] = 0;
      raw[o + 3] = Math.round(-v * DARK * 255);
    } else {
      raw[o] = 255; raw[o + 1] = 214; raw[o + 2] = 160;
      raw[o + 3] = Math.round(v * LIGHT * 255);
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = new URL('../assets/textures/walnut-grain.png', import.meta.url);
writeFileSync(out, png);
console.log(`walnut-grain.png ${W}x${H}, ${png.length} bytes`);

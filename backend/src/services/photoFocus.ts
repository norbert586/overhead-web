// Where is the aircraft in this photo?
//
// Photos are shown in boxes of every shape — a wide phone hero, a nearly
// square desktop hero, a log thumbnail — and a plain centre crop chops the
// nose and tail off a 3:2 spotter shot in a square box, or leaves a small
// aircraft in the corner of a wide one. Knowing the aircraft's bounding box
// lets the client frame it properly for any box (see frontend
// utils/photoLayout.ts).
//
// The detector is classical, not ML, because it runs once per photo URL on a
// single small server: background-connectivity saliency (Wei et al.,
// "Geodesic Saliency Using Background Priors", 2012). Sky, grass and tree
// lines touch the photo's border and change colour smoothly, so they are
// cheap to reach from the border; an aircraft is walled off by its outline.
// Edge density then separates sharp aircraft detail from soft clouds.
//
// It is tuned to fail wide: a box that is too big only costs some zoom (the
// client shows more of the photo), a box that misses part of the aircraft
// would crop it. When unsure it returns null and the client frames the whole
// photo.

import jpeg from 'jpeg-js';

/** Aircraft bounding box as fractions of the image (0..1). */
export interface FocusBox { x: number; y: number; w: number; h: number }

export interface FocusResult {
  width: number;
  height: number;
  box: FocusBox | null;
}

const FINE_LONG = 256;   // edge-detection grid, long side
const POOL = 4;          // fine cells per coarse cell, each axis
const COLOR_CLAMP = 7;   // colour steps below this are noise/gradient, free to cross
const MIN_COMPONENT_SHARE = 0.08;
const NEAR_GAP = 0.08;    // regions this close (fraction of image) to the aircraft join it
const PAD = 0.03;

/** Perceptual-ish RGB distance ("redmean"), 0..~765. */
function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function percentile(values: Float32Array | Float64Array, p: number): number {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Minimal binary min-heap of [priority, index] for the geodesic pass. */
class MinHeap {
  private pri: number[] = [];
  private idx: number[] = [];
  get size(): number { return this.pri.length; }
  push(p: number, i: number): void {
    const { pri, idx } = this;
    let n = pri.length;
    pri.push(p); idx.push(i);
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (pri[parent] <= p) break;
      pri[n] = pri[parent]; idx[n] = idx[parent];
      n = parent;
    }
    pri[n] = p; idx[n] = i;
  }
  pop(): [number, number] {
    const { pri, idx } = this;
    const top: [number, number] = [pri[0], idx[0]];
    const lastP = pri.pop()!, lastI = idx.pop()!;
    const len = pri.length;
    if (len > 0) {
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n;
        let mp = lastP;
        if (l < len && pri[l] < mp) { m = l; mp = pri[l]; }
        if (r < len && pri[r] < mp) { m = r; }
        if (m === n) break;
        pri[n] = pri[m]; idx[n] = idx[m];
        n = m;
      }
      pri[n] = lastP; idx[n] = lastI;
    }
    return top;
  }
}

/**
 * Find the main subject (the aircraft) in raw RGB(A) pixels. Returns null
 * when nothing stands out clearly enough to trust.
 */
export function findSubjectBox(
  data: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
): FocusBox | null {
  if (width < 16 || height < 16) return null;

  // 1. Box-filter down to a fine grid (colour + luma), one pass over pixels.
  //    Never finer than the image itself, or cells would be left empty.
  const long = Math.min(FINE_LONG, Math.floor(Math.max(width, height) / POOL) * POOL);
  const short = (s: number) => Math.max(POOL * 4, Math.min(Math.floor(s / POOL) * POOL, Math.round((long * s) / Math.max(width, height) / POOL) * POOL));
  const fw = width >= height ? long : short(width);
  const fh = width >= height ? short(height) : long;
  const n = fw * fh;
  const sr = new Float32Array(n), sg = new Float32Array(n), sb = new Float32Array(n), cnt = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(fh - 1, Math.floor((y * fh) / height)) * fw;
    let p = y * width * channels;
    for (let x = 0; x < width; x++, p += channels) {
      const i = fy + Math.min(fw - 1, Math.floor((x * fw) / width));
      sr[i] += data[p]; sg[i] += data[p + 1]; sb[i] += data[p + 2]; cnt[i] += 1;
    }
  }
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = cnt[i] || 1;
    sr[i] /= c; sg[i] /= c; sb[i] /= c;
    luma[i] = 0.299 * sr[i] + 0.587 * sg[i] + 0.114 * sb[i];
  }

  // 2. Sobel edge magnitude on the fine grid, pooled into coarse cells.
  const gw = fw / POOL, gh = fh / POOL, gn = gw * gh;
  const edge = new Float32Array(gn);
  for (let y = 1; y < fh - 1; y++) {
    for (let x = 1; x < fw - 1; x++) {
      const i = y * fw + x;
      const gx = luma[i - fw + 1] + 2 * luma[i + 1] + luma[i + fw + 1] - luma[i - fw - 1] - 2 * luma[i - 1] - luma[i + fw - 1];
      const gy = luma[i + fw - 1] + 2 * luma[i + fw] + luma[i + fw + 1] - luma[i - fw - 1] - 2 * luma[i - fw] - luma[i - fw + 1];
      edge[Math.floor(y / POOL) * gw + Math.floor(x / POOL)] += Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Coarse colour per cell.
  const cr = new Float32Array(gn), cg = new Float32Array(gn), cb = new Float32Array(gn);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const i = y * fw + x, c = Math.floor(y / POOL) * gw + Math.floor(x / POOL);
      cr[c] += sr[i]; cg[c] += sg[i]; cb[c] += sb[i];
    }
  }
  const per = POOL * POOL;
  for (let c = 0; c < gn; c++) { cr[c] /= per; cg[c] /= per; cb[c] /= per; edge[c] /= per; }

  // 3. Geodesic distance from the border: the cheapest path, where crossing
  //    a colour change costs its size (minus a noise allowance).
  // Float64 on purpose: float32 storage rounds d + step, which then compares
  // "shorter" than itself and requeues the cell forever.
  const geo = new Float64Array(gn).fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();
  for (let x = 0; x < gw; x++) {
    for (const y of [0, gh - 1]) { const c = y * gw + x; geo[c] = 0; heap.push(0, c); }
  }
  for (let y = 1; y < gh - 1; y++) {
    for (const x of [0, gw - 1]) { const c = y * gw + x; geo[c] = 0; heap.push(0, c); }
  }
  while (heap.size) {
    const [d, c] = heap.pop();
    if (d > geo[c]) continue;
    const x = c % gw, y = (c - x) / gw;
    const neighbours = [x > 0 ? c - 1 : -1, x < gw - 1 ? c + 1 : -1, y > 0 ? c - gw : -1, y < gh - 1 ? c + gw : -1];
    for (const m of neighbours) {
      if (m < 0) continue;
      const step = Math.max(0, colorDist(cr[c], cg[c], cb[c], cr[m], cg[m], cb[m]) - COLOR_CLAMP);
      if (d + step < geo[m]) { geo[m] = d + step; heap.push(d + step, m); }
    }
  }

  // 4. Saliency: walled off from the border AND carrying real detail.
  const geoScale = percentile(geo, 0.99) || 1;
  const edgeScale = percentile(edge, 0.98) || 1;
  const sal = new Float32Array(gn);
  const edgeN = new Float32Array(gn);
  for (let c = 0; c < gn; c++) {
    const g = Math.min(1, geo[c] / geoScale);
    edgeN[c] = Math.min(1, edge[c] / edgeScale);
    sal[c] = g * (0.35 + 0.65 * edgeN[c]);
  }
  const maxSal = percentile(sal, 0.995);
  if (maxSal < 0.05) return null; // flat image: nothing walled off
  const threshold = Math.max(0.12, 0.3 * maxSal);

  // 5. Connected regions above threshold; keep the substantial ones.
  const label = new Int32Array(gn).fill(-1);
  const comps: { mass: number; edge: number; cells: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let start = 0; start < gn; start++) {
    if (label[start] !== -1 || sal[start] < threshold) continue;
    const comp = { mass: 0, edge: 0, cells: 0, x0: gw, y0: gh, x1: -1, y1: -1 };
    const stack = [start];
    label[start] = comps.length;
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % gw, y = (c - x) / gw;
      comp.mass += sal[c]; comp.edge += edgeN[c]; comp.cells += 1;
      if (x < comp.x0) comp.x0 = x;
      if (x > comp.x1) comp.x1 = x;
      if (y < comp.y0) comp.y0 = y;
      if (y > comp.y1) comp.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const m = ny * gw + nx;
          if (label[m] === -1 && sal[m] >= threshold) { label[m] = comps.length; stack.push(m); }
        }
      }
    }
    comps.push(comp);
  }
  if (!comps.length) return null;

  // Grow from the strongest region — strongest by mass weighted by
  // sharpness, so a big soft cloud doesn't outrank a small crisp aircraft.
  // Anything near it is kept whatever its texture — a plain tail fin or
  // white fuselage section is low on detail but must never be cropped. A
  // far-off region is kept only if it is as sharp as the aircraft; that
  // drops soft clouds and haze.
  const strength = (k: (typeof comps)[number]) => k.mass * (k.edge / k.cells);
  comps.sort((a, b) => strength(b) - strength(a));
  const main = comps[0];
  const mainEdge = main.edge / main.cells;
  let x0 = main.x0, y0 = main.y0, x1 = main.x1, y1 = main.y1;
  const biggest = Math.max(...comps.map((k) => k.mass));
  const pending = comps.slice(1).filter((k) => k.mass >= MIN_COMPONENT_SHARE * biggest);
  for (let grew = true; grew;) {
    grew = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const k = pending[i];
      const gapX = Math.max(0, k.x0 - x1 - 1, x0 - k.x1 - 1) / gw;
      const gapY = Math.max(0, k.y0 - y1 - 1, y0 - k.y1 - 1) / gh;
      const near = gapX <= NEAR_GAP && gapY <= NEAR_GAP;
      if (!near && k.edge / k.cells < 0.6 * mainEdge) continue;
      x0 = Math.min(x0, k.x0); y0 = Math.min(y0, k.y0);
      x1 = Math.max(x1, k.x1); y1 = Math.max(y1, k.y1);
      pending.splice(i, 1);
      grew = true;
    }
  }
  const box = {
    x: Math.max(0, x0 / gw - PAD),
    y: Math.max(0, y0 / gh - PAD),
    w: 0, h: 0,
  };
  box.w = Math.min(1, (x1 + 1) / gw + PAD) - box.x;
  box.h = Math.min(1, (y1 + 1) / gh + PAD) - box.y;

  // Too small to be the aircraft in a photo of an aircraft: don't trust it.
  if (box.w * box.h < 0.015 || box.w < 0.08 || box.h < 0.05) return null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(box.x), y: r(box.y), w: r(box.w), h: r(box.h) };
}

/** Decode a JPEG and find its subject. Throws on undecodable input. */
export function analyzeJpeg(buf: Uint8Array): FocusResult {
  const img = jpeg.decode(buf, {
    useTArray: true,
    formatAsRGBA: false,
    // A hostile or absurd image must not take the server's memory with it.
    maxResolutionInMP: 12,
    maxMemoryUsageInMB: 160,
  });
  const channels = img.data.length >= img.width * img.height * 4 ? 4 : 3;
  return { width: img.width, height: img.height, box: findSubjectBox(img.data, img.width, img.height, channels) };
}

// Aircraft framing: the detector must find the aircraft, and when it isn't
// sure it must fail wide (bigger box / null), never crop part of the plane.
//
//   npm test   (node:test via tsx — no network, no fixtures on disk)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { findSubjectBox, analyzeJpeg, type FocusBox } from '../src/services/photoFocus';

type RGB = [number, number, number];

class Canvas {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h * 3);
  }
  set(x: number, y: number, c: RGB, alpha = 1): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(this.data[i + k] * (1 - alpha) + c[k] * alpha);
  }
  sky(top: RGB, bottom: RGB): this {
    for (let y = 0; y < this.h; y++) {
      const t = y / this.h;
      const c = top.map((v, k) => v + (bottom[k] - v) * t) as RGB;
      for (let x = 0; x < this.w; x++) this.set(x, y, c);
    }
    return this;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB): this {
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) this.set(x, y, c);
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, soft = 0): this {
    for (let y = Math.floor(cy - ry - soft); y <= cy + ry + soft; y++) {
      for (let x = Math.floor(cx - rx - soft); x <= cx + rx + soft; x++) {
        const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
        if (soft) this.set(x, y, c, Math.max(0, Math.min(1, (1 - d) * (rx / soft))));
        else if (d <= 1) this.set(x, y, c);
      }
    }
    return this;
  }
  poly(pts: [number, number][], c: RGB): this {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
    }
    return this;
  }
  /**
   * Side-view airliner, nose right, in a 1000×300 unit box at (ox, oy) scaled
   * by s. Returns its true bounding box as fractions of the canvas.
   */
  plane(ox: number, oy: number, s: number, opts: { body?: RGB; livery?: RGB; windows?: boolean } = {}): FocusBox {
    const body = opts.body ?? [244, 246, 248], livery = opts.livery ?? [29, 79, 145];
    const P = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
    this.poly([P(40, 160), P(10, 40), P(70, 40), P(150, 132), P(60, 150)], livery);
    this.rect(...P(60, 132), ...P(900, 196), body);
    this.ellipse(...P(900, 164), 75 * s, 32 * s, body);
    this.ellipse(...P(60, 164), 30 * s, 32 * s, body);
    this.rect(...P(70, 182), ...P(930, 196), livery);
    this.poly([P(380, 178), P(560, 178), P(470, 250), P(430, 250)], [170, 176, 184]);
    this.rect(...P(455, 200), ...P(565, 234), [140, 146, 154]);
    if (opts.windows !== false) for (let i = 0; i < 34; i++) this.rect(...P(160 + i * 20, 146), ...P(169 + i * 20, 157), [43, 52, 64]);
    this.rect(...P(200, 196), ...P(208, 236), [43, 52, 64]);
    this.ellipse(...P(204, 244), 12 * s, 12 * s, [25, 25, 25]);
    this.rect(...P(820, 196), ...P(828, 236), [43, 52, 64]);
    this.ellipse(...P(824, 244), 12 * s, 12 * s, [25, 25, 25]);
    const [x0, y0] = P(10, 40), [x1, y1] = P(975, 256);
    return {
      x: Math.max(0, x0) / this.w, y: Math.max(0, y0) / this.h,
      w: (Math.min(this.w, x1) - Math.max(0, x0)) / this.w, h: (Math.min(this.h, y1) - Math.max(0, y0)) / this.h,
    };
  }
  ground(y: number, trees = true): this {
    this.rect(0, y, this.w, this.h, [91, 122, 58]);
    this.rect(0, y + (this.h - y) * 0.45, this.w, y + (this.h - y) * 0.75, [85, 88, 92]);
    if (trees) for (let x = 0; x < this.w; x += this.w / 28) this.ellipse(x, y, this.h * 0.03, this.h * 0.03, [61, 90, 42]);
    return this;
  }
  box(): FocusBox | null {
    return findSubjectBox(this.data, this.w, this.h, 3);
  }
}

const TOL = 0.02;
function assertContains(box: FocusBox | null, plane: FocusBox, label: string): asserts box is FocusBox {
  assert.ok(box, `${label}: expected a box`);
  assert.ok(box.x <= plane.x + TOL, `${label}: left edge cut (box ${box.x} > plane ${plane.x})`);
  assert.ok(box.y <= plane.y + TOL, `${label}: top edge cut (box ${box.y} > plane ${plane.y})`);
  assert.ok(box.x + box.w >= plane.x + plane.w - TOL, `${label}: right edge cut`);
  assert.ok(box.y + box.h >= plane.y + plane.h - TOL, `${label}: bottom edge cut`);
}
const area = (b: FocusBox) => b.w * b.h;

test('centred airliner on a clear sky', () => {
  const c = new Canvas(420, 280).sky([127, 178, 229], [214, 232, 247]);
  const plane = c.plane(30, 60, 0.36);
  const box = c.box();
  assertContains(box, plane, 'centred');
  assert.ok(area(box) < area(plane) * 1.8, `box much bigger than the aircraft: ${JSON.stringify(box)}`);
});

test('aircraft low-left on a runway, clear of the tree line', () => {
  const c = new Canvas(1024, 683).sky([169, 196, 220], [232, 238, 242]).ground(520, false);
  const plane = c.plane(20, 300, 0.62);
  const box = c.box();
  assertContains(box, plane, 'runway');
  assert.ok(box.x + box.w < 0.75, `box ran past the aircraft: ${JSON.stringify(box)}`);
  assert.ok(box.y > 0.3, `box ran up into the empty sky: ${JSON.stringify(box)}`);
});

test('aircraft sitting on a hard tree line: may widen, must not crop', () => {
  // The tree line touches the gear, so it can be read as part of the
  // subject — that only costs zoom. Cropping the aircraft would be the bug.
  const c = new Canvas(1024, 683).sky([169, 196, 220], [232, 238, 242]).ground(470);
  const plane = c.plane(20, 320, 0.62);
  const box = c.box();
  assertContains(box, plane, 'tree line');
  assert.ok(box.y > 0.3 && box.y + box.h < 0.85, `vertical extent should stay near the aircraft: ${JSON.stringify(box)}`);
});

test('small aircraft high-right; a soft cloud far away is not the subject', () => {
  const c = new Canvas(640, 427).sky([63, 127, 196], [169, 205, 240]);
  c.ellipse(130, 80, 90, 25, [235, 240, 248], 30);
  const plane = c.plane(360, 40, 0.24);
  const box = c.box();
  assertContains(box, plane, 'small');
  assert.ok(box.x > 0.4, `cloud pulled into the box: ${JSON.stringify(box)}`);
});

test('a plain, detail-free tail fin is still part of the aircraft', () => {
  const c = new Canvas(640, 427).sky([110, 160, 215], [200, 222, 242]);
  const plane = c.plane(40, 120, 0.55, { livery: [200, 40, 40] });
  assertContains(c.box(), plane, 'tail');
});

test('tight crop: aircraft runs off both edges', () => {
  const c = new Canvas(420, 280).sky([127, 178, 229], [214, 232, 247]);
  c.plane(-40, 50, 0.5);
  const box = c.box();
  assert.ok(box, 'expected a box');
  assert.ok(box.w > 0.85, `edge-to-edge aircraft should keep the full width: ${JSON.stringify(box)}`);
});

test('low contrast: white aircraft on a white overcast sky fails wide or finds it', () => {
  const c = new Canvas(640, 427).sky([226, 229, 233], [240, 241, 243]);
  const plane = c.plane(60, 120, 0.55, { body: [247, 247, 247], livery: [150, 155, 160] });
  const box = c.box();
  if (box) assertContains(box, plane, 'overcast');
});

test('nothing to find: flat and gradient images give no box', () => {
  assert.equal(new Canvas(320, 200).sky([120, 160, 200], [120, 160, 200]).box(), null);
  assert.equal(new Canvas(320, 200).sky([80, 130, 200], [220, 230, 240]).box(), null);
});

test('tiny images are handled without crashing', () => {
  assert.equal(new Canvas(12, 12).box(), null);
  const c = new Canvas(40, 30).sky([127, 178, 229], [214, 232, 247]);
  c.plane(2, 8, 0.035);
  c.box(); // any answer is fine — it must not throw or loop
});

test('analyzeJpeg: real JPEG round trip, dimensions and box', () => {
  const c = new Canvas(420, 280).sky([169, 196, 220], [232, 238, 242]).ground(196);
  const plane = c.plane(6, 118, 0.27);
  const rgba = Buffer.alloc(c.w * c.h * 4);
  for (let i = 0; i < c.w * c.h; i++) {
    rgba[i * 4] = c.data[i * 3]; rgba[i * 4 + 1] = c.data[i * 3 + 1]; rgba[i * 4 + 2] = c.data[i * 3 + 2]; rgba[i * 4 + 3] = 255;
  }
  const encoded = jpeg.encode({ data: rgba, width: c.w, height: c.h }, 85).data;
  const result = analyzeJpeg(encoded);
  assert.equal(result.width, 420);
  assert.equal(result.height, 280);
  assertContains(result.box, plane, 'jpeg');
});

test('analyzeJpeg rejects non-JPEG input', () => {
  assert.throws(() => analyzeJpeg(new TextEncoder().encode('<html>not an image</html>')));
});

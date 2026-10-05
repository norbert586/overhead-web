// Frame an aircraft photo for a box of any shape.
//
// object-fit: cover crops from the centre, which chops the nose and tail off
// a 3:2 spotter photo in the nearly square desktop hero and leaves a small,
// off-centre aircraft lost in the corner of the wide phone hero. The server
// tells us where the aircraft is (focus box); this works out the image's
// size and position so that:
//
//   1. the whole aircraft stays visible, clear of the labels overlaid on the
//      photo (the inset "safe area");
//   2. the aircraft sits in the middle of that safe area and is zoomed in
//      when it's small in the frame, up to a limit (thumbnails go soft);
//   3. the photo fills the box when it can; when filling would crop the
//      aircraft, the photo shrinks to fit and a blurred copy fills the rest
//      (letterboxed) — never a cropped aircraft, never empty bars.

import type { FocusBox } from '../types/photo';

export interface Insets { top: number; right: number; bottom: number; left: number }

export interface PhotoFrame {
  /** Image position and size within the container, in CSS px. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** The image doesn't cover the container — show the blurred backdrop. */
  letterboxed: boolean;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

// No focus box: assume a composed spotter shot and keep nearly all of it.
const WHOLE_PHOTO: FocusBox = { x: 0.03, y: 0.06, w: 0.94, h: 0.88 };
// Breathing room around the aircraft, as a share of the image.
const MARGIN = 0.035;
// How much of the safe area the aircraft may fill when zooming in.
const FILL = 0.9;
// Zoom in at most this far beyond "just covers the box".
const MAX_ZOOM = 1.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Place one axis: centre the subject in the safe span, then keep the image covering (or inside) the box. */
function place(container: number, imageSize: number, subjectCentre: number, safeStart: number, safeSpan: number): number {
  const centred = safeStart + safeSpan / 2 - subjectCentre;
  return imageSize >= container
    ? clamp(centred, container - imageSize, 0)
    : clamp(centred, 0, container - imageSize);
}

export function framePhoto(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number,
  focus: FocusBox | null,
  insets: Insets = NO_INSETS,
): PhotoFrame | null {
  if (!(containerW > 0 && containerH > 0 && imageW > 0 && imageH > 0)) return null;

  const f = focus ?? WHOLE_PHOTO;
  const x0 = clamp(f.x - MARGIN, 0, 1), y0 = clamp(f.y - MARGIN, 0, 1);
  const x1 = clamp(f.x + f.w + MARGIN, 0, 1), y1 = clamp(f.y + f.h + MARGIN, 0, 1);
  const subjW = Math.max(1, (x1 - x0) * imageW), subjH = Math.max(1, (y1 - y0) * imageH);

  // Safe area: where the aircraft may go. Never let insets eat most of the box.
  const left = Math.min(insets.left, containerW * 0.25), right = Math.min(insets.right, containerW * 0.25);
  const top = Math.min(insets.top, containerH * 0.3), bottom = Math.min(insets.bottom, containerH * 0.3);
  const safeW = containerW - left - right, safeH = containerH - top - bottom;

  const cover = Math.max(containerW / imageW, containerH / imageH);
  const contain = Math.min(containerW / imageW, containerH / imageH);
  const fitsAt = Math.min(safeW / subjW, safeH / subjH); // largest scale with the aircraft inside the safe area

  const scale = fitsAt >= cover
    ? clamp(fitsAt * FILL, cover, cover * MAX_ZOOM)
    : Math.max(fitsAt, contain * 0.8);

  const width = imageW * scale, height = imageH * scale;
  const frame = {
    left: place(containerW, width, ((x0 + x1) / 2) * width, left, safeW),
    top: place(containerH, height, ((y0 + y1) / 2) * height, top, safeH),
    width,
    height,
  };
  return { ...frame, letterboxed: width < containerW - 0.5 || height < containerH - 0.5 };
}

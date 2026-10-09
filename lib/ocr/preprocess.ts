// Local preprocessing (runs in the browser; photos never leave the device). Each step is optional and was
// measured on the photo fixtures — only steps that improved resolution are enabled by default (see docs/PHASE2.md).
import { resizeGray, type Gray } from "./image";

export function contrastStretch(g: Gray, lowPct = 1, highPct = 99): Gray {
  const hist = new Uint32Array(256);
  for (const v of g.data) hist[v]++;
  const total = g.data.length;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= (total * lowPct) / 100) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= (total * (100 - highPct)) / 100) { hi = i; break; } }
  if (hi <= lo) return g;
  const out = new Uint8ClampedArray(g.data.length);
  const k = 255 / (hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = (g.data[i] - lo) * k;
  return { ...g, data: out };
}

function integral(g: Gray): Float64Array {
  const { width: w, height: h, data } = g;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += data[(y - 1) * w + (x - 1)]; I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + row; }
  }
  return I;
}

function localMean(g: Gray, radius: number): Float32Array {
  const { width: w, height: h } = g;
  const I = integral(g), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Bradley-style adaptive threshold: a pixel is ink if it is `t` darker than its local mean. */
export function adaptiveThreshold(g: Gray, radius = 15, t = 0.12): Gray {
  const mean = localMean(g, radius), out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] < mean[i] * (1 - t) ? 0 : 255;
  return { ...g, data: out };
}

/** Divide by a large-scale background estimate to flatten uneven lighting / soft glare, keeping text contrast. */
export function flattenIllumination(g: Gray, radius = 40): Gray {
  const bg = localMean(g, radius), out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, (g.data[i] / Math.max(1, bg[i])) * 235);
  return { ...g, data: out };
}

export function upscale(g: Gray, factor: number): Gray {
  return factor === 1 ? g : resizeGray(g, Math.round(g.width * factor), Math.round(g.height * factor));
}

/** Rotate by `deg` (clockwise), expanding the canvas, filling with white. Bilinear. */
export function rotate(g: Gray, deg: number): Gray {
  if (!deg) return g;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const w = Math.ceil(Math.abs(g.width * c) + Math.abs(g.height * s)), h = Math.ceil(Math.abs(g.width * s) + Math.abs(g.height * c));
  const out = new Uint8ClampedArray(w * h).fill(255);
  const cx = g.width / 2, cy = g.height / 2, ox = w / 2, oy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - ox, dy = y - oy;
    const sx = c * dx + s * dy + cx, sy = -s * dx + c * dy + cy;
    if (sx < 0 || sy < 0 || sx >= g.width - 1 || sy >= g.height - 1) continue;
    const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0, i = y0 * g.width + x0;
    out[y * w + x] = (g.data[i] * (1 - tx) + g.data[i + 1] * tx) * (1 - ty) + (g.data[i + g.width] * (1 - tx) + g.data[i + g.width + 1] * tx) * ty;
  }
  return { data: out, width: w, height: h };
}

export interface Rect { x: number; y: number; width: number; height: number }
export function crop(g: Gray, r: Rect): Gray {
  const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
  const w = Math.min(g.width - x, Math.round(r.width)), h = Math.min(g.height - y, Math.round(r.height));
  const out = new Uint8ClampedArray(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = g.data[(y + j) * g.width + x + i];
  return { data: out, width: w, height: h };
}

/** Estimate the text skew in degrees (the angle to pass to rotate() to level the lines), searching +/-maxDeg.
 *  Scores each candidate angle by the sharpness of the row-ink profile of a downscaled binary image. */
export function estimateSkewDeg(g: Gray, maxDeg = 10): number {
  const small = g.width > 600 ? resizeGray(g, 600, Math.max(1, Math.round((g.height * 600) / g.width))) : g;
  // use the central half of the width: bottle curvature distorts line direction most near the edges
  const mid = crop(small, { x: small.width * 0.25, y: 0, width: small.width * 0.5, height: small.height });
  const ink = adaptiveThreshold(mid, 12, 0.12);
  const score = (deg: number) => {
    const r = rotate(ink, deg), prof = new Float64Array(r.height);
    for (let y = 0; y < r.height; y++) { let c = 0; for (let x = 0; x < r.width; x++) if (r.data[y * r.width + x] === 0) c++; prof[y] = c; }
    let sc = 0; for (let y = 1; y < prof.length; y++) sc += (prof[y] - prof[y - 1]) ** 2;
    return sc;
  };
  let best = 0, bestS = score(0);
  for (let a = -maxDeg; a <= maxDeg; a += 0.5) { const sc = score(a); if (sc > bestS) { bestS = sc; best = a; } }
  for (let a = best - 0.4; a <= best + 0.4; a += 0.1) { const sc = score(a); if (sc > bestS) { bestS = sc; best = a; } }
  return Math.abs(best) < 1 ? 0 : Math.round(best * 10) / 10;   // < 1 degree: not worth resampling (measured: it only blurs real photos)
}

export function deskew(g: Gray): Gray { return rotate(g, estimateSkewDeg(g)); }

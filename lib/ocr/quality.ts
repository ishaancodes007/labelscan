// Photo quality checks run BEFORE OCR, in the browser. Plain-language prompts; no scoring of the product.
import { resizeGray, toGray, type Gray, type RGBA } from "./image";

export interface QualityMetrics {
  blur: number;            // 99th-percentile Sobel gradient on a 1000px-normalized image (higher = sharper)
  glareFraction: number;   // fraction of near-saturated pixels (luma >= GLARE_LUMA)
  glareBlob: number;       // largest share of the image's blocks that are mostly saturated (washes out text)
  longSide: number;        // pixels
  textHeightPx: number;    // estimated height of a text line in px at native resolution (0 if unknown)
}
export interface QualityReport { metrics: QualityMetrics; prompts: string[]; ok: boolean }

// Thresholds calibrated on backend/fixtures/photos (synthetic) — see docs/PHASE2.md for the numbers and their limits.
// blurMin: sharp 175-210, sigma1 blur 100-123, sigma2 blur 55 (OCR still fine), sigma5 blur 26 (OCR dead) -> 40 is the midpoint
//   between the last readable and first unreadable example. glareBlobMax: readable photos <=0.03, unreadable 0.27 -> 0.10.
// textHeightMin: 9px lines still read perfectly, 6px do not -> 8. longSideMin is only a floor for tiny images.
export const THRESHOLDS = { blurMin: 40, glareLuma: 250, glareBlobMax: 0.10, longSideMin: 300, textHeightMin: 8 };

/** 99th percentile of the Sobel gradient magnitude (0-255 scale). Robust to JPEG/sensor noise, unlike Laplacian variance. */
export function gradientP99(g: Gray): number {
  const { data: d, width: w, height: h } = g;
  const hist = new Uint32Array(1024); let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = d[i - w + 1] + 2 * d[i + 1] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - 1] - d[i + w - 1];
    const gy = d[i + w - 1] + 2 * d[i + w] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - w] - d[i - w + 1];
    hist[Math.min(1023, Math.round(Math.hypot(gx, gy) / 4))]++; n++;
  }
  let acc = 0;
  for (let v = 1023; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) return v; }
  return 0;
}

/** Rough text-line height: median length of dark runs in the vertical ink-projection profile, at native resolution. */
export function estimateTextHeight(g: Gray): number {
  const { data, width: w, height: h } = g;
  let lo = 255, hi = 0;
  for (let i = 0; i < data.length; i += 7) { if (data[i] < lo) lo = data[i]; if (data[i] > hi) hi = data[i]; }
  const cut = lo + (hi - lo) * 0.45;
  const rows: number[] = [];
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x += 2) if (data[y * w + x] < cut) c++; rows.push(c); }
  const thr = Math.max(...rows) * 0.06;
  const runs: number[] = []; let run = 0;
  for (const r of rows) { if (r > thr) run++; else { if (run >= 3) runs.push(run); run = 0; } }
  if (run >= 3) runs.push(run);
  if (!runs.length) return 0;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

export function measureQuality(img: RGBA): QualityMetrics {
  return measureQualityGray(toGray(img));
}

export function measureQualityGray(g: Gray): QualityMetrics {
  const longSide = Math.max(g.width, g.height);
  const scale = 1000 / longSide;                      // normalize so blur scores are comparable across camera resolutions
  const norm = scale < 1 ? resizeGray(g, Math.round(g.width * scale), Math.round(g.height * scale)) : g;
  let sat = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i] >= THRESHOLDS.glareLuma) sat++;
  // blob: 32x32 blocks that are >60% saturated; share of all blocks
  const B = 32, bx = Math.floor(g.width / B), by = Math.floor(g.height / B);
  let blobs = 0;
  for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    let c = 0;
    for (let y = 0; y < B; y += 2) for (let x = 0; x < B; x += 2) if (g.data[(j * B + y) * g.width + i * B + x] >= THRESHOLDS.glareLuma) c++;
    if (c > 0.6 * (B * B) / 4) blobs++;
  }
  return { blur: gradientP99(norm), glareFraction: sat / g.data.length, glareBlob: bx * by ? blobs / (bx * by) : 0,
           longSide, textHeightPx: estimateTextHeight(g) };
}

export function assess(m: QualityMetrics): QualityReport {
  const prompts: string[] = [];
  if (m.blur < THRESHOLDS.blurMin) prompts.push("This looks blurry. Hold steady, tap to focus, and take the photo again.");
  if (m.glareBlob > THRESHOLDS.glareBlobMax) prompts.push("Glare is covering part of the label. Tilt the bottle to reduce glare, or rotate it and add another photo.");
  if (m.longSide < THRESHOLDS.longSideMin || (m.textHeightPx > 0 && m.textHeightPx < THRESHOLDS.textHeightMin))
    prompts.push("The text is small in this photo. Move closer so the ingredient list fills the frame.");
  return { metrics: m, prompts, ok: prompts.length === 0 };
}

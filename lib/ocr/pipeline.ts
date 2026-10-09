// The preprocessing pipeline that ships. Every step is justified by a measurement in docs/PHASE2.md:
//  - manual crop + rotate first (the user's choice always wins),
//  - automatic deskew (CER 11.0% -> 3.8% on the photo fixtures; plain PSM 3 collapses on slightly rotated text),
//  - adaptive threshold ONLY when glare is detected (helps glare photos, slightly hurts clean ones),
//  - no contrast stretch, no upscaling, no PSM/DPI overrides: measured, did not help.
import { toGray, type Gray, type RGBA } from "./image";
import { adaptiveThreshold, crop, deskew, rotate, type Rect } from "./preprocess";
import { measureQualityGray, type QualityMetrics } from "./quality";

export const GLARE_ADAPTIVE_FRACTION = 0.01;

export interface PrepOptions { crop?: Rect; rotateDeg?: number; autoDeskew?: boolean; glareAdaptive?: boolean }
export interface PrepResult { image: Gray; skewApplied: boolean; adaptiveApplied: boolean; metrics: QualityMetrics }

export function prepareForOcr(img: RGBA | Gray, opt: PrepOptions = {}): PrepResult {
  let g: Gray = "data" in img && img.data.length === img.width * img.height ? (img as Gray) : toGray(img as RGBA);
  if (opt.crop) g = crop(g, opt.crop);
  if (opt.rotateDeg) g = rotate(g, opt.rotateDeg);
  const metrics = measureQualityGray(g);
  let skewApplied = false;
  if (opt.autoDeskew !== false) { const d = deskew(g); skewApplied = d !== g && (d.width !== g.width || d.height !== g.height); g = d; }
  const adaptiveApplied = opt.glareAdaptive !== false && metrics.glareFraction > GLARE_ADAPTIVE_FRACTION;
  if (adaptiveApplied) g = adaptiveThreshold(g, 15, 0.12);
  return { image: g, skewApplied, adaptiveApplied, metrics };
}

// The preprocessing pipeline that ships. Every step is justified by a measurement in docs/PHASE2.md:
//  - manual crop + rotate first (the user's choice always wins),
//  - automatic deskew for angles >= 1 degree (synthetic photos: CER 11.0% -> 3.8%; neutral on the 5 real photos),
//  - NO adaptive threshold by default: it helped synthetic glare photos but cut a real white-label photo from 30/32 to 11/32
//    identified ingredients (opt-in only),
//  - no contrast stretch, no upscaling, no PSM/DPI overrides: measured, did not help.
import { toGray, type Gray, type RGBA } from "./image";
import { adaptiveThreshold, crop, deskew, rotate, type Rect } from "./preprocess";
import { measureQualityGray, type QualityMetrics } from "./quality";

export interface PrepOptions { crop?: Rect; rotateDeg?: number; autoDeskew?: boolean; adaptiveThreshold?: boolean }
export interface PrepResult { image: Gray; skewApplied: boolean; adaptiveApplied: boolean; metrics: QualityMetrics }

export function prepareForOcr(img: RGBA | Gray, opt: PrepOptions = {}): PrepResult {
  let g: Gray = "data" in img && img.data.length === img.width * img.height ? (img as Gray) : toGray(img as RGBA);
  if (opt.crop) g = crop(g, opt.crop);
  if (opt.rotateDeg) g = rotate(g, opt.rotateDeg);
  const metrics = measureQualityGray(g);
  let skewApplied = false;
  if (opt.autoDeskew !== false) { const d = deskew(g); skewApplied = d !== g && (d.width !== g.width || d.height !== g.height); g = d; }
  const adaptiveApplied = opt.adaptiveThreshold === true;
  if (adaptiveApplied) g = adaptiveThreshold(g, 15, 0.12);
  return { image: g, skewApplied, adaptiveApplied, metrics };
}

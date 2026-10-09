// Approximate "flattening" of text on a cylinder (a bottle or tube). Pixels near the silhouette edges are squeezed horizontally by cos(theta);
// resampling by arc length undoes that squeeze. It is a guess at the curvature, so callers try several settings and keep what reads best.
//   cFrac: where the bottle's centre line sits across the image (0.5 = middle), rho: how far round the edge of the image is (0..1; near 1 = almost side-on).
import type { Gray } from "./image";

export function cylinderUnwarp(g: Gray, cFrac: number, rho: number): Gray {
  const W = g.width, H = g.height, c = cFrac * W, a = Math.max(c, W - c), R = a / Math.min(0.995, Math.max(0.05, rho));
  const thL = Math.asin(Math.min(1, c / R)), thR = Math.asin(Math.min(1, (W - c) / R));
  const u0 = -R * thL, u1 = R * thR, Wout = Math.max(2, Math.round(u1 - u0));
  const out = new Uint8ClampedArray(Wout * H);
  const xs = new Float32Array(Wout);
  for (let u = 0; u < Wout; u++) xs[u] = Math.min(W - 1, Math.max(0, c + R * Math.sin((u0 + (u * (u1 - u0)) / (Wout - 1)) / R)));
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let u = 0; u < Wout; u++) {
      const x = xs[u], x0 = Math.floor(x), x1 = Math.min(W - 1, x0 + 1), t = x - x0;
      out[y * Wout + u] = g.data[row + x0] * (1 - t) + g.data[row + x1] * t;
    }
  }
  return { data: out, width: Wout, height: H };
}

/** The passes tried for a hard photo: the image as is, then curvature guesses (left-, centre- and right-weighted). */
export interface Variant { id: string; c?: number; rho?: number; scale: number }
export const VARIANTS: Variant[] = [
  { id: "orig", scale: 1.5 },
  { id: "u50_92", c: 0.5, rho: 0.92, scale: 1.5 }, { id: "u50_80", c: 0.5, rho: 0.8, scale: 1.5 }, { id: "u50_60", c: 0.5, rho: 0.6, scale: 1.5 },
  { id: "u80_80", c: 0.8, rho: 0.8, scale: 1.5 }, { id: "u80_60", c: 0.8, rho: 0.6, scale: 1.5 },
  { id: "u65_80", c: 0.65, rho: 0.8, scale: 1.5 },
  { id: "u20_80", c: 0.2, rho: 0.8, scale: 1.5 }, { id: "u20_60", c: 0.2, rho: 0.6, scale: 1.5 }, { id: "u35_80", c: 0.35, rho: 0.8, scale: 1.5 },
];

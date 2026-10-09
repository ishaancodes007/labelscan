// Pixel-buffer helpers shared by the browser (canvas ImageData) and Node (jpeg-js/pngjs). No DOM dependency.
export interface RGBA { data: Uint8ClampedArray; width: number; height: number }
export interface Gray { data: Uint8ClampedArray; width: number; height: number }

export function toGray(img: RGBA): Gray {
  const { data, width, height } = img;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
  return { data: out, width, height };
}

export function grayToRGBA(g: Gray): RGBA {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) { out[j] = out[j + 1] = out[j + 2] = g.data[i]; out[j + 3] = 255; }
  return { data: out, width: g.width, height: g.height };
}

/** Bilinear resize to an exact size. */
export function resizeGray(g: Gray, w: number, h: number): Gray {
  const out = new Uint8ClampedArray(w * h);
  const sx = g.width / w, sy = g.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5), y0 = Math.min(g.height - 1, Math.floor(fy)), y1 = Math.min(g.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5), x0 = Math.min(g.width - 1, Math.floor(fx)), x1 = Math.min(g.width - 1, x0 + 1), tx = fx - x0;
      const a = g.data[y0 * g.width + x0], b = g.data[y0 * g.width + x1], c = g.data[y1 * g.width + x0], d = g.data[y1 * g.width + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { data: out, width: w, height: h };
}

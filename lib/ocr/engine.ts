// Tesseract.js wrapper shared by the browser and the Node measurement scripts.
import { createWorker, PSM, type Worker } from "tesseract.js";

export interface OcrWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
export interface OcrLine { text: string; confidence: number; words: OcrWord[] }
export interface OcrResult { text: string; lines: OcrLine[]; words: OcrWord[]; meanConfidence: number; ms: number }
export interface OcrOptions { psm?: string; dpi?: number | null }
export { PSM };

export async function createOcrWorker(
  paths: { langPath?: string; workerPath?: string; corePath?: string; logger?: (m: { status: string; progress: number }) => void } = {},
): Promise<Worker> {
  return createWorker("eng", 1, { ...paths });
}

export async function runOcr(worker: Worker, image: Parameters<Worker["recognize"]>[0], opt: OcrOptions = {}): Promise<OcrResult> {
  await worker.setParameters({
    tessedit_pageseg_mode: (opt.psm ?? PSM.AUTO) as never,
    user_defined_dpi: opt.dpi ? String(opt.dpi) : "",
    preserve_interword_spaces: "1",
  });
  const t0 = Date.now();
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const lines: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    const words: OcrWord[] = (l.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox }));
    lines.push({ text: l.text.replace(/\s+$/, ""), confidence: l.confidence, words });
  }
  const words = lines.flatMap((l) => l.words);
  const mean = words.length ? words.reduce((a, w) => a + w.confidence, 0) / words.length : 0;
  return { text: data.text, lines, words, meanConfidence: mean, ms: Date.now() - t0 };
}

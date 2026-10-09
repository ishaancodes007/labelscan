"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { createOcrWorker, runOcr } from "@/lib/ocr/engine";
import { grayToRGBA, resizeGray, toGray, type RGBA } from "@/lib/ocr/image";
import { mergePhotos, segmentsFromLines, segmentsToText, type MSegment } from "@/lib/ocr/merge";
import { prepareForOcr } from "@/lib/ocr/pipeline";
import { crop as cropGray, rotate as rotateGray } from "@/lib/ocr/preprocess";
import { assess, assessOcr, type QualityReport } from "@/lib/ocr/quality";

interface Trim { l: number; t: number; r: number; b: number }
interface Photo {
  id: string; name: string; rgba: RGBA; trim: Trim; rotate: number; report?: QualityReport;
  status: "idle" | "reading" | "done" | "error"; progress: number; warnings?: string[]; lines?: { words: { text: string; confidence: number }[] }[]; note?: string;
}
interface ApiItem {
  raw: string; status: string; layer?: string; inci_name?: string | null; category?: string | null; source?: string | null; highConfidence?: boolean;
  candidates?: { inci_name: string; score: number; note?: string | null }[]; notes?: string[]; mergedFrom?: number | null; splitFrom?: string | null;
}
interface ApiResult { engine: "enhanced" | "fallback"; notice?: string; items: ApiItem[]; removed?: { raw: string; reason: string }[] }

const MAX_SIDE = 2400;
const LOW_CONF = 70;

async function fileToRGBA(file: File): Promise<RGBA> {
  const bmp = await createImageBitmap(file);                                   // honours EXIF orientation
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

const cropRect = (p: Photo) => ({ x: (p.trim.l / 100) * p.rgba.width, y: (p.trim.t / 100) * p.rgba.height,
  width: (1 - (p.trim.l + p.trim.r) / 100) * p.rgba.width, height: (1 - (p.trim.t + p.trim.b) / 100) * p.rgba.height });

function statusView(it: ApiItem, source?: string | null): { label: string; cls: string } {
  if (it.status === "resolved") {
    if (it.layer === "category_recognized") return { label: "Recognized ingredient class", cls: "class" };
    if (it.layer === "pubchem_match") return { label: "PubChem record match (identity only)", cls: "resolved" };
    return { label: it.layer === "inci_alias" ? "Synonym match" : source === "cosing" ? "INCI match (CosIng)" : "Name match (starter list)", cls: "resolved" };
  }
  if (it.status === "suggested") return { label: "Suggested: needs your confirmation", cls: "suggested" };
  if (it.status === "ambiguous") return { label: "Ambiguous", cls: "ambiguous" };
  if (it.status === "lookup_unavailable") return { label: "Lookup unavailable", cls: "unavailable" };
  if (it.status === "inci_exact") return { label: "Name match (starter list)", cls: "resolved" };   // fallback engine
  if (it.status === "pubchem_match") return { label: "PubChem record match (identity only)", cls: "resolved" };
  return { label: "Not found", cls: "notfound" };
}

export default function AnalyzeClient() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  const update = useCallback((id: string, patch: Partial<Photo>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))), []);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    for (const f of Array.from(files)) {
      try {
        const rgba = await fileToRGBA(f);
        setPhotos((ps) => [...ps, { id: `p${++seq.current}`, name: f.name, rgba, trim: { l: 0, t: 0, r: 0, b: 0 }, rotate: 0, status: "idle", progress: 0 }]);
      } catch { setError(`Could not open ${f.name} as an image.`); }
    }
  }

  // quality prompts: recomputed (debounced) whenever the photo, crop or rotation changes. Local only.
  const sig = photos.map((p) => `${p.id}|${p.trim.l},${p.trim.t},${p.trim.r},${p.trim.b}|${p.rotate}`).join(";");
  useEffect(() => {
    const h = setTimeout(() => {
      setPhotos((ps) => ps.map((p) => {
        const m = prepareForOcr(p.rgba, { crop: cropRect(p), rotateDeg: p.rotate, autoDeskew: false }).metrics;
        return { ...p, report: assess(m) };
      }));
    }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  async function read(p: Photo) {
    update(p.id, { status: "reading", progress: 0, note: undefined });
    try {
      if (!worker.current) {
        worker.current = await createOcrWorker({ workerPath: "/tesseract/worker.min.js", corePath: "/tesseract", langPath: "/tesseract",
          logger: (m) => { if (m.status === "recognizing text") update(p.id, { progress: m.progress }); } });
      }
      const prep = prepareForOcr(p.rgba, { crop: cropRect(p), rotateDeg: p.rotate });
      const rgba = grayToRGBA(prep.image);
      const c = document.createElement("canvas"); c.width = rgba.width; c.height = rgba.height;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height), 0, 0);
      const r = await runOcr(worker.current, c);
      update(p.id, { status: "done", progress: 1, lines: r.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })) })),
        warnings: assessOcr(r.text, r.words, r.meanConfidence),
        note: `${prep.skewApplied ? "Straightened the text. " : ""}Read in this browser.` });
    } catch (e) { update(p.id, { status: "error", note: "Could not read this photo. You can type the ingredients instead." }); console.error(e); }
  }

  const merged = useMemo(() => {
    const done = photos.filter((p) => p.status === "done" && p.lines);
    if (!done.length) return null;
    const segs = done.map((p) => segmentsFromLines(p.lines!.map((l) => ({ words: l.words.map((w) => ({ ...w })) })), p.name));
    return mergePhotos(segs);
  }, [photos]);

  const mergedText = merged ? segmentsToText(merged.segments) : "";
  useEffect(() => { if (!edited) setText(mergedText); }, [mergedText, edited]);

  async function analyze() {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch { setError("Analysis failed. Check your connection and try again."); }
    setBusy(false);
  }

  const needsReview = result ? result.items.filter((i) => ["suggested", "ambiguous", "not_found", "lookup_unavailable"].includes(i.status) || i.status === "not_found").length : 0;

  return (
    <main>
      <h1>Analyze a label</h1>
      <p className="notice info" role="note">Photos stay in this browser. Text is read on your device. Only the ingredient text you choose to analyze is sent for name matching.</p>

      <section className="card" aria-labelledby="cap">
        <h2 id="cap">1. Add photos of the ingredient list</h2>
        <label htmlFor="file">Take or choose photos (add several if the list wraps around the bottle)</label>
        <input id="file" type="file" accept="image/*" capture="environment" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        {error && <p role="alert" className="notice warn">{error}</p>}
      </section>

      {photos.map((p, n) => (
        <PhotoCard key={p.id} index={n + 1} photo={p} onChange={(patch) => update(p.id, patch)} onRead={() => read(p)} onRemove={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} />
      ))}

      <section className="card" aria-labelledby="rev">
        <h2 id="rev">2. Check the text</h2>
        <label htmlFor="txt">Ingredient text (edit anything the camera got wrong)</label>
        <textarea id="txt" value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} placeholder="Read a photo above, or type or paste the ingredient list here." />
        <div className="row">
          {edited && mergedText && <button className="secondary" onClick={() => { setEdited(false); setText(mergedText); }}>Reset to the text read from photos</button>}
          <button onClick={analyze} disabled={busy || !text.trim()}>{busy ? "Analyzing…" : "Analyze ingredients"}</button>
        </div>
        {merged && merged.warnings.map((w) => <p key={w} className="notice warn" role="status">{w}</p>)}
        {merged && photos.filter((p) => p.status === "done").length > 1 && merged.overlapFound && <p className="notice info" role="status">Merged {photos.filter((p) => p.status === "done").length} photos; {merged.matched} ingredients appeared in more than one.</p>}
        {merged && (
          <details>
            <summary>Where each ingredient came from ({merged.segments.length})</summary>
            <ul className="plain">{merged.segments.map((s: MSegment, i) => (
              <li key={i}>{s.text} <small className="muted">· {s.sources.join(" + ")}{s.conflict ? " · photos disagreed; kept the clearer reading" : ""}{s.conf < LOW_CONF ? " · low confidence, please check" : ""}</small></li>))}</ul>
          </details>
        )}
      </section>

      {result && (
        <section className="card" aria-labelledby="res" aria-live="polite">
          <h2 id="res">3. Ingredients</h2>
          {result.notice && <p className="notice warn" role="status">{result.notice}</p>}
          <p>{result.items.length} items{needsReview ? `; ${needsReview} still need review` : ""}.</p>
          <p className="muted"><small>A name match shows identity only. It is not a safety statement. Suggestions are never applied until you confirm them (review panel arrives in a later phase).</small></p>
          <ul className="plain">{result.items.map((it, i) => {
            const v = statusView(it, it.source);
            return (<li key={i}><strong>{it.raw}</strong> <span className={`badge ${v.cls}`}>{v.label}</span>
              {it.inci_name ? <> <small className="muted">→ {it.inci_name}</small></> : null}
              {it.status === "suggested" && it.candidates?.length ? <small className="muted"> Possible: {it.candidates.map((c) => c.inci_name).join(", ")}{it.highConfidence ? "" : " (not certain)"}</small> : null}
              {it.status === "suggested" && it.candidates?.[0]?.note ? <small className="notice warn" role="note" style={{ display: "block" }}>{it.candidates[0].note}</small> : null}
              {it.mergedFrom ? <small className="muted"> · merged from {it.mergedFrom} fragments</small> : null}{it.splitFrom ? <small className="muted"> · split from one token</small> : null}
              {it.notes?.length ? <small className="muted"> {it.notes.join(" ")}</small> : null}</li>);
          })}</ul>
          {result.removed?.length ? <details><summary>Removed as not ingredients ({result.removed.length})</summary><ul className="plain">{result.removed.map((r, i) => <li key={i}>{r.raw} <small className="muted">· {r.reason}</small></li>)}</ul></details> : null}
        </section>
      )}
    </main>
  );
}

function PhotoCard({ index, photo: p, onChange, onRead, onRemove }: { index: number; photo: Photo; onChange: (patch: Partial<Photo>) => void; onRead: () => void; onRemove: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {   // preview = what OCR will see (after crop and manual rotation), at screen size
    const c = canvas.current; if (!c) return;
    const g = toGray(p.rgba), s = Math.min(1, 800 / Math.max(g.width, g.height));
    const small = s < 1 ? resizeGray(g, Math.round(g.width * s), Math.round(g.height * s)) : g;
    const rect = { x: (p.trim.l / 100) * small.width, y: (p.trim.t / 100) * small.height, width: (1 - (p.trim.l + p.trim.r) / 100) * small.width, height: (1 - (p.trim.t + p.trim.b) / 100) * small.height };
    const view = rotateGray(cropGray(small, rect), p.rotate), rgba = grayToRGBA(view);
    c.width = rgba.width; c.height = rgba.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height), 0, 0);
  }, [p.rgba, p.trim, p.rotate]);
  const id = `ph${p.id}`;
  const trimInput = (k: keyof Trim, label: string) => (
    <div><label htmlFor={`${id}-${k}`}>{label}: {p.trim[k]}%</label>
      <input id={`${id}-${k}`} type="range" min={0} max={45} step={1} value={p.trim[k]} onChange={(e) => onChange({ trim: { ...p.trim, [k]: Number(e.target.value) } })} /></div>);
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Photo {index}: {p.name}</h2>
      {p.report && !p.report.ok && <div role="status">{p.report.prompts.map((m) => <p key={m} className="notice warn">{m}</p>)}</div>}
      {p.report?.ok && p.status !== "done" && <p className="notice info" role="status">No blur, glare or size problems found. Press the button below to read the text; we will tell you if it could not be read.</p>}
      <canvas ref={canvas} aria-label={`Preview of photo ${index} after crop and rotation`} />
      <details>
        <summary>Crop and rotate</summary>
        <div className="row">
          <button className="secondary" onClick={() => onChange({ rotate: p.rotate - 90 })}>Rotate left 90°</button>
          <button className="secondary" onClick={() => onChange({ rotate: p.rotate + 90 })}>Rotate right 90°</button>
        </div>
        <label htmlFor={`${id}-rot`}>Fine rotation: {p.rotate}°</label>
        <input id={`${id}-rot`} type="range" min={-180} max={180} step={0.5} value={p.rotate} onChange={(e) => onChange({ rotate: Number(e.target.value) })} />
        {trimInput("l", "Trim left")}{trimInput("r", "Trim right")}{trimInput("t", "Trim top")}{trimInput("b", "Trim bottom")}
        <p className="muted"><small>Text that is only slightly tilted is straightened automatically.</small></p>
      </details>
      <div className="row">
        <button onClick={onRead} disabled={p.status === "reading"}>{p.status === "reading" ? `Reading… ${Math.round(p.progress * 100)}%` : p.status === "done" ? "Read again" : "Read text from this photo"}</button>
        <button className="secondary" onClick={onRemove}>Remove photo</button>
      </div>
      {p.warnings?.map((w) => <p key={w} role="status" className="notice warn">{w}</p>)}
      {p.status === "idle" && !p.warnings && <p className="muted"><small>Tip: crop to just the ingredient list before reading. It removes marketing text and reads more accurately.</small></p>}
      {p.note && <p role="status" className={p.status === "error" ? "notice warn" : "muted"}><small>{p.note}</small></p>}
    </section>
  );
}

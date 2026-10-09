"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { createOcrWorker, runOcr } from "@/lib/ocr/engine";
import { grayToRGBA, resizeGray, toGray, type RGBA } from "@/lib/ocr/image";
import { mergePhotos, segmentsFromLines, segmentsToText, type MSegment } from "@/lib/ocr/merge";
import { prepareForOcr } from "@/lib/ocr/pipeline";
import { crop as cropGray, rotate as rotateGray } from "@/lib/ocr/preprocess";
import { assess, assessOcr, type QualityReport } from "@/lib/ocr/quality";
import { loadProfile } from "@/lib/rules/profileStore";
import { EMPTY_PROFILE, type Profile } from "@/lib/rules/types";
import ResultsPanel, { type ApiResult } from "./ResultsPanel";

interface Trim { l: number; t: number; r: number; b: number }
type Role = "ingredients" | "front" | "dates";
interface Photo {
  role: Role; id: string; name: string; rgba: RGBA; trim: Trim; rotate: number; report?: QualityReport;
  status: "idle" | "reading" | "done" | "error"; progress: number; warnings?: string[]; lines?: { words: { text: string; confidence: number }[] }[]; note?: string;
}

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

export default function AnalyzeClient() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  useEffect(() => { setProfile(loadProfile()); }, []);   // local only
  const [useAgent, setUseAgent] = useState(false);   // opt-in, off by default
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
        setPhotos((ps) => [...ps, { role: "ingredients", id: `p${++seq.current}`, name: f.name, rgba, trim: { l: 0, t: 0, r: 0, b: 0 }, rotate: 0, status: "idle", progress: 0 }]);
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
    const done = photos.filter((p) => p.role === "ingredients" && p.status === "done" && p.lines);
    if (!done.length) return null;
    const segs = done.map((p) => segmentsFromLines(p.lines!.map((l) => ({ words: l.words.map((w) => ({ ...w })) })), p.name));
    return mergePhotos(segs);
  }, [photos]);

  // front-of-pack and dates photos: text and OCR confidences are kept only while the box is unedited
  const roleWords = (r: Role) => photos.filter((p) => p.role === r && p.status === "done" && p.lines).flatMap((p) => p.lines!.flatMap((l) => l.words));
  const roleText = (r: Role) => photos.filter((p) => p.role === r && p.status === "done" && p.lines).flatMap((p) => p.lines!.map((l) => l.words.map((w) => w.text).join(" "))).join("\n");
  const frontRead = roleText("front"), datesRead = roleText("dates");
  const [frontText, setFrontText] = useState(""), [frontEdited, setFrontEdited] = useState(false);
  const [datesText, setDatesText] = useState(""), [datesEdited, setDatesEdited] = useState(false);
  useEffect(() => { if (!frontEdited) setFrontText(frontRead); }, [frontRead, frontEdited]);
  useEffect(() => { if (!datesEdited) setDatesText(datesRead); }, [datesRead, datesEdited]);
  const digitConfs = datesEdited ? [] : roleWords("dates").filter((w) => /\d/.test(w.text)).map((w) => w.confidence);
  const datesConf = digitConfs.length ? Math.min(...digitConfs) : undefined;
  const frontWords = frontEdited ? undefined : roleWords("front");

  const mergedText = merged ? segmentsToText(merged.segments) : "";
  useEffect(() => { if (!edited) setText(mergedText); }, [mergedText, edited]);

  async function analyze() {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, useAgent }) });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch { setError("Analysis failed. Check your connection and try again."); }
    setBusy(false);
  }

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
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} /> Use AI to help identify unrecognized names (sends only those names, never your photo or profile).</label>
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

      <section className="card" aria-labelledby="pack">
        <h2 id="pack">Optional: front of pack and dates</h2>
        <p className="muted"><small>Set a photo's role below to read these from a photo, or just type them. Used only to check claims and dates; nothing here is sent anywhere.</small></p>
        <label htmlFor="front">Front-of-pack text (claims such as “fragrance free”)</label>
        <textarea id="front" value={frontText} onChange={(e) => { setFrontText(e.target.value); setFrontEdited(true); }} />
        <label htmlFor="dates">Dates and other pack text (batch, MFG, EXP, PAO)</label>
        <textarea id="dates" value={datesText} onChange={(e) => { setDatesText(e.target.value); setDatesEdited(true); }} />
      </section>

      {result && <ResultsPanel result={result} profile={profile} pack={{ frontText, frontWords, datesText, datesConf }} />}
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
      <label htmlFor={`${id}-role`}>What does this photo show?</label>
      <select id={`${id}-role`} value={p.role} onChange={(e) => onChange({ role: e.target.value as Role })}>
        <option value="ingredients">Ingredient list</option><option value="front">Front of pack (claims)</option><option value="dates">Dates / batch / PAO</option>
      </select>
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

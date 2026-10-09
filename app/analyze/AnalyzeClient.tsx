"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { createOcrWorker, runOcr } from "@/lib/ocr/engine";
import { grayToRGBA, resizeGray, toGray, type Gray, type RGBA } from "@/lib/ocr/image";
import { consensus } from "@/lib/ocr/consensus";
import { buildLexicon, type Lexicon } from "@/lib/ocr/lexicon";
import { VARIANTS, cylinderUnwarp } from "@/lib/ocr/unwarp";
import { mergePhotos, segmentsFromLines, segmentsToText, type MSegment } from "@/lib/ocr/merge";
import { prepareForOcr } from "@/lib/ocr/pipeline";
import { crop as cropGray, rotate as rotateGray } from "@/lib/ocr/preprocess";
import { assess, assessOcr, type QualityReport } from "@/lib/ocr/quality";
import { loadProfile } from "@/lib/rules/profileStore";
import { EMPTY_PROFILE, type Profile } from "@/lib/rules/types";
import "./analyze.css";
import { NO_CHOICES, type Choices } from "./choices";
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
  useEffect(() => { setProfile(loadProfile()); fetch("/api/warm").catch(() => {}); }, []);   // profile: local only; warm-up: wakes an idle matching service, sends nothing
  const [choices, setChoices] = useState<Choices>(NO_CHOICES);   // review decisions: session state only
  const [agentAsked, setAgentAsked] = useState(false);
  const [useAgent, setUseAgent] = useState(false);   // opt-in, off by default
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [ink, setInk] = useState(0);
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const lexicon = useRef<Lexicon | null>(null);
  const onProgress = useRef<(x: number) => void>(() => {});
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

  async function getWorker() {
    if (!worker.current) {
      worker.current = await createOcrWorker({ workerPath: "/tesseract/worker.min.js", corePath: "/tesseract", langPath: "/tesseract",
        logger: (m) => { if (m.status === "recognizing text") onProgress.current(m.progress); } });
    }
    return worker.current;
  }
  async function ocrGray(g: Gray) {
    const rgba = grayToRGBA(g);
    const c = document.createElement("canvas"); c.width = rgba.width; c.height = rgba.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height), 0, 0);
    return runOcr(await getWorker(), c);
  }

  async function read(p: Photo) {
    update(p.id, { status: "reading", progress: 0, note: undefined });
    onProgress.current = (x) => update(p.id, { progress: x });
    try {
      const prep = prepareForOcr(p.rgba, { crop: cropRect(p), rotateDeg: p.rotate });
      const r = await ocrGray(prep.image);
      update(p.id, { status: "done", progress: 1, lines: r.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })) })),
        warnings: assessOcr(r.text, r.words, r.meanConfidence),
        note: `${prep.skewApplied ? "Straightened the text. " : ""}Read in this browser.` });
    } catch (e) { update(p.id, { status: "error", note: "Could not read this photo. You can type the ingredients instead." }); console.error(e); }
  }

  /** "Try harder": reads the photo several ways (as is, and with curved-bottle corrections), then keeps the best reading of each ingredient. */
  async function readHarder(p: Photo) {
    update(p.id, { status: "reading", progress: 0.02, note: "Trying several corrections for a curved or blurry label. This takes about half a minute." });
    try {
      if (!lexicon.current) { const res = await fetch("/lexicon/names.json"); lexicon.current = buildLexicon((await res.json()) as string[]); }
      const base = prepareForOcr(p.rgba, { crop: cropRect(p), rotateDeg: p.rotate }).image;
      const total = VARIANTS.length + 1, passes: { id: string; segments: ReturnType<typeof segmentsFromLines> }[] = [];
      const jobs: { id: string; g: Gray }[] = [{ id: "ship", g: base }, ...VARIANTS.map((v) => { const w = v.c !== undefined ? cylinderUnwarp(base, v.c, v.rho!) : base; return { id: v.id, g: resizeGray(w, Math.round(w.width * v.scale), Math.round(w.height * v.scale)) }; })];
      for (let i = 0; i < jobs.length; i++) {
        onProgress.current = (x) => update(p.id, { progress: (i + x) / total });
        const r = await ocrGray(jobs[i].g);
        passes.push({ id: jobs[i].id, segments: segmentsFromLines(r.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })) })), jobs[i].id) });
        update(p.id, { progress: (i + 1) / total, note: `Reading pass ${i + 1} of ${total}…` });
      }
      const c = consensus(passes, lexicon.current);
      // one line per ingredient, each ending in a comma, so the normal merge and text steps see them as separate ingredients
      const lines = c.items.map((it) => ({ words: it.seg.words.map((w, k, a) => (k === a.length - 1 ? { text: `${w.text.replace(/[,;.]+$/, "")},`, confidence: w.confidence } : { text: w.text, confidence: w.confidence })) }));
      const words = lines.flatMap((l) => l.words), text = lines.map((l) => l.words.map((w) => w.text).join(" ")).join("\n");
      const added = c.items.filter((i) => i.from !== "base").length;
      update(p.id, { status: "done", progress: 1, lines, warnings: assessOcr(text, words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } })), words.length ? words.reduce((a, w) => a + w.confidence, 0) / words.length : 0),
        note: `Combined ${total} readings of this photo: ${c.items.length} ingredient readings, ${added} of them taken from a different pass than the main one. Corrections are guesses at the bottle's curve, so check every name against the label.` });
    } catch (e) { update(p.id, { status: "error", note: "Could not run the extra readings. The earlier reading is gone; press “Read text from this photo” to read once again, or type the ingredients." }); console.error(e); }
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
  useEffect(() => { if (!edited) { setText(mergedText); if (mergedText) setInk((n) => n + 1); } }, [mergedText, edited]);

  async function analyze(t = text, noMerge: string[] = choices.noMerge) {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, useAgent, noMerge }) });
      if (!res.ok) throw new Error(String(res.status));
      setAgentAsked(useAgent);
      setResult(await res.json());
    } catch { setError("Analysis failed. Check your connection and try again."); }
    setBusy(false);
  }
  /** Re-run from the review panel (edit text / split merge): the earlier results are cleared first so nothing stale stays on screen. */
  function rerun(t: string, noMerge?: string[]) { setText(t); setEdited(true); analyze(t, noMerge ?? choices.noMerge); }

  const hasInput = photos.length > 0 || text.trim().length > 0;
  return (
    <main className="az">
      <header className="az-hero">
        <h1>Analyze a label</h1>
        <p>Add the ingredient list and see what each part is listed as doing. Photos stay in this browser, text is read on your device, and only the ingredient text you choose to analyze is sent for name matching.</p>
        <ol className="stepper" aria-label="Steps">
          <li className={hasInput ? "done" : "now"}>Add the label</li>
          <li className={result ? "done" : hasInput ? "now" : ""}>Check the text</li>
          <li className={result ? "now" : ""}>See what is in it</li>
        </ol>
      </header>

      <section aria-labelledby="cap">
        <h2 id="cap" className="sr-only">1. Add photos of the ingredient list</h2>
        <div className={`drop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
          <label htmlFor="file" className="drop-hit"><span className="sr-only">Choose photos of the ingredient list</span></label>
          <input id="file" className="sr-only" type="file" accept="image/*" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <input id="camera" className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <svg className="drop-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle className="ring" cx="60" cy="60" r="50" opacity=".5" />
            <rect x="34" y="30" width="52" height="62" rx="9" /><path d="M44 46h32M44 56h32M44 66h22" />
            <path className="scan" d="M30 60h60" stroke="oklch(70% .17 155)" strokeWidth="3" />
            <g className="leaf"><path d="M86 98c10-4 16-12 16-22-10 2-16 10-16 22z" /><path d="M86 98c-2-8-8-14-16-16" /></g>
          </svg>
          <p className="drop-title">Drop a photo of the ingredient list</p>
          <p className="drop-sub">or choose one. Add several if the list wraps around the bottle.</p>
          <div className="pill-row">
            <label htmlFor="file" className="pill-btn">Choose photos</label>
            <label htmlFor="camera" className="pill-btn ghost">Take a photo</label>
            <button type="button" className="pill-btn ghost" onClick={() => { const t = document.getElementById("txt"); t?.scrollIntoView({ behavior: "smooth", block: "center" }); (t as HTMLTextAreaElement | null)?.focus(); }}>Type or paste instead</button>
          </div>
        </div>
        {error && <p role="alert" className="notice warn">{error}</p>}
        <details className="tips">
          <summary>Tips for a good photo</summary>
          <ul>
            <li>Hold the phone parallel to the label, in even light, and tap to focus. Avoid glare and shadows.</li>
            <li>Crop to just the ingredient lines, and trim away any half-cut line at the top or bottom: those produce junk words.</li>
            <li><strong>Curved bottle or tube?</strong> The text near the edges is squeezed, so the first or last words of each line are the likeliest to be wrong or missing. Take one photo with the bottle turned left and another turned right, add both here, and they are merged.</li>
          </ul>
        </details>
      </section>

      {photos.map((p, n) => (
        <PhotoCard key={p.id} index={n + 1} photo={p} onChange={(patch) => update(p.id, ("trim" in patch || "rotate" in patch) && (p.status === "done" || p.status === "error") ? { ...patch, status: "idle", progress: 0, lines: undefined, warnings: undefined, note: "You changed the crop or rotation, so the earlier reading no longer applies. Press “Read text from this photo” to read the new view." } : patch)} onRead={() => read(p)} onHarder={() => readHarder(p)} onRemove={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} />
      ))}

      <section className="card" aria-labelledby="rev">
        <h2 id="rev">2. Check the text</h2>
        <label htmlFor="txt">Ingredient text (edit anything the camera got wrong)</label>
        <textarea id="txt" key={ink} className={ink ? "ink" : ""} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} placeholder="Read a photo above, or type or paste the ingredient list here." />
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} /> Use AI to help identify unrecognized names (sends only those names, never your photo or profile).</label>
        <div className="row">
          {edited && mergedText && <button className="secondary" onClick={() => { setEdited(false); setText(mergedText); }}>Reset to the text read from photos</button>}
          <button onClick={() => analyze()} disabled={busy || !text.trim()}>{busy ? "Analyzing…" : "Analyze ingredients"}</button>
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

      {result && <ResultsPanel result={result} profile={profile} pack={{ frontText, frontWords, datesText, datesConf }} choices={choices} setChoices={setChoices} onRerun={rerun} requestedAgent={agentAsked} />}
    </main>
  );
}

function PhotoCard({ index, photo: p, onChange, onRead, onHarder, onRemove }: { index: number; photo: Photo; onChange: (patch: Partial<Photo>) => void; onRead: () => void; onHarder: () => void; onRemove: () => void }) {
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
      <div className={`scanframe${p.status === "reading" ? " reading" : ""}`}>
        <canvas ref={canvas} aria-label={`Preview of photo ${index} after crop and rotation`} />
        <i className="corner c1" aria-hidden="true" /><i className="corner c2" aria-hidden="true" /><i className="corner c3" aria-hidden="true" /><i className="corner c4" aria-hidden="true" />
        <span className="beam2" aria-hidden="true" />
        <span className="readpill" aria-hidden="true"><svg className="ring-svg" viewBox="0 0 24 24"><circle className="bg" cx="12" cy="12" r="9" /><circle className="fg" cx="12" cy="12" r="9" strokeDasharray="56.5" strokeDashoffset={56.5 * (1 - Math.max(0.05, p.progress))} /></svg>Reading {Math.round(p.progress * 100)}%</span>
      </div>
      {p.status === "done" && p.lines && <p className="read-done" role="status">Read {p.lines.reduce((n, l) => n + l.words.length, 0)} words</p>}
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
        {(p.status === "done" || p.status === "error") && <button className="secondary" onClick={onHarder} title="Reads the photo several ways (including curved-bottle corrections) and keeps the best reading of each ingredient">Try harder (curved or blurry label)</button>}
        <button className="secondary" onClick={onRemove}>Remove photo</button>
      </div>
      {p.warnings?.map((w) => <p key={w} role="status" className="notice warn">{w}</p>)}
      {p.status === "done" && p.warnings && p.warnings.length > 0 && <p role="note" className="notice info"><small>If this label is on a curved bottle, the words at the left and right edges of each line are squeezed and are the ones most likely to be missing or wrong. Turn the bottle so the weak edge faces the camera, add a second photo, and the two readings are merged. Check the text below against the label either way.</small></p>}
      {p.status === "idle" && !p.warnings && <p className="muted"><small>Tip: crop to just the ingredient list before reading. It removes marketing text and reads more accurately.</small></p>}
      {p.note && <p role="status" className={p.status === "error" ? "notice warn" : "muted"}><small>{p.note}</small></p>}
    </section>
  );
}

"use client";
import { useState } from "react";
import { titleCase } from "@/lib/rules/data";
import { ck, type Choices } from "./choices";
import { NEEDS_REVIEW, type ApiItem, type Bucket, BUCKET } from "./ResultsPanel";

export interface Cand { inci_name: string; score: number; note?: string | null; source?: string; source_id?: string | null; edits?: string[] }

const EU_GLOSSARY = "https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database/cosing-glossary-ingredients_en";
/** Where a candidate name comes from: a link the user can open. AI candidates are labelled separately. */
function sourceOf(c: Cand, dict: string | null): { label: string; url: string } {
  if (c.source === "pubchem") return { label: "PubChem", url: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(c.inci_name)}` };
  if (dict === "seed") return { label: "Starter list (not the EU glossary)", url: EU_GLOSSARY };
  return { label: "EU glossary of common ingredient names", url: EU_GLOSSARY };
}
const why = (c: Cand) => {
  if (c.source === "ai_agent") return (c.note ?? "").replace(/^AI suggestion \([a-z]+\): ?/, "") || "Found by a lookup.";
  const e = (c.edits ?? []).filter(Boolean);
  return c.note ? c.note : e.length ? `Close to what is printed once these differences are allowed for: ${e.join("; ")}.` : "Closest dictionary name by spelling.";
};

export default function ReviewPanel({ shown, buckets, source, choices, set, rebuild, onRerun }: {
  shown: ApiItem[]; buckets: Bucket[]; source: string | null; choices: Choices; set: (f: (c: Choices) => Choices) => void;
  rebuild: (replace?: { index: number; text: string }) => string; onRerun: (text: string, noMerge?: string[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null), [draft, setDraft] = useState(""), [bulk, setBulk] = useState(false);
  const review = shown.map((a, i) => ({ a, i })).filter(({ i }) => NEEDS_REVIEW.includes(buckets[i]) && !shown[i].optional);
  const highs = review.filter(({ a }) => a.status === "suggested" && a.highConfidence && a.candidates?.[0] && a.candidates[0].source !== "ai_agent");
  if (!review.length) return null;
  const use = (a: ApiItem, name: string) => set((c) => ({ ...c, accepted: { ...c.accepted, [ck(a.raw)]: name } }));

  return (
    <section aria-labelledby="rv" className="review">
      <h3 id="rv">Review ({review.length})</h3>
      <p className="muted"><small>Nothing below is applied until you choose. Your choices are kept for this visit only and are not saved or sent anywhere.</small></p>
      {highs.length > 0 && (
        <div className="notice info">
          {!bulk ? <button onClick={() => setBulk(true)}>Accept all high-confidence suggestions ({highs.length})</button> : (
            <div role="group" aria-label="Confirm accepting all high-confidence suggestions">
              <strong>These {highs.length} will be accepted:</strong>
              <ul className="plain">{highs.map(({ a }) => <li key={a.raw}>“{a.raw}” → <strong>{titleCase(a.candidates![0].inci_name)}</strong></li>)}</ul>
              <div className="row">
                <button onClick={() => { set((c) => ({ ...c, accepted: { ...c.accepted, ...Object.fromEntries(highs.map(({ a }) => [ck(a.raw), a.candidates![0].inci_name])) } })); setBulk(false); }}>Accept these {highs.length}</button>
                <button className="secondary" onClick={() => setBulk(false)}>Cancel</button>
              </div>
            </div>)}
          <p className="muted"><small>“High confidence” means the spelling is very close to exactly one dictionary name. It is still a suggestion; check the list.</small></p>
        </div>)}

      <ul className="plain">{review.map(({ a, i }) => {
        const b = BUCKET[buckets[i]];
        const all = a.candidates ?? [], ai = all.filter((c) => c.source === "ai_agent").slice(0, 2), det = all.filter((c) => c.source !== "ai_agent");
        const cands = [...det.slice(0, Math.max(1, 3 - ai.length)), ...ai].slice(0, 3);     // at most 3; an AI suggestion is never cut off by deterministic ones
        const conf = a.ocrWordConfidence;
        return (
          <li key={`${i}-${a.raw}`} className="card review-card">
            <div className="row"><strong>“{a.raw}”</strong> <span className={`badge ${b.cls}`}>{b.label}</span></div>
            <small className="muted">OCR confidence: {conf == null ? "not available (typed text, or the whole list was read at once)" : `${Math.round(conf)}%`}{a.mergedFrom ? ` · merged from ${a.mergedFrom} fragments` : ""}</small>
            {a.notes?.map((n) => <small key={n} className="muted" style={{ display: "block" }}>{n}</small>)}
            {cands.length > 0 ? (
              <ul className="plain" aria-label={`Candidates for ${a.raw}`}>{cands.map((c) => {
                const s = sourceOf(c, source);
                return (
                  <li key={c.inci_name} className="cand">
                    <div className="row"><strong>{titleCase(c.inci_name)}</strong>
                      {c.source === "ai_agent" && <span className="badge ambiguous">AI suggestion</span>}
                      <button className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem" }} aria-label={`Use this: ${titleCase(c.inci_name)} for ${a.raw}`} onClick={() => use(a, c.inci_name)}>Use this</button></div>
                    <small>{why(c)} <span className="muted">Source: <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>{c.source === "ai_agent" ? ". Offered by the AI helper; only a possible name, not applied until you choose" : ""}.</span></small>
                  </li>);
              })}</ul>) : <p className="muted"><small>No candidate names. You can edit the text, keep it as printed, or mark it as not an ingredient.</small></p>}
            {editing === i ? (
              <div className="row">
                <label htmlFor={`ed-${i}`} className="sr-only">Corrected text for {a.raw}</label>
                <input id={`ed-${i}`} type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onRerun(rebuild({ index: i, text: draft.trim() })); setEditing(null); } }} />
                <button disabled={!draft.trim()} onClick={() => { onRerun(rebuild({ index: i, text: draft.trim() })); setEditing(null); }}>Check again</button>
                <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              </div>) : (
              <div className="row">
                <button className="secondary" onClick={() => set((c) => ({ ...c, kept: { ...c.kept, [ck(a.raw)]: true } }))}>Keep as typed</button>
                <button className="secondary" onClick={() => { setEditing(i); setDraft(a.raw); }}>Edit text</button>
                <button className="secondary" onClick={() => set((c) => ({ ...c, notIngredient: { ...c.notIngredient, [ck(a.raw)]: true } }))}>Not an ingredient</button>
                {a.mergedFrom && a.fragments && a.fragments.length > 1 && (
                  <button className="secondary" onClick={() => { const text = rebuild({ index: i, text: a.fragments!.join(", ") }); const nm = a.fragments!; set((c) => ({ ...c, noMerge: [...new Set([...c.noMerge, ...nm])] })); onRerun(text, [...new Set([...choices.noMerge, ...nm])]); }}>Split merge</button>)}
              </div>)}
          </li>);
      })}</ul>
    </section>
  );
}

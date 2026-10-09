"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GLOSSARY, titleCase } from "@/lib/rules/data";
import { evaluate, identityOf } from "@/lib/rules/engine";
import type { Finding, ItemIn, Profile, Source, Tier } from "@/lib/rules/types";
import type { OcrWordIn } from "@/lib/trust/misspell";
import SaveProduct from "./SaveProduct";
import TrustPanel from "./TrustPanel";

export interface ApiItem {
  raw: string; status: string; layer?: string; inci_name?: string | null; inci?: string; category?: string | null; source?: string | null;
  highConfidence?: boolean; candidates?: { inci_name: string; score: number; note?: string | null }[]; notes?: string[];
  mergedFrom?: number | null; splitFrom?: string | null; optional?: boolean; index?: number;
}
export interface ApiResult { engine: "enhanced" | "fallback"; notice?: string; items: ApiItem[]; removed?: { raw: string; reason: string }[]; meta?: { dictionarySource?: string } }

const TIER_LABEL: Record<Tier, string> = { avoid: "Avoid", caution: "Caution", note: "Note" };
const TIER_CLASS: Record<Tier, string> = { avoid: "notfound", caution: "suggested", note: "class" };   // never green: a finding is not reassurance

function statusView(it: ApiItem, source?: string | null): { label: string; cls: string } {
  if (it.status === "resolved") {
    if (it.layer === "category_recognized") return { label: "Recognized ingredient class", cls: "class" };
    if (it.layer === "pubchem_match") return { label: "PubChem record match (identity only)", cls: "resolved" };
    return { label: it.layer === "inci_alias" ? "Synonym match" : source === "cosing" ? "INCI match (CosIng)" : "Name match (starter list)", cls: "resolved" };
  }
  if (it.status === "suggested") return { label: "Suggested: needs your confirmation", cls: "suggested" };
  if (it.status === "ambiguous") return { label: "Ambiguous", cls: "ambiguous" };
  if (it.status === "lookup_unavailable") return { label: "Lookup unavailable", cls: "unavailable" };
  if (it.status === "inci_exact") return { label: "Name match (starter list)", cls: "resolved" };
  if (it.status === "pubchem_match") return { label: "PubChem record match (identity only)", cls: "resolved" };
  return { label: "Not found", cls: "notfound" };
}
const SrcLinks = ({ list }: { list: Source[] }) => <>{list.map((s, i) => <span key={`${i}-${s.url}`}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></span>)}</>;

export function toItemIn(it: ApiItem, i: number): ItemIn {
  // the fallback (TypeScript) engine returns {status:'inci_exact', inci}; map it to the same shape
  if (it.status === "inci_exact") return { index: i, raw: it.raw, status: "resolved", layer: "inci_exact", inci_name: it.inci ?? null };
  return { index: i, raw: it.raw, status: it.status, layer: it.layer, inci_name: it.inci_name, category: it.category, candidates: it.candidates, highConfidence: it.highConfidence, source: it.source, optional: it.optional };
}

export interface PackText { frontText: string; frontWords?: OcrWordIn[]; datesText: string; datesConf?: number }

export default function ResultsPanel({ result, profile, pack }: { result: ApiResult; profile: Profile; pack: PackText }) {
  const [accepted, setAccepted] = useState<Record<number, string>>({});
  const items = useMemo(() => result.items.map(toItemIn), [result]);
  const ev = useMemo(() => evaluate(items, profile, accepted), [items, profile, accepted]);
  const source = result.meta?.dictionarySource ?? null;

  return (
    <>
    <section className="card" aria-labelledby="res">
      <h2 id="res">3. Ingredients</h2>
      {result.notice && <p className="notice warn" role="status">{result.notice}</p>}
      <p className={`notice ${ev.banner.avoidMatches ? "warn" : "info"}`} role="status" aria-live="polite"><strong>{ev.banner.text}</strong></p>
      <p><small className="muted">{profile.avoid.length ? "Checked against your avoid list on this device. " : ""}<Link href="/profile">Edit your profile and avoid list</Link></small></p>
      {ev.summary && <p>{ev.summary}</p>}
      <p className="muted"><small>Identity, role, hazard, exposure, regulation and your own compatibility are separate questions. A PubChem record shows identity only, and a CosIng listing is not a safety approval. Nothing here is a verdict, and suggestions are never applied until you confirm them.</small></p>

      <ul className="plain">{result.items.map((a, i) => {
        const it = items[i], id = identityOf(it, accepted), v = statusView(a, source), fs: Finding[] = ev.findings[i];
        const accIsSuggestion = id.via === "accepted";
        return (
          <li key={i}>
            <strong>{a.raw}</strong> <span className={`badge ${accIsSuggestion ? "resolved" : v.cls}`}>{accIsSuggestion ? "Accepted by you" : v.label}</span>
            {id.inci ? <small className="muted"> → {titleCase(id.inci)}</small> : null}
            {fs.map((f) => <span key={f.ruleId} className={`badge ${TIER_CLASS[f.tier]}`} style={{ marginLeft: ".4rem" }}>{TIER_LABEL[f.tier]}</span>)}
            {a.status === "suggested" && !accIsSuggestion && a.candidates?.length ? (
              <div role="group" aria-label={`Candidates for ${a.raw}`}>
                <small className="muted">Possible{a.highConfidence ? "" : " (not certain)"}: </small>
                {a.candidates.slice(0, 3).map((c) => <button key={c.inci_name} className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem", marginRight: ".3rem" }} onClick={() => setAccepted((x) => ({ ...x, [i]: c.inci_name }))}>Use {titleCase(c.inci_name)}</button>)}
              </div>) : null}
            {accIsSuggestion ? <button className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem" }} onClick={() => setAccepted((x) => { const y = { ...x }; delete y[i]; return y; })}>Undo</button> : null}
            {a.status === "suggested" && !accIsSuggestion && a.candidates?.[0]?.note ? <small className="notice warn" role="note" style={{ display: "block" }}>{a.candidates[0].note}</small> : null}
            {a.mergedFrom ? <small className="muted"> · merged from {a.mergedFrom} fragments</small> : null}{a.splitFrom ? <small className="muted"> · split from one token</small> : null}
            {fs.filter((f) => f.tier !== "note" || true).map((f) => (
              <div key={`${f.ruleId}-n`} className={`notice ${f.tier === "note" ? "info" : "warn"}`} role="note" style={{ margin: ".3rem 0" }}>
                <strong>{TIER_LABEL[f.tier]}: {f.title}.</strong> {f.explanation}
              </div>))}
            <details>
              <summary>Evidence for this ingredient</summary>
              <dl style={{ margin: ".4rem 0" }}>
                <dt><strong>Identity</strong></dt>
                <dd>{accIsSuggestion ? `You accepted ${titleCase(id.inci!)} (a suggestion).` : v.label}{a.layer ? ` · matched by: ${a.layer.replace(/_/g, " ")}` : ""}{source ? ` · dictionary: ${source === "seed" ? "starter list (not CosIng)" : source}` : ""}. Identity only: it is not a safety statement.</dd>
                <dt><strong>Function</strong></dt>
                <dd>Not available: CosIng function data is not loaded, so none is shown instead of guessing. ({GLOSSARY.terms.length} function terms are explained in plain language and will be used once it is.)</dd>
                <dt><strong>Regulatory status</strong></dt>
                <dd>{ev.regulatory[i].length ? ev.regulatory[i].map((r, ri) => r && <span key={`${ri}-${r.family}`} style={{ display: "block" }}>{r.family}: {r.text} <small className="muted">Source: <SrcLinks list={r.source} /></small></span>) : "No regulatory status is recorded for this ingredient in BeautyLens' curated data. That does not mean there is none."}</dd>
                <dt><strong>Rules that fired</strong></dt>
                <dd>{fs.length ? <ul className="plain">{fs.map((f) => <li key={f.ruleId}><strong>{TIER_LABEL[f.tier]}</strong> · {f.title} <small className="muted">(confidence: {f.confidence})</small><br /><small>{f.explanation}</small><br /><small className="muted">Source: <SrcLinks list={f.source} /></small></li>)}</ul> : "None. BeautyLens only has a small set of sourced rules, so no rule firing is not a clearance."}</dd>
                <dt><strong>Limitations</strong></dt>
                <dd><small>Listing order does not give the concentration. A match here does not tell you the amount or whether the product will affect you. {id.via === "none" ? "This ingredient is not identified yet, so no rule could be applied to it." : ""}</small></dd>
              </dl>
            </details>
          </li>);
      })}</ul>

      {ev.myth.length > 0 && (
        <div>
          <h3>Good to know</h3>
          {ev.myth.map((n) => <div key={n.id} className="notice info" role="note"><strong>{n.title}.</strong> {n.text} <small className="muted">Source: <SrcLinks list={n.source} /> · confidence: {n.confidence}</small></div>)}
        </div>)}
      {result.removed?.length ? <details><summary>Removed as not ingredients ({result.removed.length})</summary><ul className="plain">{result.removed.map((r, i) => <li key={i}>{r.raw} <small className="muted">· {r.reason}</small></li>)}</ul></details> : null}
    </section>
    <TrustPanel items={items} accepted={accepted} removedText={(result.removed ?? []).map((r) => r.raw)} frontText={pack.frontText} frontWords={pack.frontWords} datesText={pack.datesText} datesConf={pack.datesConf} />
    <SaveProduct items={items} accepted={accepted} packText={`${pack.frontText}\n${pack.datesText}`} />
    </>
  );
}

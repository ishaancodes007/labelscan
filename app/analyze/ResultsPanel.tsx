"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GLOSSARY, titleCase } from "@/lib/rules/data";
import { evaluate, identityOf } from "@/lib/rules/engine";
import type { Finding, ItemIn, Profile, Source, Tier } from "@/lib/rules/types";
import type { OcrWordIn } from "@/lib/trust/misspell";
import { ck, type Choices } from "./choices";
import ReviewPanel, { type Cand } from "./ReviewPanel";
import SaveProduct from "./SaveProduct";
import TrustPanel from "./TrustPanel";

export interface ApiItem {
  raw: string; status: string; layer?: string; inci_name?: string | null; inci?: string; category?: string | null; source?: string | null;
  highConfidence?: boolean; candidates?: Cand[]; notes?: string[]; fragments?: string[]; ocrWordConfidence?: number | null;
  mergedFrom?: number | null; splitFrom?: string | null; optional?: boolean; index?: number;
}
export interface ApiResult { engine: "enhanced" | "fallback"; notice?: string; items: ApiItem[]; removed?: { raw: string; reason: string }[]; meta?: { dictionarySource?: string; agentStatus?: string; agentTokensProcessed?: number; agentTokensSkipped?: number } }

const TIER_LABEL: Record<Tier, string> = { avoid: "Avoid", caution: "Caution", note: "Note" };
const TIER_CLASS: Record<Tier, string> = { avoid: "notfound", caution: "suggested", note: "class" };   // never green: a finding is not reassurance

export type Bucket = "inci" | "synonym" | "class" | "pubchem" | "accepted" | "kept" | "suggested" | "ambiguous" | "not_found" | "unavailable";
export const BUCKET: Record<Bucket, { label: string; cls: string }> = {
  inci: { label: "INCI name match (EU glossary)", cls: "resolved" }, synonym: { label: "Synonym match", cls: "resolved" },
  class: { label: "Recognized ingredient class", cls: "class" }, pubchem: { label: "PubChem record match (identity only)", cls: "resolved" },
  accepted: { label: "Accepted by you", cls: "resolved" }, kept: { label: "Kept as printed (unconfirmed)", cls: "class" },
  suggested: { label: "Suggested: needs your confirmation", cls: "suggested" }, ambiguous: { label: "Ambiguous", cls: "ambiguous" },
  not_found: { label: "Not found", cls: "notfound" }, unavailable: { label: "Lookup unavailable", cls: "unavailable" },
};
export const NEEDS_REVIEW: Bucket[] = ["suggested", "ambiguous", "not_found", "unavailable"];

export function bucketOf(a: ApiItem, accepted: boolean, kept: boolean): Bucket {
  if (accepted) return "accepted";
  if (kept) return "kept";
  const st = a.status;
  if (st === "resolved" || st === "inci_exact" || st === "pubchem_match") {
    if (a.layer === "category_recognized") return "class";
    if (a.layer === "pubchem_match" || st === "pubchem_match") return "pubchem";
    return a.layer === "inci_alias" ? "synonym" : "inci";
  }
  if (st === "suggested") return "suggested";
  if (st === "ambiguous") return "ambiguous";
  if (st === "lookup_unavailable") return "unavailable";
  return "not_found";
}

const SrcLinks = ({ list }: { list: Source[] }) => <>{list.map((s, i) => <span key={`${i}-${s.url}`}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></span>)}</>;

export function toItemIn(it: ApiItem, i: number, kept = false): ItemIn {
  // the fallback (TypeScript) engine returns {status:'inci_exact', inci}; map it to the same shape
  if (it.status === "inci_exact") return { index: i, raw: it.raw, status: "resolved", layer: "inci_exact", inci_name: it.inci ?? null };
  return { index: i, raw: it.raw, status: kept ? "kept" : it.status, layer: it.layer, inci_name: it.inci_name, category: it.category, candidates: it.candidates, highConfidence: it.highConfidence, source: it.source, optional: it.optional };
}

export interface PackText { frontText: string; frontWords?: OcrWordIn[]; datesText: string; datesConf?: number }

export default function ResultsPanel({ result, profile, pack, choices, setChoices, onRerun, requestedAgent }: {
  result: ApiResult; profile: Profile; pack: PackText; choices: Choices; setChoices: (f: (c: Choices) => Choices) => void; onRerun: (text: string, noMerge?: string[]) => void; requestedAgent: boolean;
}) {
  const [opened, setOpened] = useState(false);
  // items shown = analysis items + fragments the user restored, minus those marked "not an ingredient"
  const shownE = useMemo(() => {
    const restored = choices.restored.map((r) => ({ a: { raw: r.raw, status: "not_found", layer: "not_found", notes: ["Restored by you; it was classed as not an ingredient and has not been checked."] } as ApiItem, src: -1 }));
    return [...result.items.map((a, src) => ({ a, src })), ...restored].filter((e) => !choices.notIngredient[ck(e.a.raw)]);
  }, [result, choices.restored, choices.notIngredient]);
  const shown = useMemo(() => shownE.map((e) => e.a), [shownE]);
  const accepted = useMemo(() => Object.fromEntries(shown.flatMap((a, i) => (choices.accepted[ck(a.raw)] ? [[i, choices.accepted[ck(a.raw)]] as [number, string]] : []))), [shown, choices.accepted]);
  const items = useMemo(() => shown.map((a, i) => toItemIn(a, i, !!choices.kept[ck(a.raw)] && !accepted[i])), [shown, choices.kept, accepted]);
  const ev = useMemo(() => evaluate(items, profile, accepted), [items, profile, accepted]);
  const source = result.meta?.dictionarySource ?? null;
  const buckets = shown.map((a, i) => bucketOf(a, !!accepted[i], !!choices.kept[ck(a.raw)]));
  const main = shown.map((_, i) => i).filter((i) => !shown[i].optional);
  const counts = main.reduce((m, i) => ({ ...m, [buckets[i]]: (m[buckets[i]] ?? 0) + 1 }), {} as Partial<Record<Bucket, number>>);
  const needsReview = NEEDS_REVIEW.reduce((n, b) => n + (counts[b] ?? 0), 0);
  const removed = [
    ...(result.removed ?? []).filter((r) => !choices.restored.some((x) => ck(x.raw) === ck(r.raw))),
    ...result.items.filter((a) => choices.notIngredient[ck(a.raw)]).map((a) => ({ raw: a.raw, reason: "You marked this as not an ingredient" })),
  ];
  const removedByBackend = (result.removed ?? []).map((r) => r.raw);

  /** Rebuild the ingredient text from what is shown (so edits and splits re-run the analysis on exactly this list). */
  function rebuild(replace?: { index: number; text: string }): string {
    const at = replace ? shownE[replace.index]?.src : undefined;
    const txt = (a: ApiItem, src: number) => (src === at && at !== undefined && at >= 0 ? replace!.text : a.raw);
    const mainTxt = result.items.flatMap((a, src) => (!a.optional ? [txt(a, src)] : []));
    const opt = result.items.flatMap((a, src) => (a.optional ? [txt(a, src)] : []));
    return [...mainTxt, ...(opt.length ? [`may contain: ${opt.join(", ")}`] : []), ...removedByBackend].join(", ");
  }
  const set = (f: (c: Choices) => Choices) => setChoices(f);

  return (
    <>
    <section className="card" aria-labelledby="res">
      <h2 id="res">3. Ingredients</h2>
      <p className="provider" role="status" aria-label="Recognition providers"><small className="muted">
        <strong>Enhanced recognition:</strong> {result.engine === "enhanced" ? "on" : "unavailable (basic matching used)"} · <strong>AI helper:</strong> {!requestedAgent ? "off" : ({ on: "on", unavailable: "unavailable", rate_limited: "rate-limited", off: "off", not_implemented: "unavailable" } as Record<string, string>)[result.meta?.agentStatus ?? "off"]} · <strong>OCR:</strong> local (in this browser)</small></p>
      {result.notice && <p className="notice warn" role="status">{result.notice}</p>}
      {result.meta?.agentStatus === "on" && <p className="notice info" role="status">AI helper: it looked at {result.meta.agentTokensProcessed ?? 0} unrecognized name{result.meta.agentTokensProcessed === 1 ? "" : "s"}{result.meta.agentTokensSkipped ? ` (${result.meta.agentTokensSkipped} more were over the limit and were not sent)` : ""}. Its suggestions are labelled and never applied for you.</p>}
      {requestedAgent && result.meta?.agentStatus === "unavailable" && <p className="notice info" role="status">AI helper: unavailable on this server, so only the standard matching was used.</p>}
      {requestedAgent && result.meta?.agentStatus === "rate_limited" && <p className="notice info" role="status">AI helper: paused for now (too many requests); only the standard matching was used.</p>}

      <h3 id="idsum">Identity summary</h3>
      <ul className="plain stats" aria-labelledby="idsum">
        {(Object.keys(BUCKET) as Bucket[]).filter((b) => counts[b]).map((b) => <li key={b}><span className={`badge ${BUCKET[b].cls}`}>{BUCKET[b].label}</span> <strong>{counts[b]}</strong></li>)}
      </ul>
      <p role="status" aria-live="polite"><strong>{main.length}</strong> ingredient{main.length === 1 ? "" : "s"} = {(Object.keys(BUCKET) as Bucket[]).filter((b) => counts[b]).map((b) => counts[b]).join(" + ") || "0"}. <strong>{needsReview}</strong> need{needsReview === 1 ? "s" : ""} review (suggested + ambiguous + not found + lookup unavailable){needsReview ? ", listed below" : ""}.
        {Object.keys(choices.accepted).length + Object.keys(choices.kept).length + Object.keys(choices.notIngredient).length + choices.restored.length + choices.noMerge.length > 0 &&
          <> <button className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem" }} onClick={() => set(() => ({ accepted: {}, kept: {}, notIngredient: {}, restored: [], noMerge: [] }))}>Undo all my choices</button></>}</p>

      <ReviewPanel shown={shown} buckets={buckets} source={source} choices={choices} set={set} rebuild={rebuild} onRerun={onRerun} />

      <p className={`notice ${ev.banner.avoidMatches ? "warn" : "info"}`} role="status" aria-live="polite"><strong>{ev.banner.text}</strong></p>
      <p><small className="muted">{profile.avoid.length ? "Checked against your avoid list on this device. " : ""}<Link href="/profile">Edit your profile and avoid list</Link></small></p>
      {ev.summary && <p>{ev.summary}</p>}
      <p className="muted"><small>Identity, role, hazard, exposure, regulation and your own compatibility are separate questions. A PubChem record shows identity only, and a CosIng listing is not a safety approval. Nothing here is a verdict, and suggestions are never applied until you confirm them.</small></p>

      <h3>All ingredients</h3>
      <ul className="plain">{shown.map((a, i) => {
        const it = items[i], id = identityOf(it, accepted), b = BUCKET[buckets[i]], fs: Finding[] = ev.findings[i];
        const acc = !!accepted[i];
        return (
          <li key={`${i}-${a.raw}`}>
            <strong>{a.raw}</strong> <span className={`badge ${b.cls}`}>{b.label}</span>
            {id.inci ? <small className="muted"> → {titleCase(id.inci)}</small> : null}
            {fs.map((f) => <span key={f.ruleId} className={`badge ${TIER_CLASS[f.tier]}`} style={{ marginLeft: ".4rem" }}>{TIER_LABEL[f.tier]}</span>)}
            {(acc || choices.kept[ck(a.raw)]) ? <button className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem", marginLeft: ".4rem" }} onClick={() => set((c) => { const x = { ...c, accepted: { ...c.accepted }, kept: { ...c.kept } }; delete x.accepted[ck(a.raw)]; delete x.kept[ck(a.raw)]; return x; })}>Undo</button> : null}
            {a.mergedFrom ? <small className="muted"> · merged from {a.mergedFrom} fragments</small> : null}{a.splitFrom ? <small className="muted"> · split from one token</small> : null}
            {fs.map((f) => (
              <div key={`${f.ruleId}-n`} className={`notice ${f.tier === "note" ? "info" : "warn"}`} role="note" style={{ margin: ".3rem 0" }}>
                <strong>{TIER_LABEL[f.tier]}: {f.title}.</strong> {f.explanation}
              </div>))}
            <details>
              <summary>Evidence for this ingredient</summary>
              <dl style={{ margin: ".4rem 0" }}>
                <dt><strong>Identity</strong></dt>
                <dd>{acc ? `You accepted ${titleCase(id.inci!)} (a suggestion).` : b.label}{a.layer ? ` · matched by: ${a.layer.replace(/_/g, " ")}` : ""}{a.source ? ` · dictionary: ${a.source === "seed" ? "starter list (not the EU glossary)" : a.source === "eu_glossary" ? "EU glossary of common ingredient names" : a.source}` : ""}. Identity only: it is not a safety statement.</dd>
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

      {removed.length > 0 && (
        <details open={opened} onToggle={(e) => setOpened((e.target as HTMLDetailsElement).open)}>
          <summary>Removed as not ingredients ({removed.length})</summary>
          <ul className="plain">{removed.map((r, i) => (
            <li key={`${i}-${r.raw}`}>{r.raw} <small className="muted">· {r.reason}</small>{" "}
              <button className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem" }} aria-label={`Restore ${r.raw} as an ingredient`}
                onClick={() => set((c) => { const x = { ...c, notIngredient: { ...c.notIngredient } }; if (x.notIngredient[ck(r.raw)]) delete x.notIngredient[ck(r.raw)]; else x.restored = [...c.restored, { raw: r.raw }]; return x; })}>Restore</button></li>))}</ul>
          <p className="muted"><small>A restored fragment is added back to the list unchecked, and is never treated as safe.</small></p>
        </details>)}
    </section>
    <TrustPanel items={items} accepted={accepted} removedText={removed.map((r) => r.raw)} frontText={pack.frontText} frontWords={pack.frontWords} datesText={pack.datesText} datesConf={pack.datesConf} />
    <SaveProduct items={items} accepted={accepted} packText={`${pack.frontText}\n${pack.datesText}`} />
    </>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { checkClaims } from "@/lib/claims/check";
import { extractClaims } from "@/lib/claims/extract";
import { VERDICT_LABEL, type Verdict } from "@/lib/claims/types";
import { identityOf } from "@/lib/rules/engine";
import { titleCase } from "@/lib/rules/data";
import type { ItemIn, Source } from "@/lib/rules/types";
import { addMonths, dateStatus, findDates, findPao, type DateFind } from "@/lib/trust/dates";
import { COUNTERFEIT_NOTICE, findMisspellings, loadWordSet, shouldNotify, type Misspelling, type OcrWordIn } from "@/lib/trust/misspell";
import { compareToReference, type Comparison, type RefProduct } from "@/lib/trust/reference";

const VERDICT_CLASS: Record<Verdict, string> = { matches: "resolved", consistent: "resolved", contradiction: "notfound", needs_context: "suggested", not_verifiable: "class" };
const SrcLinks = ({ list }: { list: Source[] }) => <>{list.map((s, i) => <span key={`${i}-${s.url}`}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></span>)}</>;
const OPENED_KEY = "beautylens.opened.v1";

interface Props {
  items: ItemIn[]; accepted: Record<number, string>; removedText: string[];
  frontText: string; frontWords?: OcrWordIn[];              // words with OCR confidence exist only while the text is unedited OCR output
  datesText: string; datesConf?: number;                    // lowest OCR confidence among digit words (undefined = typed or unknown)
}

export default function TrustPanel({ items, accepted, removedText, frontText, frontWords, datesText, datesConf }: Props) {
  const claims = useMemo(() => checkClaims(extractClaims(frontText), items, accepted), [frontText, items, accepted]);
  const [mis, setMis] = useState<{ eligible: boolean; found: Misspelling[] } | null>(null);
  useEffect(() => {
    let live = true;
    if (!frontWords?.length) { setMis(null); return; }
    const exclude = new Set(items.flatMap((it) => it.raw.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 4));   // ingredient words are never "misspellings"
    loadWordSet().then((d) => { if (live) setMis(findMisspellings(frontWords, d, exclude)); }).catch(() => { if (live) setMis(null); });
    return () => { live = false; };
  }, [frontWords, items]);

  // dates: user-typed text is trusted; OCR text is low confidence when the digits were read with low confidence
  const typed = datesConf === undefined;
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const dateLines = useMemo(() => [datesText, ...removedText].join("\n"), [datesText, removedText]);
  const dates = useMemo(() => findDates(dateLines, { typed, lowConfidence: !typed && (datesConf ?? 100) < 80 }), [dateLines, typed, datesConf]);
  const pao = useMemo(() => findPao(`${datesText} ${frontText}`), [datesText, frontText]);
  const effective = (d: DateFind): DateFind => {
    const c = confirmed[d.kind]; if (!c) return d;
    const m = /^(\d{1,2})\s*[\/\-.]\s*(\d{2,4})$/.exec(c.trim()); if (!m) return d;
    return { ...d, month: Number(m[1]), year: m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]), confidence: "typed", needsConfirm: false, raw: c };
  };
  const [opened, setOpened] = useState("");
  const openedKey = useMemo(() => items.slice(0, 4).map((i) => i.raw).join("|").toLowerCase().replace(/[^a-z0-9|]/g, "").slice(0, 80), [items]);
  useEffect(() => { try { const m = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "{}"); setOpened(m[openedKey] ?? ""); } catch { setOpened(""); } }, [openedKey]);
  const saveOpened = (v: string) => { setOpened(v); try { const m = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "{}"); if (v) m[openedKey] = v; else delete m[openedKey]; localStorage.setItem(OPENED_KEY, JSON.stringify(m)); } catch { /* storage blocked: works for this visit only */ } };

  // reference formula (Open Beauty Facts)
  const [refQ, setRefQ] = useState(""), [refBusy, setRefBusy] = useState(false), [refErr, setRefErr] = useState(""), [refList, setRefList] = useState<RefProduct[] | null>(null);
  const [cmp, setCmp] = useState<{ p: RefProduct; c: Comparison } | null>(null);
  const packNames = items.map((it, i) => identityOf(it, accepted).inci ?? "").filter(Boolean).map(titleCase);
  async function lookup() {
    setRefBusy(true); setRefErr(""); setRefList(null); setCmp(null);
    try {
      const isCode = /^\d{8,14}$/.test(refQ.trim());
      const r = await fetch(`/api/reference?${isCode ? "barcode" : "q"}=${encodeURIComponent(refQ.trim())}`); const j = await r.json();
      if (!r.ok) throw new Error("x"); setRefList(j.products as RefProduct[]);
    } catch { setRefErr("Open Beauty Facts could not be reached. Nothing was sent except what you typed in the box above."); }
    setRefBusy(false);
  }

  const showDates = dates.length > 0 || pao;
  return (
    <section className="card" aria-labelledby="trust">
      <h2 id="trust">4. Claims, printing and dates</h2>

      <h3>Claims on the pack</h3>
      {!frontText.trim() ? <p className="muted"><small>Add the front-of-pack text above (or read a photo of the front) to check its claims against the ingredient list.</small></p>
        : claims.length === 0 ? <p className="muted">No claims BeautyLens knows were found in that text.</p> : (
        <>
          <p className="muted"><small>A verdict compares a printed claim with the ingredient list. It does not say whether the product is good, safe or the claim is true of the product as a whole.</small></p>
          <ul className="plain">{claims.map((c) => (
            <li key={c.id}><strong>{c.label}</strong> <small className="muted">(read as “{c.matchedText}”)</small> <span className={`badge ${VERDICT_CLASS[c.verdict]}`}>{VERDICT_LABEL[c.verdict]}</span>
              <div><small>{c.explanation}</small></div>
              {c.source.length > 0 && <small className="muted">Source: <SrcLinks list={c.source} /> · confidence: {c.confidence}</small>}
            </li>))}</ul>
        </>)}

      {mis && (mis.eligible ? (shouldNotify(mis.found)
        ? <div className="notice info" role="note"><strong>About the printing.</strong> {COUNTERFEIT_NOTICE} <small className="muted">Words read with high confidence that look misspelled: {mis.found.map((m) => `${m.word} (${m.suggestion}?)`).join(", ")}.</small></div> : null) : null)}

      {showDates && (
        <>
          <h3>Dates and shelf life</h3>
          <ul className="plain">{dates.map((d) => { const e = effective(d), st = dateStatus(e); return (
            <li key={d.kind}><strong>{d.kind === "mfg" ? "Manufactured" : "Use before / expiry"}</strong>: {e.month}/{e.year} <small className="muted">(printed “{d.raw}”, {e.confidence === "low" ? "low confidence" : e.confidence === "typed" ? "entered by you" : "read from the photo"})</small>
              <div><small>{st.text}</small>{d.note ? <small> {d.note}</small> : null}</div>
              {e.needsConfirm && <div><label htmlFor={`cf-${d.kind}`}>Confirm the date on the pack (MM/YY)</label><input id={`cf-${d.kind}`} placeholder="04/29" onBlur={(ev) => ev.target.value && setConfirmed((x) => ({ ...x, [d.kind]: ev.target.value }))} style={{ padding: ".5rem" }} /></div>}
            </li>); })}</ul>
          {pao && (
            <div className="notice info" role="note"><strong>Period after opening: {pao.months} months.</strong> The open-jar symbol with “{pao.raw}” means the product is intended to be used within {pao.months} months of opening (EU Regulation 1223/2009, Art. 19(1)(d) and Annex VII).
              <div><label htmlFor="opened">I opened it on (stored only on this device)</label><input id="opened" type="date" value={opened} onChange={(e) => saveOpened(e.target.value)} style={{ padding: ".5rem" }} /></div>
              {opened && <p role="status">Use within {pao.months} months of opening: until {addMonths(new Date(opened), pao.months).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}. (In-app reminder text only; BeautyLens sends no notifications.)</p>}
            </div>)}
        </>)}

      <h3>Compare with a reference formula (optional)</h3>
      <p className="muted"><small>Looks the product up in Open Beauty Facts, a crowd-sourced database. Entries can be empty, outdated or for another market, so a difference means little by itself and is never treated as a sign of anything. Only what you type here is sent.</small></p>
      <div className="row"><label htmlFor="ref" className="sr-only">Barcode or product name</label><input id="ref" value={refQ} onChange={(e) => setRefQ(e.target.value)} placeholder="Barcode or product name" style={{ flex: 1, minWidth: "12rem", padding: ".6rem" }} />
        <button onClick={lookup} disabled={refBusy || !refQ.trim()}>{refBusy ? "Searching…" : "Search"}</button></div>
      {refErr && <p role="alert" className="notice warn">{refErr}</p>}
      {refList && refList.length === 0 && <p className="muted">No matching product found.</p>}
      {refList && refList.length > 0 && <ul className="plain">{refList.map((p) => (
        <li key={p.code}>{p.brands} {p.name} <small className="muted">({p.code})</small> {p.ingredients_text
          ? <button className="secondary" style={{ minHeight: "2rem", padding: ".2rem .6rem" }} onClick={() => setCmp({ p, c: compareToReference(packNames, p.ingredients_text) })}>Compare</button>
          : <small className="muted">no ingredient list in the database</small>}</li>))}</ul>}
      {cmp && (
        <div className="notice info" role="note"><strong>{cmp.p.brands} {cmp.p.name}</strong>: {cmp.c.shared.length} of your {cmp.c.packCount} identified ingredients also appear in this reference list ({cmp.c.refCount} entries).
          {cmp.c.onlyOnPack.length ? <div><small>Only on your pack: {cmp.c.onlyOnPack.join(", ")}.</small></div> : null}
          {cmp.c.onlyInReference.length ? <div><small>Only in the reference: {cmp.c.onlyInReference.join(", ")}.</small></div> : null}
          <small className="muted">Reference data © Open Beauty Facts contributors, <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>; <a href={cmp.p.url} target="_blank" rel="noopener noreferrer">source entry</a>. Crowd-sourced: may be incomplete or for a different version or market.</small></div>)}
    </section>
  );
}

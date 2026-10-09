"use client";
import { useEffect, useMemo, useState } from "react";
import { toItemIn, type ApiItem } from "@/app/analyze/ResultsPanel";
import { compare, perMl, rankCandidates, toComparable, type Candidate } from "@/lib/products/compare";
import { substitutionsFor } from "@/lib/products/actives";
import { loadProducts } from "@/lib/products/store";
import type { SavedProduct } from "@/lib/products/types";
import { titleCase } from "@/lib/rules/data";
import { evaluate, identityOf } from "@/lib/rules/engine";
import { loadProfile } from "@/lib/rules/profileStore";
import { EMPTY_PROFILE, type Profile } from "@/lib/rules/types";

interface ObfProduct { code: string; name: string; brands: string; ingredients_text: string; url: string }
const rupee = (n: number | null) => (n == null ? "not available" : `₹${n.toFixed(2)}/ml`);
const MAX_CANDIDATES = 12;

export default function CompareClient() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  useEffect(() => { setProducts(loadProducts()); setProfile(loadProfile()); }, []);
  const [a, setA] = useState(""), [b, setB] = useState("");
  const [prices, setPrices] = useState<Record<string, { mrp: string; vol: string }>>({});
  const pa = products.find((p) => p.id === a), pb = products.find((p) => p.id === b);
  const cmp = useMemo(() => (pa && pb ? compare(toComparable(pa), toComparable(pb)) : null), [pa, pb]);
  const price = (p?: SavedProduct) => {
    if (!p) return null; const o = prices[p.id];
    return perMl(o?.mrp ? Number(o.mrp) : p.mrp, o?.vol ? Number(o.vol) : p.volumeMl);
  };
  const priceBox = (p?: SavedProduct) => p && (
    <div className="row"><div><label htmlFor={`m-${p.id}`}>{p.name}: MRP (₹)</label><input id={`m-${p.id}`} type="number" min={0} step="any" placeholder={p.mrp ? String(p.mrp) : ""} value={prices[p.id]?.mrp ?? ""} onChange={(e) => setPrices({ ...prices, [p.id]: { mrp: e.target.value, vol: prices[p.id]?.vol ?? "" } })} /></div>
      <div><label htmlFor={`v-${p.id}`}>Volume (ml or g)</label><input id={`v-${p.id}`} type="number" min={0} step="any" placeholder={p.volumeMl ? String(p.volumeMl) : ""} value={prices[p.id]?.vol ?? ""} onChange={(e) => setPrices({ ...prices, [p.id]: { mrp: prices[p.id]?.mrp ?? "", vol: e.target.value } })} /></div></div>);

  // product-level alternatives (Open Beauty Facts)
  const [base, setBase] = useState(""), [term, setTerm] = useState("moisturizer");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [found, setFound] = useState<{ ranked: ReturnType<typeof rankCandidates>["ranked"]; excluded: Candidate[]; tooFew: number; searched: number; noIngredients: number } | null>(null);
  const baseP = products.find((p) => p.id === base);
  async function search() {
    if (!baseP) return;
    setBusy(true); setErr(""); setFound(null);
    try {
      const r = await fetch(`/api/reference?q=${encodeURIComponent(term)}&n=${MAX_CANDIDATES}`);
      const j = (await r.json()) as { products: ObfProduct[]; error?: string };
      if (!r.ok || j.error) throw new Error("obf");
      const withIng = j.products.filter((p) => p.ingredients_text.trim());
      const cands: Candidate[] = [];
      for (const p of withIng) {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: p.ingredients_text }) });
        if (!res.ok) continue;
        const data = (await res.json()) as { items: ApiItem[] };
        const items = data.items.map((it, i) => toItemIn(it, i)).filter((i) => !i.optional);
        const ev = evaluate(items, profile);
        const ids = items.map((i) => identityOf(i));
        cands.push({ name: p.name || "(unnamed)", brands: p.brands, code: p.code, url: p.url, ingredients: ids.flatMap((d) => (d.inci ? [titleCase(d.inci)] : [])), unresolved: ids.filter((d) => !d.inci).length,
          avoidHits: items.flatMap((_, i) => ev.findings[i].filter((f) => f.kind === "avoid_list").map((f) => f.title.replace("On your avoid list: ", ""))) });
      }
      setFound({ ...rankCandidates(toComparable(baseP), cands), searched: j.products.length, noIngredients: j.products.length - withIng.length });
    } catch { setErr("Open Beauty Facts could not be reached, so no product-level alternatives are shown. Nothing was sent except your search word."); }
    setBusy(false);
  }
  const subs = baseP ? baseP.ingredients.flatMap((i) => substitutionsFor(i).map((s) => ({ ...s, has: i }))) : [];

  return (
    <main>
      <h1>Dupes and alternatives</h1>
      <p className="notice info" role="note">Comparisons use the ingredients that were identified, plus a short list of notable actives. Per-ingredient function data is not loaded, so this is a shared-ingredient comparison, not a function profile. Ingredient order is not concentration, so a similar list is not the same performance. “Natural” or “clean” never means safer.</p>
      {!products.length && <p className="notice warn">Save at least two products first (<a href="/products">load samples</a> or analyze a label).</p>}

      <section className="card" aria-labelledby="dupe">
        <h2 id="dupe">Dupe finder</h2>
        <div className="row">
          <div><label htmlFor="da">Product A</label><select id="da" value={a} onChange={(e) => setA(e.target.value)}><option value="">Choose…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label htmlFor="db">Product B</label><select id="db" value={b} onChange={(e) => setB(e.target.value)}><option value="">Choose…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        {cmp && pa && pb && (
          <div>
            {cmp.reliability === "low" && <p className="notice warn" role="status">Many ingredients are still unconfirmed in one or both products, so this comparison is incomplete.</p>}
            <table className="cmp"><tbody>
              <tr><th scope="row">Shared identified ingredients</th><td>{cmp.shared.length} of {new Set([...pa.ingredients, ...pb.ingredients]).size} ({Math.round(cmp.similarity * 100)}% overlap): {cmp.shared.join(", ") || "none"}</td></tr>
              <tr><th scope="row">Only in A</th><td>{cmp.onlyA.join(", ") || "none"}</td></tr>
              <tr><th scope="row">Only in B</th><td>{cmp.onlyB.join(", ") || "none"}</td></tr>
              <tr><th scope="row">Notable actives in A</th><td>{cmp.activesA.join(", ") || "none identified"}</td></tr>
              <tr><th scope="row">Notable actives in B</th><td>{cmp.activesB.join(", ") || "none identified"}</td></tr>
              <tr><th scope="row">Active difference</th><td>{cmp.sharedActives.length || cmp.onlyActivesA.length || cmp.onlyActivesB.length ? `Shared: ${cmp.sharedActives.join(", ") || "none"}; only A: ${cmp.onlyActivesA.join(", ") || "none"}; only B: ${cmp.onlyActivesB.join(", ") || "none"}` : "No notable actives either side"}</td></tr>
              <tr><th scope="row">Price per ml (from MRP and volume)</th><td>A: {rupee(price(pa))} · B: {rupee(price(pb))}</td></tr>
            </tbody></table>
            {priceBox(pa)}{priceBox(pb)}
            <p className="muted"><small>Price per ml is MRP divided by volume. Volume in grams is treated as ml. Enter or correct values above.</small></p>
          </div>)}
      </section>

      <section className="card" aria-labelledby="alt">
        <h2 id="alt">Alternatives</h2>
        <label htmlFor="ab">Start from</label>
        <select id="ab" value={base} onChange={(e) => { setBase(e.target.value); setFound(null); }}><option value="">Choose a saved product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {baseP && (
          <>
            <h3>Ingredient-level options</h3>
            {subs.length === 0 ? <p>No curated substitution is recorded for the identified ingredients in this product. That is a gap in the data, not a finding.</p> :
              subs.map((s) => (<div key={s.id} className="notice info"><strong>{s.from_label} → {s.options.map((o) => titleCase(o.inci)).join(", ")}</strong>
                {s.options.map((o) => (<div key={o.inci}><p>{o.role}.</p><ul>{o.tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul>
                  <small className="muted">Source: {o.source.map((x, i) => <span key={x.url}>{i ? "; " : ""}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></span>)} · confidence: {o.confidence}</small></div>))}</div>))}
            <h3>Product-level options (Open Beauty Facts)</h3>
            <p className="muted"><small>Only your search word is sent. The candidates’ ingredient lists are then identified and checked against your avoid list on this device. Products with anything from your avoid list are left out.</small></p>
            <div className="row"><div><label htmlFor="at">Search word</label><input id="at" type="text" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
              <button onClick={search} disabled={busy || !term.trim()}>{busy ? "Searching…" : "Find alternatives"}</button></div>
            {err && <p role="alert" className="notice warn">{err}</p>}
            {found && (
              <div>
                <p role="status">{found.searched} products returned; {found.noIngredients} had no ingredient list; {found.excluded.length} left out because they contain something on your avoid list; {found.tooFew} had too few shared ingredients to compare.</p>
                {!profile.avoid.length && <p className="notice warn">You have no avoid list yet, so nothing was filtered. <a href="/profile">Add one</a>.</p>}
                <ul className="plain">{found.ranked.slice(0, 5).map((c) => (
                  <li key={c.code} className="card"><strong>{c.brands} {c.name}</strong> · {Math.round(c.cmp.similarity * 100)}% shared ingredients{c.cmp.reliability === "low" ? " · many ingredients unconfirmed" : ""}<br />
                    <small>Shared actives: {c.cmp.sharedActives.join(", ") || "none"} · Differs: only here {c.cmp.onlyB.slice(0, 6).join(", ") || "none"}; only in yours {c.cmp.onlyA.slice(0, 6).join(", ") || "none"}</small><br />
                    <small className="muted">Trade-offs: a similar ingredient list does not mean similar strength, texture or price; {c.unresolved} printed item{c.unresolved === 1 ? "" : "s"} could not be identified. Data: <a href={c.url} target="_blank" rel="noopener noreferrer">Open Beauty Facts</a> (ODbL, crowd-sourced, may be incomplete).</small></li>))}</ul>
                {!found.ranked.length && <p>No comparable products were found. Try another search word.</p>}
              </div>)}
          </>)}
      </section>
    </main>
  );
}

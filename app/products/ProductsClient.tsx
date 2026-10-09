"use client";
import { useEffect, useMemo, useState } from "react";
import { MAX_PRODUCTS, MIN_PRODUCTS, checkRoutine } from "@/lib/products/routine";
import { loadProducts, saveProducts } from "@/lib/products/store";
import { PRODUCT_TYPES, type ProductType, type SavedProduct, type When } from "@/lib/products/types";
import type { Source } from "@/lib/rules/types";
import sample from "@/backend/fixtures/products/sample_products.json";

const SrcLinks = ({ list }: { list: Source[] }) => <>{list.map((s, i) => <span key={`${i}-${s.url}`}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></span>)}</>;

export default function ProductsClient() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inRoutine, setInRoutine] = useState<Record<string, boolean>>({});
  useEffect(() => { const l = loadProducts(); setProducts(l); setInRoutine(Object.fromEntries(l.slice(0, MAX_PRODUCTS).map((p) => [p.id, true]))); setLoaded(true); }, []);
  const persist = (l: SavedProduct[]) => { setProducts(l); saveProducts(l); };
  const patch = (id: string, p: Partial<SavedProduct>) => persist(products.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const chosen = products.filter((p) => inRoutine[p.id]);
  const report = useMemo(() => (chosen.length >= MIN_PRODUCTS && chosen.length <= MAX_PRODUCTS ? checkRoutine(chosen) : null), [chosen]);

  function loadSample() {
    const add: SavedProduct[] = sample.products.map((p, i) => ({ ...(p as Omit<SavedProduct, "id" | "savedAt" | "unresolved">), type: p.type as ProductType, when: p.when as When, id: `sample${i}`, unresolved: [], savedAt: new Date().toISOString(), name: `${p.name}` }));
    persist([...products.filter((p) => !p.id.startsWith("sample")), ...add]);
    setInRoutine(Object.fromEntries(add.slice(0, 4).map((p) => [p.id, true])));
  }
  return (
    <main>
      <h1>My products and routine</h1>
      <p className="notice info" role="note">Everything on this page is stored only in this browser. Notes come from a small set of sourced rules; no note is not a clearance, and nothing here is medical advice.</p>
      {loaded && !products.length && <section className="card"><p>No saved products yet. Analyze a label and use “Save this product”, or load the sample products to see how this works.</p></section>}
      <div className="row"><button className="secondary" onClick={loadSample}>Load illustrative sample products</button>
        {products.length > 0 && <button className="secondary" onClick={() => { persist([]); setInRoutine({}); }}>Remove all saved products</button>}</div>

      {products.length > 0 && (
        <section className="card" aria-labelledby="pl">
          <h2 id="pl">Saved products</h2>
          <p className="muted"><small>Tick {MIN_PRODUCTS} to {MAX_PRODUCTS} products for the routine check. Mark each product’s type and when you use it; the sunscreen check needs the type.</small></p>
          <ul className="plain">{products.map((p) => (
            <li key={p.id} style={{ marginBottom: "1rem" }}>
              <div className="row">
                <label style={{ fontWeight: 600 }}><input type="checkbox" checked={!!inRoutine[p.id]} onChange={(e) => setInRoutine({ ...inRoutine, [p.id]: e.target.checked })} /> {p.name}{p.id.startsWith("sample") ? " (sample)" : ""}</label>
                <select aria-label={`Type of ${p.name}`} value={p.type} onChange={(e) => patch(p.id, { type: e.target.value as ProductType })}>{PRODUCT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select>
                <select aria-label={`When you use ${p.name}`} value={p.when} onChange={(e) => patch(p.id, { when: e.target.value as When })}><option value="">Time not set</option><option value="am">Morning</option><option value="pm">Evening</option><option value="both">Morning and evening</option></select>
                <button className="secondary" onClick={() => persist(products.filter((x) => x.id !== p.id))}>Remove</button>
              </div>
              <small className="muted">{p.ingredients.length} identified{p.unresolved.length ? `, ${p.unresolved.length} not confirmed` : ""}: {p.ingredients.slice(0, 8).join(", ")}{p.ingredients.length > 8 ? "…" : ""}</small>
            </li>))}</ul>
        </section>
      )}

      {products.length > 0 && !report && <p className="notice warn" role="status">Pick {MIN_PRODUCTS} to {MAX_PRODUCTS} products (now {chosen.length}) to check the routine.</p>}
      {report && (
        <section className="card" aria-labelledby="rc">
          <h2 id="rc">Routine check</h2>
          <p><strong>Morning:</strong> {report.am.join(", ") || "nothing set"} · <strong>Evening:</strong> {report.pm.join(", ") || "nothing set"}{report.unplaced.length ? ` · Time not set: ${report.unplaced.join(", ")}` : ""}</p>
          {report.notes.length === 0 && <p>None of the sourced rules apply to these products. That is not a clearance: only a small set of actives is covered.</p>}
          <ul className="plain">{report.notes.map((n, i) => (
            <li key={i} className={`notice ${n.tier === "caution" ? "warn" : "info"}`}>
              <strong>{n.tier === "caution" ? "Worth a check" : "Note"} · {n.title}</strong><br />{n.text}
              {n.source.length > 0 && <><br /><small className="muted">Source: <SrcLinks list={n.source} /> · confidence: {n.confidence}</small></>}
            </li>))}</ul>
          <p className="muted"><small>Ingredient order is not concentration, so this cannot say how strong any product is. Suggestions are not instructions: follow each product’s directions and ask a pharmacist or dermatologist.</small></p>
        </section>
      )}
    </main>
  );
}

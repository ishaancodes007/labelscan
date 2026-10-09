"use client";
import { useEffect, useMemo, useState } from "react";
import { findPatterns } from "@/lib/products/reactions";
import { hasReactionConsent, loadProducts, loadReactions, saveReactions, setReactionConsent } from "@/lib/products/store";
import type { Reaction, SavedProduct } from "@/lib/products/types";

export default function ReactionsClient() {
  const [products, setProducts] = useState<SavedProduct[]>([]), [log, setLog] = useState<Reaction[]>([]), [consent, setConsent] = useState(false);
  useEffect(() => { setProducts(loadProducts()); setLog(loadReactions()); setConsent(hasReactionConsent()); }, []);
  const [pid, setPid] = useState(""), [date, setDate] = useState(""), [note, setNote] = useState("");
  const persist = (l: Reaction[]) => { setLog(l); saveReactions(l); };
  const patterns = useMemo(() => findPatterns(products, log), [products, log]);
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "(removed product)";
  const reactedCount = new Set(log.map((r) => r.productId)).size;

  return (
    <main>
      <h1>Reaction log</h1>
      <section className="card" aria-labelledby="cons">
        <h2 id="cons">Before you start: this is health-related</h2>
        <p>This log records products you think your skin reacted to. It is stored <strong>only in this browser</strong>, is never sent to a server, and is deleted by “Delete all my data” on your profile page. It is not a diagnosis and cannot tell you what caused a reaction.</p>
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setReactionConsent(e.target.checked); }} /> I agree to keep a reaction log on this device.</label>
      </section>

      {consent && (
        <>
          <section className="card" aria-labelledby="add">
            <h2 id="add">Log “I reacted to this”</h2>
            {!products.length && <p className="notice warn">Save a product first (<a href="/products">my products</a>).</p>}
            <div className="row">
              <div><label htmlFor="rp">Product</label><select id="rp" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Choose…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label htmlFor="rd">Date (optional)</label><input id="rd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <label htmlFor="rn">Note (optional: what you noticed)</label>
            <textarea id="rn" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: "4rem" }} />
            <button disabled={!pid} onClick={() => { persist([...log, { id: `rx${Date.now().toString(36)}`, productId: pid, date, note: note.trim() }]); setPid(""); setDate(""); setNote(""); }}>Add to log</button>
          </section>

          <section className="card" aria-labelledby="lg">
            <h2 id="lg">Your log</h2>
            {!log.length ? <p>Nothing logged.</p> : <ul className="plain">{log.map((r) => (
              <li key={r.id}><strong>{name(r.productId)}</strong> {r.date && <small className="muted">· {r.date}</small>} {r.note && <>— {r.note}</>} <button className="secondary" onClick={() => persist(log.filter((x) => x.id !== r.id))}>Remove</button></li>))}</ul>}
          </section>

          <section className="card" aria-labelledby="pt">
            <h2 id="pt">Shared ingredients</h2>
            {reactedCount < 2 ? <p>Patterns need at least two different products in the log. ({reactedCount} so far.)</p> :
              !patterns.length ? <p>The products you logged do not share an identified ingredient or curated family. Unconfirmed ingredients are not compared.</p> :
                <ul className="plain">{patterns.map((p) => (
                  <li key={`${p.kind}-${p.label}`} className="notice info">
                    <strong>These products share {p.kind === "family" ? `ingredients from the group “${p.label}”` : p.label}:</strong> {p.reacted.join(", ")}.<br />
                    {p.alsoInUnreactedProducts.length > 0 && <small>It is also in products you did not log a reaction to: {p.alsoInUnreactedProducts.join(", ")}.<br /></small>}
                    This may be worth discussing with a dermatologist; a patch test can help.
                  </li>))}</ul>}
            <p className="muted"><small>Sharing an ingredient does not mean it caused anything. Many ingredients (such as water or glycerin) are in most products. This tool never says you are allergic to something.</small></p>
          </section>
        </>)}
    </main>
  );
}

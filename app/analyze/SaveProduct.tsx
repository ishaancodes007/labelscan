"use client";
import Link from "next/link";
import { useState } from "react";
import { parsePriceText } from "@/lib/products/compare";
import { addProduct } from "@/lib/products/store";
import { PRODUCT_TYPES, type ProductType, type When } from "@/lib/products/types";
import { titleCase } from "@/lib/rules/data";
import { identityOf } from "@/lib/rules/engine";
import type { ItemIn } from "@/lib/rules/types";

export default function SaveProduct({ items, accepted, packText }: { items: ItemIn[]; accepted: Record<number, string>; packText: string }) {
  const [name, setName] = useState(""), [type, setType] = useState<ProductType>(""), [when, setWhen] = useState<When>("");
  const [mrp, setMrp] = useState(""), [vol, setVol] = useState(""), [saved, setSaved] = useState(false);
  const hint = parsePriceText(packText);
  const real = items.filter((i) => !i.optional);
  const ids = real.map((i) => identityOf(i, accepted));
  const identified = ids.flatMap((d) => (d.inci ? [titleCase(d.inci)] : []));
  const unresolved = real.filter((_, i) => !ids[i].inci).map((i) => i.raw);
  function save() {
    addProduct({ name: name.trim() || "Unnamed product", type, when, ingredients: identified, unresolved, mrp: Number(mrp) || hint.mrp, volumeMl: Number(vol) || hint.volumeMl });
    setSaved(true);
  }
  return (
    <section className="card" aria-labelledby="sv">
      <h2 id="sv">4. Save this product (optional, stays on this device)</h2>
      <p className="muted"><small>Saved products power the routine checker, dupe finder, reaction log and report. Only identified ingredients are used for checks; {unresolved.length} still unconfirmed item{unresolved.length === 1 ? " is" : "s are"} kept separately and never treated as safe.</small></p>
      <div className="row">
        <div><label htmlFor="sv-name">Product name</label><input id="sv-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></div>
        <div><label htmlFor="sv-type">Type</label><select id="sv-type" value={type} onChange={(e) => setType(e.target.value as ProductType)}>{PRODUCT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></div>
        <div><label htmlFor="sv-when">Used</label><select id="sv-when" value={when} onChange={(e) => setWhen(e.target.value as When)}><option value="">Not set</option><option value="am">Morning</option><option value="pm">Evening</option><option value="both">Morning and evening</option></select></div>
      </div>
      <div className="row">
        <div><label htmlFor="sv-mrp">MRP (₹){hint.mrp && !mrp ? ` · read from pack text: ${hint.mrp}` : ""}</label><input id="sv-mrp" type="number" min={0} step="any" value={mrp} onChange={(e) => setMrp(e.target.value)} /></div>
        <div><label htmlFor="sv-vol">Volume (ml or g){hint.volumeMl && !vol ? ` · read from pack text: ${hint.volumeMl}` : ""}</label><input id="sv-vol" type="number" min={0} step="any" value={vol} onChange={(e) => setVol(e.target.value)} /></div>
      </div>
      <div className="row"><button onClick={save} disabled={!identified.length}>Save product</button>{!identified.length && <small className="muted">Nothing is identified yet.</small>}</div>
      {saved && <p role="status" className="notice info">Saved on this device. <Link href="/products">Open my products and routine</Link></p>}
    </section>
  );
}

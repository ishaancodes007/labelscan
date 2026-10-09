"use client";
import { FAMILIES, familyById, familyOf, plainFor, prettyFn, rolesFor, type FamilyId } from "@/lib/functions/data";
import { titleCase } from "@/lib/rules/data";

/** One coloured chip for a function term. The colour is a hint; the words carry the meaning. */
export function RoleChip({ fn }: { fn: string }) {
  const f = familyById(familyOf(fn));
  return <span className="role-chip" style={{ ["--h" as string]: f.hue }} title={plainFor(fn)}><i aria-hidden="true" />{prettyFn(fn)}</span>;
}

export interface OverviewItem { key: string; raw: string; inci: string | null; status: "identified" | "to_confirm"; guess?: string | null }

/** Groups identified ingredients by what they are LISTED as doing, then the ones still to confirm. Never implies amounts. */
export default function RoleOverview({ items, onJump }: { items: OverviewItem[]; onJump: (key: string) => void }) {
  const groups = new Map<FamilyId | "none", OverviewItem[]>();
  const confirm: OverviewItem[] = [];
  for (const it of items) {
    if (it.status === "to_confirm") { confirm.push(it); continue; }
    const r = rolesFor(it.inci);
    const id: FamilyId | "none" = r ? r.families[0] : "none";
    groups.set(id, [...(groups.get(id) ?? []), it]);
  }
  const order = [...FAMILIES.map((f) => f.id), "none" as const].filter((id) => groups.has(id));
  const known = items.filter((i) => i.status === "identified" && rolesFor(i.inci)).length;
  const identified = items.filter((i) => i.status === "identified").length;
  let n = 0;
  return (
    <section className="role-overview" aria-labelledby="ro-h">
      <h3 id="ro-h">What is in this product, and what each part is listed as doing</h3>
      <p className="ro-lede">
        {identified === 0 ? "Nothing is identified yet. Confirm names below and the roles will appear here." :
          <><strong>{known}</strong> of the <strong>{identified}</strong> identified ingredient{identified === 1 ? "" : "s"} {known === 1 ? "has" : "have"} a listed role in BeautyLens’ data{confirm.length ? <>; <strong>{confirm.length}</strong> still need{confirm.length === 1 ? "s" : ""} your check</> : null}.</>}
      </p>
      <div className="ro-groups">
        {order.map((id) => {
          const list = groups.get(id)!;
          const f = id === "none" ? null : familyById(id);
          return (
            <div key={id} className={`ro-group${f ? "" : " none"}`} style={{ ["--h" as string]: f?.hue ?? 0, ["--n" as string]: n++ }}>
              <h4><i aria-hidden="true" />{f ? f.label : "Role not in our data yet"} <span className="count">{list.length}</span></h4>
              <p className="blurb">{f ? f.blurb : "Identified, but BeautyLens has no sourced role for these yet. That is a gap in the data, not a finding."}</p>
              <ul>{list.map((it) => <li key={it.key}><button type="button" className="chip-btn" onClick={() => onJump(it.key)}>{titleCase(it.inci ?? it.raw)}</button></li>)}</ul>
            </div>);
        })}
        {confirm.length > 0 && (
          <div className="ro-group confirm" style={{ ["--n" as string]: n++ }}>
            <h4><i aria-hidden="true" />Still to confirm <span className="count">{confirm.length}</span></h4>
            <p className="blurb">Printed names we could not identify yet. Their roles appear once you confirm what they are.</p>
            <ul>{confirm.map((it) => <li key={it.key}><button type="button" className="chip-btn" onClick={() => onJump(it.key)}>{it.raw}{it.guess ? <small> → {titleCase(it.guess)}?</small> : null}</button></li>)}</ul>
          </div>)}
      </div>
      <p className="ro-note">A role is what an ingredient is listed as being used for in cosmetics. It does not show how much is in the product, or that it does this here. Listing order is not concentration.</p>
    </section>
  );
}

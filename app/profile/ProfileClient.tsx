"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { expandAvoid, makeFamilyEntry, makeIngredientEntry, type Expansion } from "@/lib/rules/avoid";
import { RULES, titleCase } from "@/lib/rules/data";
import { deleteAllMyData, loadProfile, saveProfile } from "@/lib/rules/profileStore";
import { EMPTY_PROFILE, type AvoidEntry, type Profile, type Source, type Strength } from "@/lib/rules/types";

const SKIN = ["", "dry", "oily", "combination", "normal", "sensitive"] as const;
const CONCERNS = ["dryness", "oiliness", "acne-prone", "redness or rosacea", "eczema-prone", "sensitivity", "pigmentation", "ageing"];
const NO_RULE_LABEL: Record<string, string> = { breastfeeding: "breastfeeding", rosacea: "rosacea", eczema: "eczema", acne_prone: "acne-prone skin", sensitive_skin: "sensitive skin", baby_child: "baby or child" };

function Sources({ list }: { list: Source[] }) {
  return <>{list.map((s, i) => <span key={`${i}-${s.url}`}> <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></span>)}</>;
}

export default function ProfileClient() {
  const [p, setP] = useState<Profile>(EMPTY_PROFILE);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<"" | "saved" | "failed">("");
  const [typed, setTyped] = useState("");
  const [exp, setExp] = useState<Expansion | null>(null);
  const [strength, setStrength] = useState<Strength>("doctor");
  const [pt, setPt] = useState({ text: "", result: "reacted" as "reacted" | "no_reaction", date: "", doctor: false });
  const [deleted, setDeleted] = useState(false);
  const skipSave = useRef(false);   // after "Delete all my data" do not write the emptied profile straight back

  useEffect(() => { setP(loadProfile()); setReady(true); }, []);
  useEffect(() => { if (!ready) return; if (skipSave.current) { skipSave.current = false; return; } setSaved(saveProfile(p) ? "saved" : "failed"); }, [p, ready]);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const addEntry = (e: AvoidEntry) => { set({ avoid: [...p.avoid, e] }); setExp(null); setTyped(""); };

  const noRules = (() => {
    const out: string[] = [];
    if (p.breastfeeding) out.push(NO_RULE_LABEL.breastfeeding);
    if (p.babyChild) out.push(NO_RULE_LABEL.baby_child);
    if (p.concerns.includes("redness or rosacea")) out.push(NO_RULE_LABEL.rosacea);
    if (p.concerns.includes("eczema-prone")) out.push(NO_RULE_LABEL.eczema);
    if (p.concerns.includes("acne-prone")) out.push(NO_RULE_LABEL.acne_prone);
    if (p.skinType === "sensitive" || p.concerns.includes("sensitivity")) out.push(NO_RULE_LABEL.sensitive_skin);
    return out;
  })();

  return (
    <main>
      <p><Link href="/analyze">← Back to analyze</Link></p>
      <h1>Your profile</h1>
      <p className="notice info" role="note">Stored only in this browser on this device. Nothing here is sent to a server, and you can delete it all with one tap below.</p>
      <p role="status" aria-live="polite"><small className="muted">{saved === "saved" ? "Saved on this device." : saved === "failed" ? "Could not save (private mode or blocked storage). Your choices will be lost when you leave." : ""}</small></p>

      <section className="card" aria-labelledby="about">
        <h2 id="about">About you</h2>
        <label htmlFor="skin">Skin type</label>
        <select id="skin" value={p.skinType} onChange={(e) => set({ skinType: e.target.value as Profile["skinType"] })}>
          {SKIN.map((s) => <option key={s} value={s}>{s ? titleCase(s) : "Not set"}</option>)}
        </select>
        <fieldset><legend>Concerns</legend>
          {CONCERNS.map((c) => <label key={c} style={{ fontWeight: 400 }}><input type="checkbox" checked={p.concerns.includes(c)} onChange={(e) => set({ concerns: e.target.checked ? [...p.concerns, c] : p.concerns.filter((x) => x !== c) })} /> {titleCase(c)}</label>)}
        </fieldset>
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={p.pregnant} onChange={(e) => set({ pregnant: e.target.checked })} /> I am pregnant or planning to be</label>
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={p.breastfeeding} onChange={(e) => set({ breastfeeding: e.target.checked })} /> I am breastfeeding</label>
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={p.babyChild} onChange={(e) => set({ babyChild: e.target.checked })} /> This is for a baby or child</label>
        <p className="muted"><small>What BeautyLens does with this: {RULES.rules.length} sourced rule{RULES.rules.length === 1 ? "" : "s"} exist so far ({RULES.rules.map((r) => r.title).join("; ")}). Everything else you tick is saved but <strong>no rules exist for it yet</strong>, because a rule needs a verified source.</small></p>
        {noRules.length > 0 && <p className="notice warn" role="status">No sourced rules exist yet for: {noRules.join(", ")}. Nothing will be flagged for these.</p>}
      </section>

      <section className="card" aria-labelledby="avoid">
        <h2 id="avoid">Your avoid list</h2>
        <p className="muted"><small>Type one ingredient. We will show other names for it and any curated family it belongs to, each with its source, and you choose what to add.</small></p>
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) setExp(expandAvoid(typed)); }}>
          <label htmlFor="av">Ingredient to avoid</label>
          <div className="row"><input id="av" value={typed} onChange={(e) => { setTyped(e.target.value); setExp(null); }} placeholder="e.g. fragrance, benzyl alcohol, methylisothiazolinone" style={{ flex: 1, minWidth: "12rem", padding: ".6rem" }} />
            <button type="submit" disabled={!typed.trim()}>Look up</button></div>
        </form>
        {exp && (
          <div className="card" role="region" aria-label="Avoid list options">
            <fieldset><legend>Why are you avoiding it?</legend>
              <label style={{ fontWeight: 400 }}><input type="radio" name="str" checked={strength === "doctor"} onChange={() => setStrength("doctor")} /> Doctor-confirmed allergy (a hard rule: flagged as “Avoid”)</label>
              <label style={{ fontWeight: 400 }}><input type="radio" name="str" checked={strength === "preference"} onChange={() => setStrength("preference")} /> Personal preference (a soft rule: flagged as “Caution”)</label>
            </fieldset>
            {exp.hits.length > 0 ? (<>
              <p><strong>{titleCase(exp.hits[0].member.inci)}</strong>{exp.otherNames.length ? <> is also written as: {exp.otherNames.map(titleCase).join(", ")}.</> : <>: no other names are known for it yet.</>}</p>
              <p><button onClick={() => addEntry(makeIngredientEntry(exp, strength))}>Add only “{titleCase(exp.hits[0].member.inci)}”{exp.otherNames.length ? " and its other names" : ""}</button></p>
            </>) : (<>
              <p>We do not have other names for “{exp.text}” yet, so it will only match exactly this name.</p>
              <p><button onClick={() => addEntry(makeIngredientEntry(exp, strength))}>Add “{exp.text}” as typed</button></p>
            </>)}
            {[...exp.families, ...exp.nameFamilies.filter((f) => !exp.families.includes(f))].map((f) => (
              <div key={f.id} className="card">
                <h3>Also add the whole family: {f.name} ({f.members.length} ingredients)?</h3>
                <p>{f.description}</p>
                <p><small className="muted">Members: {f.members.map((m) => titleCase(m.inci)).join(", ")}.</small></p>
                <p><small className="muted">Source: <Sources list={f.source} /> · confidence: {f.confidence} · last verified {f.last_verified}. Limits: {f.limits}</small></p>
                <button className="secondary" onClick={() => addEntry(makeFamilyEntry(f, strength))}>Add the whole family</button>
              </div>))}
            <button className="secondary" onClick={() => setExp(null)}>Cancel</button>
          </div>)}
        {p.avoid.length === 0 ? <p className="muted">Nothing on your avoid list yet.</p> : (
          <ul className="plain">{p.avoid.map((e) => (
            <li key={e.id}><strong>{e.label}</strong> <span className={`badge ${e.strength === "doctor" ? "notfound" : "suggested"}`}>{e.strength === "doctor" ? "Doctor-confirmed (Avoid)" : "Preference (Caution)"}</span>
              <small className="muted"> · {e.kind === "family" ? `family of ${e.keys.length} names` : e.origin === "patch_test" ? "from patch test" : `${e.keys.length} name${e.keys.length > 1 ? "s" : ""}`}{e.note ? ` · ${e.note}` : ""}</small>
              <div className="row">
                <label htmlFor={`s${e.id}`} className="sr-only">Strength for {e.label}</label>
                <select id={`s${e.id}`} value={e.strength} onChange={(ev) => set({ avoid: p.avoid.map((x) => (x.id === e.id ? { ...x, strength: ev.target.value as Strength } : x)) })}>
                  <option value="doctor">Doctor-confirmed</option><option value="preference">Personal preference</option></select>
                <button className="secondary" onClick={() => set({ avoid: p.avoid.filter((x) => x.id !== e.id) })} aria-label={`Remove ${e.label}`}>Remove</button>
              </div></li>))}</ul>)}
      </section>

      <section className="card" aria-labelledby="pt">
        <h2 id="pt">Patch-test results</h2>
        <p className="muted"><small>If you did a patch test, enter the result. A reaction adds the ingredient to your avoid list. This is your own record, not a diagnosis.</small></p>
        <form onSubmit={(e) => {
          e.preventDefault(); if (!pt.text.trim()) return;
          const test = { id: `t${Date.now().toString(36)}`, text: pt.text.trim(), result: pt.result, date: pt.date || undefined, doctorConfirmed: pt.doctor };
          const extra = pt.result === "reacted" ? [makeIngredientEntry(expandAvoid(pt.text), pt.doctor ? "doctor" : "preference", "patch_test", `patch test${pt.date ? ` ${pt.date}` : ""}`)] : [];
          set({ patchTests: [...p.patchTests, test], avoid: [...p.avoid, ...extra] }); setPt({ text: "", result: "reacted", date: "", doctor: false });
        }}>
          <label htmlFor="ptx">Ingredient or product tested</label><input id="ptx" value={pt.text} onChange={(e) => setPt({ ...pt, text: e.target.value })} style={{ width: "100%", padding: ".6rem" }} />
          <label htmlFor="ptr">Result</label><select id="ptr" value={pt.result} onChange={(e) => setPt({ ...pt, result: e.target.value as "reacted" | "no_reaction" })}><option value="reacted">I reacted</option><option value="no_reaction">No reaction</option></select>
          <label htmlFor="ptd">Date (optional)</label><input id="ptd" type="date" value={pt.date} onChange={(e) => setPt({ ...pt, date: e.target.value })} />
          <label style={{ fontWeight: 400 }}><input type="checkbox" checked={pt.doctor} onChange={(e) => setPt({ ...pt, doctor: e.target.checked })} /> A doctor confirmed this result</label>
          <p><button type="submit" disabled={!pt.text.trim()}>Add result</button></p>
        </form>
        {p.patchTests.length > 0 && <ul className="plain">{p.patchTests.map((t) => <li key={t.id}>{t.text}: {t.result === "reacted" ? "reacted" : "no reaction"}{t.date ? ` (${t.date})` : ""}{t.doctorConfirmed ? " · doctor-confirmed" : ""} <button className="secondary" onClick={() => set({ patchTests: p.patchTests.filter((x) => x.id !== t.id) })} aria-label={`Remove patch test ${t.text}`}>Remove</button></li>)}</ul>}
      </section>

      <section className="card" aria-labelledby="del">
        <h2 id="del">Your data</h2>
        <p>Everything above, and anything else BeautyLens saves on this device, can be erased in one tap.</p>
        <button onClick={() => { const ok = deleteAllMyData(); skipSave.current = true; setP({ ...EMPTY_PROFILE }); setDeleted(ok); setSaved(""); }}>Delete all my data</button>
        {deleted && <p role="status" className="notice info">All your BeautyLens data on this device was deleted.</p>}
      </section>
    </main>
  );
}

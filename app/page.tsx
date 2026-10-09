import Link from "next/link";
import "./landing.css";
import Reveal from "./Reveal";
import TiltCard from "./Tilt";

export const metadata = { title: "BeautyLens: read the label, understand the names" };

const STEPS = [
  ["Photo", "Take a photo of the ingredient list. It stays on your device."],
  ["Read locally", "The text is read in your browser. You can correct anything it got wrong."],
  ["You review", "Unsure names appear as suggestions with their source. Nothing changes until you choose."],
  ["Identify", "Names are matched to the EU glossary of common ingredient names. PubChem confirms identity only."],
  ["Understand", "Sourced notes and your own avoid list. No scores, no verdicts."],
  ["Report", "Save products, check a routine, and print a summary for a clinician."],
];
const LADDER = [
  ["Exact INCI name", "The printed name is in the glossary."],
  ["Known synonym", "A common name such as “water” maps to Aqua."],
  ["Ingredient class", "Plant extracts, polymers, colorants and fragrance have no single record."],
  ["Join or split fragments", "Words broken across lines are joined; a lost comma is restored, and you can undo it."],
  ["PubChem identity check", "Confirms a chemical name exists. It says nothing about safety."],
  ["Look-alike letters", "“GLYCERN” is offered as Glycerin, as a suggestion for you to accept."],
  ["Not found or lookup unavailable", "Said plainly. Never treated as “no concern”."],
];
const FEATURES = [
  ["/profile", "Avoid-list matching", "Type one name; see its other names and the family it belongs to, each with its source."],
  ["/products", "Routine check", "Notes on actives that may not belong together, and whether sunscreen is marked for the morning."],
  ["/reactions", "Reaction patterns", "Log products you reacted to; see what they share. Kept on your device, with its own consent."],
  ["/analyze", "Claim check", "Compare “fragrance free” or “with niacinamide” with the actual list."],
  ["/compare", "Dupes and alternatives", "Compare two products ingredient by ingredient, with ₹ per ml."],
];

function Sprig() {
  const p = { pathLength: 1, className: "draw" } as const;
  return (
    <svg className="sprig" viewBox="0 0 240 320" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path {...p} style={{ ["--d" as string]: "0s" }} d="M120 312 C118 250 124 190 118 130 C114 90 120 50 126 18" />
      <path {...p} style={{ ["--d" as string]: ".15s" }} d="M119 250 C90 244 66 226 54 198 C84 200 108 218 119 250 Z" />
      <path {...p} style={{ ["--d" as string]: ".3s" }} d="M121 214 C150 206 174 188 186 160 C156 162 132 180 121 214 Z" />
      <path {...p} style={{ ["--d" as string]: ".45s" }} d="M118 168 C92 160 74 142 66 118 C92 120 110 138 118 168 Z" />
      <path {...p} style={{ ["--d" as string]: ".6s" }} d="M120 132 C144 124 160 108 168 84 C144 86 128 104 120 132 Z" />
      <path {...p} style={{ ["--d" as string]: ".75s" }} d="M122 92 C108 84 100 68 100 48 C116 56 124 72 122 92 Z" />
      <path {...p} style={{ ["--d" as string]: ".9s" }} d="M119 250 C100 262 84 262 70 254 M121 214 C140 224 156 224 170 216" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <header className="hero">
        <div className="leak" aria-hidden="true" />
        <Sprig />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow fx" style={{ ["--d" as string]: ".05s" }}>Ingredient labels, explained</p>
            <h1 className="display">
              <span className="line"><span style={{ ["--d" as string]: ".1s" }}>Read the label.</span></span>
              <span className="line"><span style={{ ["--d" as string]: ".3s" }}>Know what you are looking at.</span></span>
            </h1>
            <p className="sub fx" style={{ ["--d" as string]: ".7s" }}>BeautyLens turns a photo of an ingredient list into names you can check. It shows where each match comes from, applies the rules you set, and says plainly what it could not find.</p>
            <p className="cta-row fx" style={{ ["--d" as string]: ".9s" }}>
              <Link className="btn cta" href="/analyze">Analyze a label</Link>
              <a className="textlink" href="#how">How it works</a>
              <Link className="textlink" href="/about">About</Link>
            </p>
          </div>
          <figure className="label-fig fx" style={{ ["--d" as string]: ".5s" }} aria-label="Illustration of a generic ingredient label being scanned">
            <div className="label" role="img" aria-label="Illustration: a generic label. Glycerin is tagged Humectant, Cetyl alcohol is tagged Emollient, and a garbled name is tagged Needs review.">
              <span className="tag-illus">Illustration</span>
              <div className="label-title">INGREDIENTS</div>
              <ul aria-hidden="true">
                <li><span>AQUA</span></li>
                <li><span>GLYCERIN</span><em className="chip c1">Humectant</em></li>
                <li><span>CETYL ALCOHOL</span><em className="chip c2">Emollient</em></li>
                <li><span>ISCPROPIL PIMITATE</span><em className="chip c3">Needs review</em></li>
                <li><span>PHENOXYETHANOL</span></li>
              </ul>
              <div className="beam" aria-hidden="true" />
            </div>
            <figcaption>Illustration with a generic label, not a real product. Plain-language role tags like these are planned; today the app shows identity, sourced notes and your own rules.</figcaption>
          </figure>
        </div>
      </header>

      <main className="landing">
        <Reveal as="section" className="band" id="how" aria-labelledby="how-h">
          <h2 id="how-h">How it works</h2>
          <ol className="steps">{STEPS.map(([t, d], i) => <li key={t} style={{ ["--i" as string]: i }}><span className="num" aria-hidden="true">{i + 1}</span><div><strong>{t}</strong><p>{d}</p></div></li>)}</ol>
        </Reveal>

        <Reveal as="section" className="band" aria-labelledby="priv-h">
          <h2 id="priv-h">What stays on your device</h2>
          <figure className="privacy">
            <div className="scroll" tabIndex={0} role="group" aria-label="Privacy diagram (scrolls sideways on small screens)">
            <svg viewBox="0 0 740 230" role="img" aria-labelledby="priv-t priv-d">
              <title id="priv-t">Privacy diagram</title>
              <desc id="priv-d">Your photo, your profile, your avoid list and your reaction log stay in your browser. Only the ingredient text travels to the matching service.</desc>
              <rect className="zone" x="8" y="8" width="380" height="214" rx="14" />
              <text x="26" y="34" className="zlabel">YOUR DEVICE</text>
              <rect className="node" x="26" y="56" width="96" height="52" rx="8" /><text x="74" y="87" textAnchor="middle">Photo</text>
              <path className="arrow" d="M122 82 H146" /><rect className="node" x="146" y="56" width="96" height="52" rx="8" /><text x="194" y="87" textAnchor="middle">Reads text</text>
              <path className="arrow" d="M242 82 H266" /><rect className="chipbox" x="266" y="62" width="104" height="40" rx="20" /><text x="318" y="87" textAnchor="middle">text chips</text>
              <rect className="node" x="26" y="140" width="344" height="52" rx="8" /><text x="198" y="171" textAnchor="middle">Profile · avoid list · reaction log</text>
              <path className="arrow travel" d="M388 82 H520" /><text x="454" y="70" textAnchor="middle" className="small">ingredient text only</text>
              <rect className="zone2" x="520" y="40" width="212" height="84" rx="14" /><text x="626" y="76" textAnchor="middle">Matching</text><text x="626" y="98" textAnchor="middle">service</text>
              <text x="626" y="158" textAnchor="middle" className="small">Optional, only if you tick the box:</text>
              <text x="626" y="176" textAnchor="middle" className="small">unrecognized names go to the AI helper</text>
            </svg>
            </div>
            <figcaption>The photo, your profile, your avoid list and your reaction log never leave the browser. The matching service receives the ingredient text and nothing else.</figcaption>
          </figure>
        </Reveal>

        <Reveal as="section" className="band" aria-labelledby="lad-h">
          <h2 id="lad-h">How a name gets matched</h2>
          <p className="lead">Each name goes down a ladder. The first honest answer wins, and anything uncertain is shown as a suggestion for you to accept.</p>
          <ol className="ladder">{LADDER.map(([t, d], i) => <li key={t} style={{ ["--i" as string]: i, marginLeft: `${i * 0.6}rem` }}><strong>{t}</strong> <span>{d}</span></li>)}</ol>
        </Reveal>

        <Reveal as="section" className="band" aria-labelledby="feat-h">
          <h2 id="feat-h">What you can do with it</h2>
          <div className="features">{FEATURES.map(([href, t, d]) => <TiltCard key={href + t} href={href} title={t}><p>{d}</p></TiltCard>)}</div>
        </Reveal>

        <section className="band final" aria-labelledby="fin-h">
          <h2 id="fin-h">Start with one label</h2>
          <p className="lead">No account. Your data stays in this browser, and one tap deletes it.</p>
          <p className="cta-row"><Link className="btn cta" href="/analyze">Analyze a label</Link><Link className="textlink" href="/about">What BeautyLens is, and is not</Link></p>
        </section>
      </main>

      <footer className="site-foot">
        <p>BeautyLens explains names and applies sourced notes. It gives no scores, no “safe” or “toxic” labels, and no medical advice. Ingredient order does not show how much of anything is in a product.</p>
      </footer>
    </>
  );
}

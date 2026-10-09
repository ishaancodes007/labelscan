import Link from "next/link";
export const metadata = { title: "About · BeautyLens" };
export default function About() {
  return (
    <main>
      <h1 style={{ fontFamily: "var(--serif, Georgia, serif)" }}>About BeautyLens</h1>
      <section className="card"><h2>What it is</h2>
        <p>A tool that helps you read a cosmetic ingredient list. It reads the text, matches each name to a recognized ingredient, shows where the match came from, and applies the rules and avoid list <em>you</em> set. Anything it is unsure about is shown as a suggestion that you accept or reject.</p></section>
      <section className="card"><h2>What it is not</h2>
        <ul><li>It does not score products or call them safe, toxic, clean or hypoallergenic, and it does not diagnose anything.</li>
          <li>It cannot tell how much of an ingredient is in a product. Listing order is not concentration.</li>
          <li>A missing, failed or unclear lookup is never treated as “no concern”.</li>
          <li>An identity record (for example from PubChem) says what a name refers to, not whether it is safe. Being listed in an EU database is not a safety approval.</li></ul></section>
      <section className="card"><h2>Your data</h2>
        <p>Photos are read in your browser and are not uploaded. Your profile, avoid list, saved products, routine and reaction log live in this browser only, and “Delete all my data” on the <Link href="/profile">profile page</Link> removes them. The matching service receives the ingredient text and nothing else. If you tick the optional AI helper, only the unrecognized names are sent to it.</p></section>
      <section className="card"><h2>Where the data comes from</h2>
        <ul><li>Ingredient names: the EU glossary of common ingredient names (Commission Implementing Decision (EU) 2025/1175). It has names only, no functions.</li>
          <li>Regulatory notes: the consolidated Regulation (EC) No 1223/2009 annexes.</li>
          <li>Stacking and sun notes: DermNet, the FDA and the British Skin Foundation, with confidence stated on each note.</li>
          <li>Product comparisons: Open Beauty Facts (crowd-sourced, ODbL licence, may be incomplete).</li></ul>
        <p className="muted">Everything curated is cited. When a source could not be verified, the item was left out and listed as unfinished in the project notes.</p></section>
      <section className="card"><h2>Known limits</h2>
        <ul><li>Reading small, blurry or curved text from photos is unreliable; typing or pasting the list is more dependable.</li>
          <li>Function data (what an ingredient does) is not loaded yet, so none is shown rather than guessed.</li>
          <li>The sourced rule set is small. No finding does not mean nothing to consider.</li>
          <li>This is a sample build for demonstration. It is not medical advice. For a skin reaction, ask a doctor or pharmacist.</li></ul></section>
      <p><Link className="btn" href="/analyze" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Analyze a label</Link></p>
    </main>
  );
}

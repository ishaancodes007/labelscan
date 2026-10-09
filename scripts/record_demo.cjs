// Records the DEMO.md walkthrough as a silent, captioned video (the "pre-recorded video" fallback). Needs: npm i --no-save playwright-core;
// app on :3100 (production or dev) with the Python service on :8000 (PUBCHEM_ENABLED=0 for repeatable results). Output: docs/demo.webm
const { chromium } = require("playwright-core"); const fs = require("fs"); const path = require("path");
const golden = JSON.parse(fs.readFileSync("backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json", "utf8"));
const base = "http://localhost:3100";
(async () => {
  const dir = fs.mkdtempSync("/tmp/demo-");
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  const pg = await ctx.newPage();
  const cap = async (t, ms = 2200) => { await pg.evaluate((t) => { let d = document.getElementById("__cap"); if (!d) { d = document.createElement("div"); d.id = "__cap"; d.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:70%;background:#14201aE6;color:#fff;padding:.6rem 1rem;border-radius:.6rem;font:600 18px system-ui;z-index:99999;text-align:center"; document.body.appendChild(d); } d.textContent = t; }, t); await pg.waitForTimeout(ms); };
  const go = async (p) => { await pg.goto(base + p); await pg.waitForLoadState("networkidle"); };
  await go("/"); await cap("BeautyLens: read the label, understand the names. No scores, no verdicts.", 3200);
  await go("/analyze"); await cap("Photos stay in the browser. Here we paste the ingredient text a camera misread.", 2200);
  await pg.fill("#txt", golden.raw_ingredients); await pg.fill("#front", golden.front_text || "");
  await pg.fill("#dates", Object.values(golden.other_fields || {}).join("\n"));
  await cap("Front-of-pack claims and dates can be added too.", 1800);
  await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForSelector("#idsum");
  await cap("2 matched exactly; 14 are suggestions that need review. Counts add up.", 3000);
  await pg.locator("#rv").scrollIntoViewIfNeeded(); await cap("Each card shows candidates, sources and why they matched.", 3000);
  await pg.getByRole("button", { name: /Accept all high-confidence suggestions/ }).click(); await cap("Bulk accept lists exactly what it will accept.", 3000);
  await pg.getByRole("button", { name: /^Accept these/ }).click(); await cap("Nothing was applied until you pressed the button.", 2200);
  await cap("The rest are decided one by one, by the user: first candidate here, as a person would after checking.", 1800);
  for (let guard = 0; guard < 20 && (await pg.locator(".review-card").count()) > 0; guard++) {
    const card = pg.locator(".review-card").first(); const use = card.getByRole("button", { name: /^Use / });
    if (await use.count()) await use.first().click(); else await card.getByRole("button", { name: "Keep as typed" }).click();
    await pg.waitForTimeout(250);
  }
  await pg.getByRole("heading", { name: "Claims on the pack" }).scrollIntoViewIfNeeded(); await cap("Claims are checked, never believed: \"No added fragrance\" is consistent, with the benzyl alcohol nuance spelled out.", 4200);
  await pg.locator("text=Expiry").first().scrollIntoViewIfNeeded().catch(() => {}); await cap("Expiry 04/29 was read with low confidence, so it asks you to confirm.", 3000);
  await go("/products"); await pg.getByRole("button", { name: "Load illustrative sample products" }).click(); await pg.waitForSelector("text=Routine check", { timeout: 8000 }).catch(async () => { console.log("NO ROUTINE:", (await pg.locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 900)); throw new Error("routine missing"); });
  await pg.getByRole("heading", { name: "Routine check" }).scrollIntoViewIfNeeded(); await cap("Routine check: retinoid with benzoyl peroxide and AHA, sunscreen not marked. Each note is sourced.", 4500);
  await go("/reactions"); await pg.getByLabel("I agree to keep a reaction log on this device.").check();
  for (const n of ["Sample Scented Cream A", "Sample Scented Lotion B"]) { await pg.selectOption("#rp", { label: n }); await pg.getByRole("button", { name: "Add to log" }).click(); }
  await pg.getByRole("heading", { name: "Shared ingredients" }).scrollIntoViewIfNeeded(); await cap("Reaction log: two products share Parfum and Linalool. Worth a dermatologist and a patch test; never \"you are allergic\".", 4800);
  await go("/profile"); await pg.getByRole("button", { name: "Delete all my data" }).click(); await cap("One tap deletes everything stored on this device.", 2600);
  await ctx.close(); await b.close();
  const f = fs.readdirSync(dir).find((x) => x.endsWith(".webm")); fs.copyFileSync(path.join(dir, f), "docs/demo.webm");
  console.log("wrote docs/demo.webm", (fs.statSync("docs/demo.webm").size / 1048576).toFixed(2), "MB");
})();

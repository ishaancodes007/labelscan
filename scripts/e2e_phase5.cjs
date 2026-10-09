// Phase 5 browser check. Needs: npm i --no-save playwright-core; app on :3100 with PYTHON_API_BASE_URL and the Python service running. Run from repo root.
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const posts = []; pg.on("request", (r) => { if (r.method() === "POST") posts.push(r.postData() || ""); });
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  const go = async (p) => { await pg.goto("http://localhost:3100" + p); await pg.waitForLoadState("networkidle"); };

  // analyze -> save
  await go("/analyze");
  await pg.fill("#txt", "AQUA, GLYCERIN, NIACINAMIDE, PANTHENOL, XQZ BLORP");
  await pg.getByRole("button", { name: "Analyze ingredients" }).click();
  await pg.waitForSelector("#sv-name", { timeout: 60000 });
  await pg.fill("#sv-name", "My test moisturizer"); await pg.selectOption("#sv-type", "moisturizer"); await pg.selectOption("#sv-when", "both"); await pg.fill("#sv-mrp", "450"); await pg.fill("#sv-vol", "50");
  await pg.getByRole("button", { name: "Save product" }).click();
  await pg.waitForSelector("text=Saved on this device");
  ok("analyze -> save product", true);

  // samples + routine
  await go("/products");
  ok("saved product listed with unconfirmed item counted", (await pg.locator("main").innerText()).includes("My test moisturizer") && /1 not confirmed/.test(await pg.locator("main").innerText()));
  await pg.getByRole("button", { name: "Load illustrative sample products" }).click();
  await pg.waitForSelector("text=Routine check");
  let t = await pg.locator("main").innerText();
  ok("routine: retinoid + benzoyl peroxide caution", /Retinoids .* with Benzoyl peroxide/s.test(t));
  ok("routine: retinoid + AHA caution", /Alpha hydroxy acids/.test(t));
  ok("routine: no sunscreen in AM caution", /No sunscreen marked in your morning routine/.test(t));
  ok("routine: sources are links", (await pg.locator("section[aria-labelledby=rc] a").count()) >= 3);

  // dupes
  await go("/compare");
  const opts = await pg.locator("#da option").allInnerTexts();
  const A = opts.find((o) => o.includes("Scented Cream A")), B = opts.find((o) => o.includes("Plain Lotion"));
  await pg.selectOption("#da", { label: A }); await pg.selectOption("#db", { label: B });
  t = await pg.locator("section[aria-labelledby=dupe]").innerText();
  ok("dupe finder: overlap, only-in lists and price per ml", /overlap/.test(t) && /Parfum/.test(t) && /₹6\.00\/ml/.test(t), /₹[\d.]+\/ml/.exec(t)?.[0]);
  // alternatives (ingredient level + Open Beauty Facts)
  const retinolP = opts.find((o) => o.includes("Retinol Night"));
  await pg.selectOption("#ab", { label: retinolP });
  ok("ingredient-level alternative: retinol -> bakuchiol with source", /Retinol → Bakuchiol/.test(await pg.locator("section[aria-labelledby=alt]").innerText()) && (await pg.locator("section[aria-labelledby=alt] a[href*='doi.org']").count()) === 1);
  // an avoid-list entry (Paraffinum Liquidum = mineral oil) must remove matching OBF candidates, and the count must be reported
  await pg.evaluate(() => localStorage.setItem("beautylens.profile.v1", JSON.stringify({ version: 1, skinType: "", concerns: [], pregnant: false, breastfeeding: false, babyChild: false, patchTests: [],
    avoid: [{ id: "a1", label: "Glycerin", kind: "ingredient", keys: ["GLYCERIN"], specificKeys: ["GLYCERIN"], strength: "doctor", origin: "typed", addedAt: "2026-10-09" }] })));
  await go("/compare");
  await pg.selectOption("#ab", { label: A });
  await pg.fill("#at", "moisturizer"); await pg.getByRole("button", { name: "Find alternatives" }).click();
  await pg.waitForSelector("section[aria-labelledby=alt] [role=status], section[aria-labelledby=alt] [role=alert]", { timeout: 120000 });
  t = await pg.locator("section[aria-labelledby=alt]").innerText();
  ok("OBF alternatives: ran and reported counts (or said unavailable)", /products returned/.test(t) || /could not be reached/.test(t), t.match(/\d+ products returned[^.]*\./)?.[0] ?? "unavailable");
  ok("OBF alternatives: none of the listed alternatives contains Glycerin (avoid list)", !/Differs[^\n]*Glycerin/.test(t.split("Differs").slice(1).join("Differs")) && /left out because they contain something on your avoid list/.test(t), t.match(/(\d+) left out/)?.[0]);

  // reactions
  await go("/reactions");
  ok("reaction log hidden until consent", (await pg.locator("#add").count()) === 0);
  await pg.getByLabel("I agree to keep a reaction log on this device.").check();
  for (const n of ["Scented Cream A", "Scented Lotion B"]) {
    await pg.selectOption("#rp", { label: "Sample " + n }); await pg.getByRole("button", { name: "Add to log" }).click();
  }
  t = await pg.locator("section[aria-labelledby=pt]").innerText();
  ok("pattern: shared Linalool / Parfum, dermatologist + patch test wording, never 'allergic'", /Linalool/.test(t) && /Parfum/.test(t) && /dermatologist; a patch test can help/.test(t) && !/allergic/i.test(t.replace(/never says you are allergic/i, "")));

  // report
  await go("/report");
  await pg.getByLabel(/Sample Retinol Night Serum/).check(); await pg.getByLabel(/Sample Scented Cream A/).check();
  await pg.getByLabel("My avoid list").check(); await pg.getByLabel("Reaction log").check();
  t = await pg.locator("article").innerText();
  ok("report: only selected products, routine, lists, reaction log", /Retinol Night/.test(t) && /Scented Cream A/.test(t) && !/Plain Lotion/.test(t) && /Ingredient lists/.test(t) && /Reaction log/.test(t) && /Self-reported/.test(t));

  // privacy
  ok("no product, reaction or profile data was POSTed to the server (only ingredient text for analysis)", posts.every((p) => /^\{"text":/.test(p)) , `${posts.length} POSTs`);
  // delete all
  await go("/profile");
  await pg.getByRole("button", { name: "Delete all my data" }).click();
  const left = await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("beautylens.")).length);
  ok("Delete all my data clears products, reactions and consent", left === 0, `${left} keys left`);
  console.log("CONSOLE/PAGE ERRORS", errs);
  await b.close();
})();

// Phase 3 browser check. Needs: npm i --no-save playwright-core; app on :3100 with PYTHON_API_BASE_URL set and the Python service running.
// Run from the repo root: node scripts/e2e_phase3.cjs   (CHROME_PATH overrides the chromium location)
const { chromium } = require("playwright-core");
const fs = require("fs");
(async () => {
  const golden = JSON.parse(fs.readFileSync("backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json", "utf8")).raw_ingredients;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  const pg = await ctx.newPage();
  const posts = []; pg.on("request", (r) => { if (r.method() === "POST") posts.push({ url: r.url(), body: r.postData() }); });
  pg.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  const ok = (name, cond, extra = "") => console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

  await pg.goto("http://localhost:3100/profile");
  await pg.waitForSelector("#av");
  // 1. avoid-list expansion
  await pg.fill("#av", "fragrance"); await pg.getByRole("button", { name: "Look up" }).click();
  ok("typing 'fragrance' finds its aliases (Parfum)", (await pg.locator("text=/Parfum/i").count()) > 0);
  await pg.getByRole("button", { name: /^Add only/ }).click();
  await pg.fill("#av", "benzyl alcohol"); await pg.getByRole("button", { name: "Look up" }).click();
  const famText = await pg.locator("text=/Also add the whole family: EU labelled fragrance allergens/").count();
  ok("typing 'benzyl alcohol' offers the EU fragrance-allergen family with a source link", famText === 1 && (await pg.locator("a[href*='ema.europa.eu']").count()) > 0);
  await pg.getByRole("button", { name: "Add the whole family" }).first().click();
  ok("avoid list now has 2 entries (Parfum + family), doctor-confirmed by default", (await pg.locator("text=Doctor-confirmed (Avoid)").count()) === 2);
  // pregnancy: no-rule honesty
  await pg.getByLabel("I am breastfeeding").check();
  ok("breastfeeding ticked -> honest 'no sourced rules exist yet' notice", (await pg.locator("text=/No sourced rules exist yet for: breastfeeding/").count()) === 1);
  await pg.waitForTimeout(300);

  // 2. persistence
  await pg.reload(); await pg.waitForSelector("#av");
  ok("profile persists after reload (localStorage)", (await pg.locator("text=Doctor-confirmed (Avoid)").count()) === 2);

  // 3. analyze the golden label, accept benzyl alcohol, check caution + banner
  await pg.goto("http://localhost:3100/analyze"); await pg.waitForSelector("#txt");
  await pg.fill("#txt", golden); await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForSelector("#res");
  const banner0 = (await pg.locator("#res ~ p.notice, #res + p.notice").first().textContent()) || "";
  ok("banner before accepting: says how many items still need review", /still need review/.test(banner0), banner0.slice(0, 110));
  const row = pg.locator("#res ~ ul li", { hasText: "BENEYL ALCOHOL" }).first();
  await row.getByRole("button", { name: /Use Benzyl Alcohol/ }).click();
  const rowText = (await row.textContent()) || "";
  ok("after accepting: benzyl alcohol shows a 'Caution' (not 'Avoid')", /Caution/.test(rowText) && !/Avoid:/.test(rowText), rowText.slice(0, 160).replace(/\s+/g, " "));
  ok("the caution explains the likely preservative role", /preservative/.test(rowText));
  await row.locator("summary").click();
  ok("evidence panel lists a source link and a confidence", (await row.locator("a[href^='http']").count()) > 0 && /confidence: limited/.test((await row.textContent()) || ""));
  ok("evidence panel says function data is not loaded (no guessing)", /CosIng function data is not loaded/.test((await row.textContent()) || ""));
  const det = pg.locator("#res ~ ul li", { hasText: "DETRY ALCOHOL" }).first();
  ok("DETRY ALCOHOL: candidates are fatty alcohols, not drying", /fatty alcohols[\s\S]*not drying/.test((await det.textContent()) || ""));
  ok("myth note 'Alcohol in the name does not mean drying' is hidden until a fatty alcohol is identified", (await pg.locator("text=/does not mean drying/").count()) === 0);
  await det.getByRole("button", { name: /Use Cetearyl Alcohol/ }).click();
  ok("after accepting a fatty alcohol: 'not a drying alcohol' note appears", (await pg.locator("text=/not a drying alcohol/").count()) >= 1);
  const banner1 = (await pg.locator("#res ~ p.notice, #res + p.notice").first().textContent()) || "";
  ok("banner states the avoid-list match without any 'safe' wording", /Contains 1 ingredient you avoid: Benzyl Alcohol/.test(banner1) && !/\bsafe\b/i.test(banner1), banner1.slice(0, 120));

  // 4. privacy: the analyze request carried only text
  const post = posts.find((p) => p.url.endsWith("/api/analyze"));
  const body = post ? JSON.parse(post.body) : {};
  ok("POST /api/analyze body has only 'text' (no profile or avoid list)", Object.keys(body).sort().join() === "text" && !/BENZYL|avoid|doctor/i.test(post.body.replace(golden, "")), Object.keys(body).join());

  // 5. one-tap delete
  await pg.goto("http://localhost:3100/profile"); await pg.waitForSelector("#av");
  await pg.getByRole("button", { name: "Delete all my data" }).click();
  const left = await pg.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("beautylens.")));
  ok("'Delete all my data' empties localStorage in one tap", left.length === 0, JSON.stringify(left));
  await pg.reload(); await pg.waitForSelector("#av");
  ok("profile is empty after reload", (await pg.locator("text=Nothing on your avoid list yet").count()) === 1);
  await b.close();
})().catch((e) => { console.error("E2E FAIL", e.message); process.exit(1); });

// Phase 2 browser check. Needs: npm i --no-save playwright-core; app on :3100 (npm run dev -- -p 3100) with PYTHON_API_BASE_URL set and the Python service running.
// Run from the repo root: node scripts/e2e_phase2_flow.cjs  (CHROME_PATH overrides the chromium location)
const { chromium } = require("playwright-core");
const SH = process.env.SHOTS || "/tmp";
const P = (n) => `${process.cwd()}/backend/fixtures/photos/${n}.jpg`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await b.newPage({ viewport: { width: 420, height: 900 } });
  const external = []; pg.on("request", (r) => { if (new URL(r.url()).hostname !== "localhost") external.push(r.url()); });
  pg.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  pg.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url()); });
  await pg.goto("http://localhost:3100/analyze");
  await pg.setInputFiles("#file", [P("pair_g_a"), P("pair_g_b")]);
  await pg.waitForSelector("text=Photo 2");
  const btns = pg.getByRole("button", { name: /Read text from this photo/ });
  const t0 = Date.now();
  await btns.nth(0).click(); await pg.waitForSelector("text=Read again", { timeout: 90000 });
  console.log("photo 1 read in", Date.now() - t0, "ms");
  await pg.getByRole("button", { name: /Read text from this photo/ }).first().click();
  await pg.waitForFunction(() => document.querySelectorAll("button").length && [...document.querySelectorAll("button")].filter((x) => x.textContent === "Read again").length === 2, null, { timeout: 90000 });
  console.log("both read in", Date.now() - t0, "ms");
  console.log("MERGE NOTICE:", (await pg.locator("text=/Merged \\d+ photos/").first().textContent()));
  console.log("TEXTAREA:", (await pg.locator("#txt").inputValue()).replace(/\s+/g, " "));
  await pg.locator("summary", { hasText: "Where each ingredient came from" }).click();
  console.log("SOURCES (first 3):", (await pg.locator("details ul li").allTextContents()).slice(0, 3));
  await pg.getByRole("button", { name: "Analyze ingredients" }).click();
  await pg.waitForSelector("#res");
  console.log("RESULT HEADER:", (await pg.locator("#res + p, #res ~ p").first().textContent()));
  console.log("RESULT ITEMS:", (await pg.locator("#res ~ ul li").allTextContents()).slice(0, 5));
  await pg.screenshot({ path: SH + "/2_flow.png", fullPage: true });
  // no-overlap case
  await pg.setInputFiles("#file", P("pair_sh_b")); await pg.waitForSelector("text=Photo 3");
  await pg.getByRole("button", { name: /Read text from this photo/ }).click(); 
  await pg.waitForFunction(() => [...document.querySelectorAll("button")].filter((x) => x.textContent === "Read again").length === 3, null, { timeout: 90000 });
  console.log("NO-OVERLAP WARNING:", await pg.locator("text=/No overlap found/").count());
  console.log("external requests:", external.length ? external : "none");
  await b.close();
})().catch((e) => { console.error("E2E FAIL", e.message); process.exit(1); });

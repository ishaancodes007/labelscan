// Phase 2 browser check. Needs: npm i --no-save playwright-core; app on :3100 (npm run dev -- -p 3100) with PYTHON_API_BASE_URL set and the Python service running.
// Run from the repo root: node scripts/e2e_phase2_quality.cjs  (CHROME_PATH overrides the chromium location)
const { chromium } = require("playwright-core");
const SH = process.env.SHOTS || "/tmp";
const P = (n) => `${process.cwd()}/backend/fixtures/photos/${n}.jpg`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await b.newPage({ viewport: { width: 420, height: 900 } });   // phone width
  const external = [];
  pg.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "localhost") external.push(r.url()); });
  pg.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await pg.goto("http://localhost:3100/analyze");
  const prompts = async () => (await pg.locator("section.card .notice").allTextContents()).map((t) => t.trim());

  // 1. bad photos -> prompts
  for (const n of ["bad_blur", "bad_glare", "bad_lowres", "g_clean"]) {
    await pg.setInputFiles("#file", P(n)); await pg.waitForTimeout(1500);
  }
  const cards = await pg.locator("section.card").all();
  for (let i = 1; i < cards.length - 1; i++) {
    const h = await cards[i].locator("h2").first().textContent();
    const msgs = await cards[i].locator('[role="status"] .notice, p.notice').allTextContents();
    console.log("QUALITY", h, "=>", msgs.map((m) => m.trim()).join(" | "));
  }
  await pg.screenshot({ path: SH + "/1_quality.png", fullPage: true });
  await b.close();
  console.log("external requests:", external.length ? external : "none");
})();

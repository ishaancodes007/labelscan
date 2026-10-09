// Automated accessibility scan (axe-core, WCAG 2 A/AA rules) of key pages, light and dark. Needs: npm i --no-save playwright-core axe-core. Production server on :3100.
// Automated rules catch only part of WCAG; this is not a full audit.
const { chromium } = require("playwright-core"); const fs = require("fs");
const axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const golden = JSON.parse(fs.readFileSync("backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json", "utf8")).raw_ingredients;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  let bad = 0;
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: 420, height: 900 }, reducedMotion: "reduce" }); const pg = await ctx.newPage();
    for (const [name, prep] of [["/", async () => {}], ["/about", async () => {}], ["/profile", async () => {}], ["/products", async () => {}],
      ["/analyze (with results)", async () => { await pg.fill("#txt", golden); await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForSelector("#idsum"); }]]) {
      await pg.goto("http://localhost:3100" + name.split(" ")[0]); await pg.waitForLoadState("networkidle"); await prep(); await pg.waitForTimeout(400);
      await pg.evaluate(axe);
      const r = await pg.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }));
      const v = r.violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
      bad += v.length; console.log(`${v.length ? "FAIL" : "PASS"} ${scheme} ${name}: ${v.length} violation types${v.length ? "\n   " + v.join("\n   ") : ""}`);
    }
    await ctx.close();
  }
  await b.close(); console.log(bad ? `${bad} violation types` : "no automated violations");
})();

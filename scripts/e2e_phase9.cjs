// Phase 9 check: role-first results, the animated analyze page, and honest wording. Needs the app on :3100 and the Python service on :8000.
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } }); const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => { if (m.type() === "error" && !/Estimating resolution/.test(m.text())) errs.push(m.text()); });
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  await pg.goto("http://localhost:3100/analyze"); await pg.waitForLoadState("networkidle");
  ok("dropzone, camera and gallery inputs, and a 3-step stepper are present", (await pg.locator(".drop").count()) === 1 && (await pg.locator("#file").count()) === 1 && (await pg.locator("#camera[capture]").count()) === 1 && (await pg.locator(".stepper li").count()) === 3);
  ok("step 1 is the current step before anything is added", await pg.locator(".stepper li").first().evaluate((e) => e.classList.contains("now")));
  ok("dropzone art is animated by default", (await pg.locator(".drop-art .ring").evaluate((e) => getComputedStyle(e).animationName)) === "breathe");
  // photo reading shows the scan frame
  await pg.setInputFiles("#file", process.argv[2] || "backend/fixtures/photos/g_clean.jpg");
  await pg.getByRole("button", { name: /Read text from this photo/ }).click();
  let sawReading = false; for (let i = 0; i < 60 && !sawReading; i++) { sawReading = (await pg.locator(".scanframe.reading").count()) > 0; if (!sawReading) await pg.waitForTimeout(100); }
  ok("while a photo is being read the scan frame animates", sawReading);
  await pg.waitForFunction(() => /Read again/.test(document.body.innerText), null, { timeout: 120000 });
  ok("after reading, a 'Read N words' badge shows", /Read \d+ words/.test(await pg.locator(".read-done").innerText()));
  // typed list: roles first
  await pg.fill("#txt", "Aqua, Glycerin, Cetyl Alcohol, Niacinamide, Phenoxyethanol, Citric Acid, Parfum, GLYCERN, XQZVRTL");
  await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForSelector(".role-overview", { timeout: 60000 });
  const ov = await pg.locator(".role-overview").innerText();
  ok("results open with the role overview, before the review and the match counts", await pg.evaluate(() => { const a = document.querySelector(".role-overview"), r = document.querySelector("#idsum"); return !!a && !!r && (a.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }));
  ok("Glycerin is under Moisture, and Cetyl Alcohol under Softening", await pg.evaluate(() => { const g = (t) => [...document.querySelectorAll(".ro-group")].find((x) => x.querySelector("h4").innerText.startsWith(t)); return /Glycerin/.test(g("Moisture")?.innerText ?? "") && /Cetyl Alcohol/.test(g("Softening")?.innerText ?? ""); }));
  ok("unmatched names sit in 'Still to confirm', with the guess marked as a guess", /Still to confirm/.test(ov) && /GLYCERN[\s\S]*Glycerin\?/.test(ov));
  ok("the overview states that a role is not an amount or an effect here", /does not show how much/.test(ov) && /Listing order is not concentration/.test(ov));
  const gly = pg.locator("li.ing-row", { hasText: "Glycerin" }).first();
  ok("an identified row shows role chips, a plain-language line and a source link", (await gly.locator(".role-chip", { hasText: "Humectant" }).count()) === 1 && /Attracts and holds water/.test(await gly.innerText()) && (await gly.locator("a[href^='https://']").count()) >= 1);
  ok("the source is disclosed as not opened and not official", /page not opened by BeautyLens/.test(await gly.innerText()));
  const guess = pg.locator("li.ing-row", { hasText: "GLYCERN" }).first();
  ok("an unmatched row only offers a conditional role ('If this is …')", /If this is Glycerin/.test(await guess.innerText()) && (await guess.locator(".ing-roles:not(.guess)").count()) === 0);
  const nr = pg.locator("li.ing-row", { hasText: "XQZVRTL" }).first();
  ok("a name with no match shows no role at all", (await nr.locator(".role-chip").count()) === 0);
  ok("no row claims a score, 'safe' or 'toxic'", !/\b(safe|toxic|clean|hypoallergenic)\b/i.test(await pg.locator("ul.plain").last().innerText().catch(() => "")));
  await pg.locator(".ro-group .chip-btn", { hasText: "Glycerin" }).first().click(); await pg.waitForTimeout(300);
  ok("clicking a chip jumps to and flashes that ingredient", await pg.evaluate(() => !!document.querySelector("li.ing-row.flash")));
  ok("one tile per listed ingredient in the strip", (await pg.locator(".strip .tile").count()) === 9);
  // reduce motion
  await pg.getByLabel("Reduce motion").check(); await pg.waitForTimeout(200);
  const st = await pg.evaluate(() => [getComputedStyle(document.querySelector(".ro-group")).animationName, getComputedStyle(document.querySelector(".drop-art .ring")).animationName, getComputedStyle(document.querySelector(".tile")).animationName].join());
  ok("Reduce motion stops the analyze-page animations", st === "none,none,none", st);
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close();
})();

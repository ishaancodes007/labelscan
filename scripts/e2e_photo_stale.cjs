// Checks that changing crop/rotation after a read clears the old result (no stale "could not read" message), and that a re-read works.
// Usage: node scripts/e2e_photo_stale.cjs path/to/photo.(png|jpg)   Needs the app on :3100. Reads in the real browser OCR (Tesseract.js, local).
const { chromium } = require("playwright-core");
(async () => {
  const photo = process.argv[2]; if (!photo) { console.log("usage: node scripts/e2e_photo_stale.cjs <photo>"); process.exit(2); }
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  await pg.goto("http://localhost:3100/analyze"); await pg.waitForLoadState("networkidle");
  await pg.setInputFiles("#file", photo);
  await pg.getByRole("button", { name: /Read text from this photo/ }).click();
  await pg.waitForFunction(() => /Read again/.test(document.body.innerText), null, { timeout: 180000 });
  const txt1 = await pg.locator("#txt").inputValue();
  console.log("FIRST READ:", txt1.replace(/\n+/g, " / ").slice(0, 300));
  const warn1 = await pg.locator("section[aria-labelledby^=ph] .notice.warn").allInnerTexts();
  console.log("warnings after first read:", JSON.stringify(warn1));
  await pg.locator("summary", { hasText: "Crop and rotate" }).click();
  await pg.getByRole("button", { name: "Rotate right 90°" }).click(); await pg.getByRole("button", { name: "Rotate left 90°" }).click();
  await pg.waitForTimeout(500);
  const t2 = await pg.locator("section[aria-labelledby^=ph]").innerText();
  ok("after changing the view the old reading and warnings are cleared", /no longer applies/.test(t2) && !/could not read|did not find an ingredient list/.test(t2) && (await pg.locator("#txt").inputValue()) === "");
  await pg.getByRole("button", { name: /Read text from this photo/ }).click();
  await pg.waitForFunction(() => /Read again/.test(document.body.innerText), null, { timeout: 180000 });
  ok("reading again after the change works", (await pg.locator("#txt").inputValue()).length > 20);
  ok("no page errors", errs.length === 0, errs.join("|"));
  await b.close();
})();

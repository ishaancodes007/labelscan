// "Try harder" check on a hard photo. Usage: node scripts/e2e_phase10.cjs <photo.png|jpg> [expected,comma,separated,words]. Needs the app on :3100.
const { chromium } = require("playwright-core");
(async () => {
  const photo = process.argv[2], want = (process.argv[3] || "").split(",").filter(Boolean);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => { if (m.type() === "error" && !/Estimating resolution|Image too small|Line cannot|diacritics/.test(m.text())) errs.push(m.text()); });
  const reqs = []; pg.on("request", (r) => { if (r.method() !== "GET" || /image|multipart/.test(r.headers()["content-type"] || "")) reqs.push(r.method() + " " + r.url()); });
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  await pg.goto("http://localhost:3100/analyze"); await pg.waitForLoadState("networkidle");
  await pg.setInputFiles("#file", photo);
  await pg.getByRole("button", { name: /Read text from this photo/ }).click();
  await pg.waitForFunction(() => /Read again/.test(document.body.innerText), null, { timeout: 180000 });
  const first = await pg.locator("#txt").inputValue();
  ok("the extra button appears after a read", (await pg.getByRole("button", { name: /Try harder/ }).count()) === 1);
  const t0 = Date.now();
  await pg.getByRole("button", { name: /Try harder/ }).click();
  let sawPass = false; for (let i = 0; i < 100 && !sawPass; i++) { sawPass = /Reading pass \d+ of 11/.test(await pg.locator("body").innerText()); if (!sawPass) await pg.waitForTimeout(300); }
  ok("progress shows 'Reading pass N of 11'", sawPass);
  await pg.waitForFunction(() => /Combined 11 readings/.test(document.body.innerText), null, { timeout: 280000 });
  const secs = Math.round((Date.now() - t0) / 1000);
  const second = await pg.locator("#txt").inputValue();
  console.log("BEFORE:", first.replace(/\n+/g, " / ").slice(0, 260)); console.log("AFTER :", second.replace(/\n+/g, " / ").slice(0, 400));
  ok(`it finished in a practical time (${secs}s)`, secs < 240);
  ok("the note says the corrections are guesses and must be checked", /guesses at the bottle's curve/.test(await pg.locator("body").innerText()));
  const lc = second.toLowerCase(); const hits = want.filter((w) => lc.includes(w.toLowerCase())), before = want.filter((w) => first.toLowerCase().includes(w.toLowerCase()));
  if (want.length) ok(`expected words found: before ${before.length}/${want.length}, after ${hits.length}/${want.length}`, hits.length >= before.length, `missing after: ${want.filter((w) => !lc.includes(w.toLowerCase())).join(", ")}`);
  ok("nothing but GET requests left the page (the photo was not uploaded)", reqs.length === 0, reqs.join(" | "));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close();
})();

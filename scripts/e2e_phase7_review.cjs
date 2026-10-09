// Phase 7 review-panel browser check. Needs: npm i --no-save playwright-core; Next on :3100 (PYTHON_API_BASE_URL set) and the Python service on :8000 (PUBCHEM_ENABLED=0 for repeatable results).
const { chromium } = require("playwright-core");
const fs = require("fs");
(async () => {
  const golden = JSON.parse(fs.readFileSync("backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json", "utf8")).raw_ingredients;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const posts = []; pg.on("request", (r) => { if (r.method() === "POST") posts.push(JSON.parse(r.postData() || "{}")); });
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  await pg.goto("http://localhost:3100/analyze"); await pg.waitForLoadState("networkidle");
  await pg.fill("#txt", golden);
  const analyze = async () => { await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForSelector("#idsum"); };
  await analyze();
  const nums = async () => {
    const t = await pg.locator("section[aria-labelledby=res] > p[role=status]").nth(1).innerText();
    const m = t.match(/^(\d+) ingredients? = ([\d + ]+)\. (\d+) needs? review/);
    return m ? { total: +m[1], parts: m[2].split("+").map((x) => +x.trim()), review: +m[3] } : null;
  };
  let n = await nums();
  ok("identity summary: counts add up to the total", n && n.parts.reduce((a, b) => a + b, 0) === n.total, JSON.stringify(n));
  const statLis = await pg.locator("ul.stats li").allInnerTexts();
  const statNeeds = ["Suggested", "Ambiguous", "Not found", "Lookup unavailable"].reduce((s, k) => s + (statLis.find((x) => x.startsWith(k)) ? +statLis.find((x) => x.startsWith(k)).match(/(\d+)$/)[1] : 0), 0);
  ok("needsReview = suggested + ambiguous + not found + lookup unavailable", n.review === statNeeds, `${n.review} = ${statNeeds}`);
  ok("review cards = needsReview", (await pg.locator(".review-card").count()) === n.review, String(await pg.locator(".review-card").count()));
  const prov = await pg.locator(".provider").innerText();
  ok("provider status line", /Enhanced recognition: on/.test(prov) && /AI helper: off/.test(prov) && /OCR: local/.test(prov), prov);
  const bad = await pg.evaluate(() => [...document.querySelectorAll(".review-card .badge")].filter((e) => e.classList.contains("resolved")).length);
  ok("no unresolved item uses the green 'resolved' style", bad === 0);
  const firstCard = pg.locator(".review-card").first();
  ok("card shows raw token, OCR confidence line, candidates with source links and a why-note", (await firstCard.locator("strong").first().innerText()).startsWith("“") && /OCR confidence/.test(await firstCard.innerText()) && (await firstCard.locator("a[href^='https://']").count()) > 0 && /Differs from the printed text|Closest dictionary/.test(await firstCard.innerText()));
  ok("at most 3 candidates per card", (await pg.locator(".review-card").evaluateAll((els) => Math.max(...els.map((e) => e.querySelectorAll(".cand").length)))) <= 3);

  // bulk accept shows the full list first
  const bulkBtn = pg.getByRole("button", { name: /Accept all high-confidence suggestions/ });
  const bulkN = +(await bulkBtn.innerText()).match(/\((\d+)\)/)[1];
  await bulkBtn.click();
  const listed = await pg.locator("[aria-label='Confirm accepting all high-confidence suggestions'] li").count();
  ok("bulk accept lists every item before applying", listed === bulkN && listed > 0, `${listed}`);
  await pg.getByRole("button", { name: "Cancel" }).click();
  ok("cancel applies nothing", (await nums()).review === n.review);
  await bulkBtn.click(); await pg.getByRole("button", { name: /^Accept these/ }).click();
  const after = await nums();
  ok("applying moves exactly those items out of review", after.review === n.review - bulkN && after.total === n.total, `${n.review} -> ${after.review}`);

  // Use this on one card
  const cardsBefore = await pg.locator(".review-card").count();
  const firstRaw = (await pg.locator(".review-card strong").first().innerText());
  await pg.locator(".review-card").first().getByRole("button", { name: /^Use / }).first().click();
  ok("Use this accepts and moves the item out of review", (await pg.locator(".review-card").count()) === cardsBefore - 1 && /Accepted by you/.test(await pg.locator("ul.stats").innerText()));

  // keep as typed
  const c2 = await pg.locator(".review-card").count();
  await pg.locator(".review-card").first().getByRole("button", { name: "Keep as typed" }).click();
  ok("Keep as typed: not counted as needing review, and counted separately", (await pg.locator(".review-card").count()) === c2 - 1 && /Kept as printed/.test(await pg.locator("ul.stats").innerText()));

  // not an ingredient + restore
  const c3 = await pg.locator(".review-card").count();
  const rawNI = (await pg.locator(".review-card strong").first().innerText()).replace(/[“”]/g, "");
  await pg.locator(".review-card").first().getByRole("button", { name: "Not an ingredient" }).click();
  await pg.locator("summary", { hasText: "Removed as not ingredients" }).click();
  ok("Not an ingredient: moves to the removed list", (await pg.locator("details", { hasText: "Removed as not ingredients" }).innerText()).includes(rawNI));
  await pg.getByRole("button", { name: `Restore ${rawNI} as an ingredient` }).click();
  ok("Restore puts it back (unchecked) in the list", (await pg.locator(".review-card").count()) === c3 && (await pg.locator(".review-card", { hasText: `“${rawNI}”` }).count()) === 1);

  // edit text -> re-run; earlier choices survive
  const accBefore = await pg.locator("ul.stats li", { hasText: "Accepted by you" }).innerText();
  const postsBefore = posts.length;
  const target = pg.locator(".review-card").first();
  await target.getByRole("button", { name: "Edit text" }).click();
  await target.locator("input[type=text]").fill("GLYCERIN");
  await target.getByRole("button", { name: "Check again" }).click();
  await pg.waitForSelector("#idsum");
  ok("Edit text re-runs the analysis", posts.length === postsBefore + 1 && /GLYCERIN/.test(posts[posts.length - 1].text));
  ok("earlier choices survive the re-run", (await pg.locator("ul.stats li", { hasText: "Accepted by you" }).innerText()) === accBefore);

  // split merge (start from a clean slate of choices)
  await pg.getByRole("button", { name: "Undo all my choices" }).click();
  await pg.fill("#txt", golden); await analyze();
  const merged = pg.locator(".review-card", { hasText: "merged from" }).first();
  if (await merged.count()) {
    const raw = (await merged.locator("strong").first().innerText()).replace(/[“”]/g, "");
    await merged.getByRole("button", { name: "Split merge" }).click(); await pg.waitForSelector("#idsum");
    const sent = posts[posts.length - 1];
    ok("Split merge: re-analysis keeps the fragments apart", Array.isArray(sent.noMerge) && sent.noMerge.length >= 2 && !(await pg.locator(".review-card", { hasText: `“${raw}”` }).count()), `noMerge=${JSON.stringify(sent.noMerge)}`);
  } else ok("Split merge: a merged card was present in this run", false, "no merged card");
  ok("choices are not persisted (no beautylens review keys in localStorage)", (await pg.evaluate(() => Object.keys(localStorage).filter((k) => /review|choice/i.test(k)).length)) === 0);
  console.log("CONSOLE/PAGE ERRORS", errs);
  await b.close();
})();

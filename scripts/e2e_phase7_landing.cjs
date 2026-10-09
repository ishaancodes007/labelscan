// Phase 7 landing-page check. Run against a PRODUCTION server for LCP: npx next build && PYTHON_API_BASE_URL=http://localhost:8000 npx next start -p 3100
// Needs: npm i --no-save playwright-core. Run from repo root: node scripts/e2e_phase7_landing.cjs
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  const URL = "http://localhost:3100/";
  // 1. server-rendered and readable without JS
  { const ctx = await b.newContext({ javaScriptEnabled: false }); const pg = await ctx.newPage(); await pg.goto(URL);
    const h1 = await pg.locator("h1").innerText();
    ok("headline is in the server-rendered HTML and visible with JavaScript off", /Read the label/.test(h1) && /Know what you are looking at/.test(h1), JSON.stringify(h1));
    const vis = await pg.evaluate(() => [...document.querySelectorAll(".reveal")].every((e) => getComputedStyle(e.firstElementChild).opacity === "1"));
    ok("scroll sections are visible with JavaScript off (nothing hidden waiting for a script)", vis);
    ok("both CTAs exist as plain links", (await pg.locator("a[href='/analyze']").count()) >= 1 && (await pg.locator("a[href='/about']").count()) >= 1);
    await ctx.close(); }
  // 2. full motion, desktop and mobile widths, no horizontal scroll, no errors
  for (const [name, w, h] of [["desktop", 1280, 800], ["mobile", 390, 800]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await pg.addInitScript(() => { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); });
    await pg.goto(URL); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(2200);
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(`${name}: no horizontal scroll`, sw[0] <= sw[1], `${sw[0]} <= ${sw[1]}`);
    const anim = await pg.evaluate(() => ({ line: getComputedStyle(document.querySelector(".line > span")).animationName, motion: document.documentElement.dataset.motion }));
    ok(`${name}: entrance animation is on by default`, anim.line === "rise" && anim.motion === "full", JSON.stringify(anim));
    await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
    await pg.waitForTimeout(900);
    const hidden = await pg.evaluate(() => [...document.querySelectorAll(".reveal.pre")].filter((e) => !e.classList.contains("in")).length);
    ok(`${name}: every scroll section was revealed once scrolled to`, hidden === 0);
    const lcp = await pg.evaluate(() => Math.round(window.__lcp));
    console.log(`INFO ${name}: largest contentful paint ${lcp} ms (headless Chromium, localhost, no throttling; indicative only)`);
    ok(`${name}: no console or page errors`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // 3. Reduce motion toggle: persisted, applies final states, and survives reload
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage(); await pg.goto(URL); await pg.waitForLoadState("networkidle");
    await pg.getByLabel("Reduce motion").check();
    ok("toggle sets data-motion=reduce and stores it", (await pg.evaluate(() => [document.documentElement.dataset.motion, localStorage.getItem("beautylens.motion")].join())) === "reduce,reduce");
    await pg.reload(); await pg.waitForLoadState("networkidle");
    const st = await pg.evaluate(() => ({ line: getComputedStyle(document.querySelector(".line > span")).animationName, draw: getComputedStyle(document.querySelector(".draw")).strokeDashoffset, beam: getComputedStyle(document.querySelector(".beam")).animationName, chip: getComputedStyle(document.querySelector(".chip")).animationName, fx: getComputedStyle(document.querySelector(".fx")).animationName,
      checked: document.querySelector("label.motion input").checked, pre: document.querySelectorAll(".reveal.pre").length }));
    ok("after reload the preference holds and the toggle is checked", st.checked && st.pre === 0, JSON.stringify(st));
    ok("reduced: no movement animations; only a short fade remains", st.line === "none" && st.beam === "none" && st.chip === "none" && st.fx === "fadeonly", JSON.stringify(st));
    ok("reduced: botanical art is fully drawn (final state)", st.draw === "0px" || st.draw === "0", st.draw);
    await pg.getByLabel("Reduce motion").uncheck(); ok("toggle can be turned off again", (await pg.evaluate(() => localStorage.getItem("beautylens.motion"))) === "full");
    await ctx.close(); }
  // 4. system preference honoured with no stored choice
  { const ctx = await b.newContext({ reducedMotion: "reduce" }); const pg = await ctx.newPage(); await pg.goto(URL); await pg.waitForLoadState("networkidle");
    const st = await pg.evaluate(() => [document.documentElement.dataset.motion, getComputedStyle(document.querySelector(".line > span")).animationName, document.querySelector("label.motion input").checked].join());
    ok("prefers-reduced-motion is honoured by default (toggle starts checked)", st === "reduce,none,true", st); await ctx.close(); }
  // 5. CTAs work; about page; keyboard focus visible
  { const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const pg = await ctx.newPage(); await pg.goto(URL); await pg.waitForLoadState("networkidle");
    await pg.locator("a.cta").first().click(); await pg.waitForURL("**/analyze"); ok("CTA 'Analyze a label' opens /analyze", /Analyze a label/.test(await pg.locator("h1").innerText()));
    await pg.goto(URL); await pg.waitForLoadState("networkidle"); await pg.locator(".hero a[href='/about']").click(); await pg.waitForURL("**/about"); ok("'About' opens /about", /About BeautyLens/.test(await pg.locator("h1").innerText()));
    await pg.goto(URL); await pg.keyboard.press("Tab"); const f = await pg.evaluate(() => document.activeElement.textContent);
    ok("keyboard: first Tab reaches the skip link", /Skip to content/.test(f), f);
    await ctx.close(); }
  await b.close();
})();

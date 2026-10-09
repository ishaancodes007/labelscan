// Phase 6 browser check of the opt-in AI helper UI. MODE=mock needs `python scripts/mock_agent_server.py 8000` (scripted mock model, NOT a real AI);
// MODE=real runs against the normal service (no API key in this build environment -> expects the 'unavailable' notice).
// Needs: npm i --no-save playwright-core; Next on :3100 with PYTHON_API_BASE_URL. Run from repo root: MODE=mock node scripts/e2e_phase6.cjs
const { chromium } = require("playwright-core");
const MODE = process.env.MODE || "real";
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const pg = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const bodies = []; pg.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/analyze")) bodies.push(JSON.parse(r.postData())); });
  const ok = (n, c, x = "") => console.log((c ? "PASS " : "FAIL ") + n + (x ? "  [" + x + "]" : ""));
  const label = "Use AI to help identify unrecognized names (sends only those names, never your photo or profile).";
  await pg.goto("http://localhost:3100/analyze"); await pg.waitForLoadState("networkidle");
  const cb = pg.getByLabel(label);
  ok("consent checkbox exists and is unchecked by default", (await cb.count()) === 1 && !(await cb.isChecked()));
  await pg.fill("#txt", "AQUA, HYALURONATE SOD, XQZVRTL");
  await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForSelector("text=Ingredients");
  ok("unchecked: request sends useAgent=false and no AI notice is shown", bodies[0].useAgent === false && (await pg.locator(".notice", { hasText: "AI helper:" }).count()) === 0 && /AI helper: off/.test(await pg.locator(".provider").innerText()));
  await cb.check();
  await pg.getByRole("button", { name: "Analyze ingredients" }).click(); await pg.waitForFunction(() => /AI helper: (on|unavailable|rate-limited)/.test(document.querySelector(".provider")?.textContent ?? ""));
  ok("checked: request sends useAgent=true and only text", bodies[1].useAgent === true && Object.keys(bodies[1]).sort().join() === "noMerge,text,useAgent" && bodies[1].noMerge.length === 0);
  const t = await pg.locator("main").innerText();
  if (MODE === "mock") {
    ok("status line says the helper is on and how many names it looked at", /AI helper: it looked at 2 unrecognized names/.test(t));
    ok("AI candidate is labelled 'AI suggestion' and not applied", (await pg.locator(".review-card .badge", { hasText: "AI suggestion" }).count()) >= 1 && /not applied until you choose/.test(t) && /Suggested: needs your confirmation/.test(t));
    await pg.locator(".cand", { has: pg.locator(".badge", { hasText: "AI suggestion" }) }).first().getByRole("button", { name: /^Use / }).click();
    ok("pressing the button is what accepts it (shows 'Accepted by you')", /Accepted by you/.test(await pg.locator("main").innerText()));
  } else {
    ok("no key on this server: the notice says the helper is unavailable and standard matching was used", /AI helper: unavailable on this server/.test(t) && (await pg.locator(".badge", { hasText: "AI suggestion" }).count()) === 0);
  }
  console.log("CONSOLE/PAGE ERRORS", errs);
  await b.close();
})();

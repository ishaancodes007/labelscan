// Measures what a first visit to each route downloads (compressed bytes on the wire, JS and CSS), from a production server (next start).
// Needs: npm i --no-save playwright-core. Run: node scripts/route_sizes.cjs
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  for (const route of ["/", "/about", "/analyze", "/products"]) {
    const ctx = await b.newContext(); const pg = await ctx.newPage(); const cdp = await ctx.newCDPSession(pg); await cdp.send("Network.enable");
    const got = {}; cdp.on("Network.responseReceived", (e) => { got[e.requestId] = { url: e.response.url, type: e.type }; });
    cdp.on("Network.loadingFinished", (e) => { if (got[e.requestId]) got[e.requestId].bytes = e.encodedDataLength; });
    await pg.goto("http://localhost:3100" + route); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(500);
    const all = Object.values(got).filter((x) => x.bytes != null && x.url.includes("localhost:3100"));
    const sum = (t) => all.filter((x) => x.type === t).reduce((s, x) => s + x.bytes, 0);
    const kb = (n) => (n / 1024).toFixed(1) + " KB";
    console.log(`${route.padEnd(10)} JS ${kb(sum("Script"))}  CSS ${kb(sum("Stylesheet"))}  HTML ${kb(sum("Document"))}  total ${kb(all.reduce((s, x) => s + x.bytes, 0))}  (${all.filter((x) => x.type === "Script").length} scripts)`);
    await ctx.close();
  }
  await b.close();
})();

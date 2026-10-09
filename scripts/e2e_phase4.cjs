// Phase 4 browser check. Needs: npm i --no-save playwright-core; app on :3100 with PYTHON_API_BASE_URL and the Python service running. Run from repo root.
const { chromium } = require("playwright-core");
const fs=require("fs");
(async()=>{
 const g=JSON.parse(fs.readFileSync("backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json","utf8"));
 console.log(Object.keys(g));
 const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 const pg=await (await b.newContext()).newPage();
 const errs=[]; pg.on("pageerror",e=>errs.push(e.message)); pg.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
 await pg.goto("http://localhost:3100/analyze"); await pg.waitForLoadState("networkidle");
 await pg.fill("#txt",g.raw_ingredients);
 await pg.fill("#front","Moisturising Lotion with Vitamin E, B3, B5 and avocado oil. No added fragrance. Won't clog pores. Non-irritating. Clinically tested");
 await pg.fill("#dates","LOT 1234 EXP 04/29");
 await pg.getByRole("button",{name:"Analyze ingredients"}).click();
 await pg.waitForSelector("text=/not verifiable/i",{timeout:60000});
 const t=await pg.locator("main").innerText();
 for (const k of [/consistent/i,/matches/i,/not verifiable/i,/04\/29|expir/i,/confirm/i]) console.log(k, k.test(t));
 console.log("ERRORS",errs);
 await b.close();
})();

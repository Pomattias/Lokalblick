// End-to-end guard: one geometry/typography for Visa and Redigera.
// Synthetic demo only, no connection to company workbooks.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const port=8795;
const server=spawn(process.execPath,["backend/server.mjs"],{
  env:{...process.env,LOKALBLICK_PORT:String(port)}
});
let browser;
const near=(a,b,label,tolerance=1)=>assert.ok(Math.abs(a-b)<=tolerance,
  label+": "+a+"px versus "+b+"px (max "+tolerance+"px)");
const state=async (page,fieldSelector)=>{
  return page.locator(fieldSelector).evaluate(el=>{
    const row=el.closest("label,.issue-mode-field,.issue-history-card-row")||el.parentElement;
    const rect=row.getBoundingClientRect(),css=getComputedStyle(el);
    return {
      rowWidth:rect.width,rowHeight:rect.height,
      fontSize:parseFloat(css.fontSize),
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth
    };
  });
};
try{
  await new Promise((resolve,reject)=>{
    server.stdout.once("data",resolve);
    server.once("error",reject);
    server.once("exit",n=>reject(Error("Testserver avslutades: "+n)));
  });
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  for(const width of [390,1280]){
    const context=await browser.newContext({
      viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,deviceScaleFactor:width===390?3:1
    });
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("https://**/*",route=>route.abort());
    await page.goto("http://127.0.0.1:"+port+"/v2/index.html",{waitUntil:"domcontentloaded"});
    await page.waitForSelector("[data-view=properties]");
    await page.locator(width===390?".mobile-nav [data-view=more]":".sidebar [data-view=properties]").first().click();
    if(width===390)await page.locator('[data-view=properties]:visible').first().click();
    await page.locator("[data-edit=properties]").first().click();
    const form=page.locator("#editor-root #edit-form");
    await form.waitFor();
    assert.ok(await form.evaluate(el=>el.classList.contains("editor-readonly")));
    assert.equal(await page.locator("body.editor-frame-active").count(),0,"Visa får inte visa grön kant");
    const field=page.locator('#edit-form input[name="city"]');
    const before=await state(page,'#edit-form input[name="city"]');
    await page.locator('[data-editor-activate]').first().click();
    assert.ok(await form.evaluate(el=>el.classList.contains("editor-editing")));
    assert.equal(await page.locator("body.editor-frame-active > #editor-edit-frame").count(),1,"Redigera har en grön ram");
    const activeFrame=await page.locator("#editor-edit-frame").evaluate(el=>{
      const st=getComputedStyle(el),r=el.getBoundingClientRect();
      return {border:st.borderTopColor,width:r.width,position:st.position,pointerEvents:st.pointerEvents,display:st.display};
    });
    assert.equal(activeFrame.position,"fixed");
    assert.equal(activeFrame.pointerEvents,"none");
    assert.ok(activeFrame.width>width-15);
    assert.equal(activeFrame.border,"rgb(23, 123, 93)");
    const after=await state(page,'#edit-form input[name="city"]');
    near(before.rowWidth,after.rowWidth,"fastighet radbredd");
    near(before.rowHeight,after.rowHeight,"fastighet radhöjd");
    await field.focus();
    await field.fill("Malmö");
    const focused=await state(page,'#edit-form input[name="city"]');
    near(after.rowHeight,focused.rowHeight,"fastighet höjd vid skrivning");
    near(after.fontSize,focused.fontSize,"fastighet font vid fokus");
    if(width===390){
      assert.ok(focused.fontSize>=16,"iPhone: text i redigerbara fält är minst 16px");
      const readTextSize=await field.evaluate(el=>parseFloat(getComputedStyle(el.nextElementSibling).fontSize));
      near(readTextSize,focused.fontSize,"Visa och Redigera teckenstorlek");
    }
    assert.ok(focused.scrollWidth<=focused.viewportWidth+1,"Ingen horisontell förstoring");
    await page.locator('[data-editor-undo]').first().click();
    assert.equal(await page.locator("#editor-edit-frame").count(),0,"Ångra tar bort ramen");
    await page.locator("[data-editor-close]").first().click();

    if(width===390){
      await page.locator(".mobile-nav [data-view=more]").click();
      await page.locator('[data-view=activities]:visible').first().click();
    }else{
      await page.locator(".sidebar [data-view=activities]").click();
    }
    await page.locator('[data-edit=activities]').first().click();
    await page.locator("#edit-form.editor-readonly").waitFor();
    const issueRoot=page.locator("#edit-form .issue-home-row").first();
    const issueBefore=await issueRoot.boundingBox();
    await page.locator("[data-editor-activate]").first().click();
    await page.locator("#edit-form.editor-editing").waitFor();
    assert.equal(await page.locator("#editor-edit-frame").count(),1,"Ärenden använder samma ram");
    const issueAfter=await issueRoot.boundingBox();
    near(issueBefore.width,issueAfter.width,"ärende radbredd");
    near(issueBefore.height,issueAfter.height,"ärende radhöjd",2);
    await page.locator('[data-editor-close]').first().click();
    assert.deepEqual(errors,[],"Inga sidfel");
    await context.close();
  }
  console.log("PASS: identisk visa/redigera-layout, grön kant och stabil font/höjd vid fokus (mobil+desktop)");
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  await browser?.close();
  server.kill();
}

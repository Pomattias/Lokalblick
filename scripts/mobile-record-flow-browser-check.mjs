// Mobile regression: Fastighet -> Objekt -> Avtal, same compact controls in
// Visa and Redigera, with synthetic demo data only.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const port=8806;
const server=spawn(process.execPath,["backend/server.mjs"],{
  env:{...process.env,LOKALBLICK_PORT:String(port)}
});
let browser;
const near=(left,right,label,tolerance=2)=>assert.ok(Math.abs(left-right)<=tolerance,
  label+": "+left+" vs "+right+" (tolerance "+tolerance+")");
try{
  await new Promise((resolve,reject)=>{
    server.stdout.once("data",resolve);
    server.once("error",reject);
    server.once("exit",code=>reject(Error("Testserver stopped: "+code)));
  });
  browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("https://**/*",route=>route.abort());
  await page.goto("http://127.0.0.1:"+port+"/");
  await page.waitForSelector("[data-dashboard-mode]");
  await page.evaluate(async()=>{
    const {normalize}=await import("/v2/model.js");
    const data=normalize(window.LokalblickDemoData);
    const year=new Date().getFullYear();
    data.properties.push({id:"MOBILE-P",designation:"Mobilfastigheten",address:"Testgatan 5",city:"Malmö"});
    data.objects.push({id:"MOBILE-O",propertyId:"MOBILE-P",number:"M01",name:"Butikslokal",area:75,
      start:(year-1)+"-01-01",end:"",predecessorIds:[]});
    data.contracts.push({...data.contracts[0],id:"MOBILE-C",number:"M01-A",propertyId:"MOBILE-P",
      objectId:"MOBILE-O",start:year+"-01-01",end:(year+3)+"-12-31",
      baseRent:80000,baseAdditions:1000,rentAdjustmentMethod:"none",additionAdjustmentMethod:"none",
      tenantPartyId:"",tenantName:"Exempelhyresgäst"});
    localStorage.setItem("lokalblick-public-demo-v1",JSON.stringify(normalize(data)));
  });
  await page.reload();
  await page.waitForSelector("[data-dashboard-mode]");
  const form=page.locator("#editor-root #edit-form");
  const navigate=async view=>page.locator(".sidebar [data-view="+view+"]").evaluate(button=>button.click());
  const fit=async label=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
    true,label+": ingen horisontell sidförstoring");
  const row=async name=>form.locator('label:has([name="'+name+'"])').first();
  const geometry=async name=>(await row(name)).evaluate(label=>{
    const title=label.querySelector(".field-name");
    const visible=[...label.querySelectorAll(".editor-mode-value,.editor-mode-control")].find(x=>getComputedStyle(x).display!=="none");
    const a=label.getBoundingClientRect(),b=title?.getBoundingClientRect(),c=visible?.getBoundingClientRect();
    return {width:a.width,height:a.height,labelRight:b?.right,valueLeft:c?.left};
  });
  const titleWidth=async()=>form.locator(':scope>.section-title>div:not(.context-parent):not(.editor-heading-actions)').first()
    .evaluate(el=>el.getBoundingClientRect().width);
  const checkMode=async(kind,key,width)=>{
    await form.locator('[data-context-tab="info"]').click();
    await form.locator(".editor-readonly").count(); // class lives on the form
    assert.ok(await form.evaluate(el=>el.classList.contains("editor-readonly")),kind+": read mode");
    const before=await geometry(key);
    const headerBefore=kind==="Fastighet"?null:await titleWidth();
    assert.ok(before.valueLeft>=before.labelRight-1,kind+": field side by side in read mode");
    await form.locator("[data-editor-activate]").click();
    assert.ok(await form.evaluate(el=>el.classList.contains("editor-editing")),kind+": edit mode");
    const after=await geometry(key);
    near(before.width,after.width,kind+" row width at "+width);
    assert.ok(after.valueLeft>=after.labelRight-1,kind+": field side by side in editing mode");
    if(headerBefore!==null)near(headerBefore,await titleWidth(),kind+" stable heading width at "+width);
    if(width<=390)assert.ok(after.height<=52,kind+": compact field at "+width);
    assert.equal(await form.locator("[data-editor-undo]").isVisible(),true);
    await fit(kind+" redigera at "+width);
    await form.locator("[data-editor-undo]").click();
    await fit(kind+" visa at "+width);
  };
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    await navigate("properties");
    await page.locator('[data-row-group="MOBILE-P"] .primary-cell [data-edit="properties"]').click();
    await checkMode("Fastighet","city",width);
    await form.locator('[data-context-tab="contracts"]').click();
    const objectLink=form.locator('[data-context-record="objects"][data-id="MOBILE-O"]:visible').first();
    await objectLink.click();
    assert.equal(await form.getAttribute("data-collection"),"objects");
    assert.equal(await form.locator("nav.tabs").count(),0,"Objekt: inga äldre flikar");
    assert.equal(await form.locator('[data-object-history]').count(),1,"Objekt: historik på ett ställe");
    const parent=form.locator(':scope>.section-title>.context-parent');
    assert.equal(await parent.locator('[data-context-record="properties"]').count(),1);
    await checkMode("Objekt","area",width);
    await form.locator('[data-context-tab="contracts"]').click();
    await form.locator('[data-context-record="contracts"][data-id="MOBILE-C"]:visible').first().click();
    assert.equal(await form.getAttribute("data-collection"),"contracts");
    assert.equal(await form.locator(':scope>.section-title>.context-parent [data-context-record="objects"]').count(),1);
    assert.equal(await form.locator('[data-contract-notice-terms]').count(),1);
    await checkMode("Avtal","tenantPartyId",width);
    assert.equal(await form.locator("[data-contract-contact-history]").count(),1);
    await page.keyboard.press("Escape");
    await fit("whole flow at "+width);
  }
  assert.deepEqual(errors,[],"Inga scriptfel");
  console.log("PASS: Mobilflöde Fastighet -> Objekt -> Avtal på 320/390/1280, kompakta rader och stabil Visa/Redigera.");
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  await browser?.close();
  server.kill("SIGTERM");
}

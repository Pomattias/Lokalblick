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
  browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  for(const width of [390,1280]){
    const context=await browser.newContext({
      viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,deviceScaleFactor:width===390?3:1
    });
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("https://**/*",route=>route.abort());
    await page.goto("http://127.0.0.1:"+port+"/v2/index.html",{waitUntil:"domcontentloaded"});
    await page.waitForSelector(width===390?".mobile-nav [data-view=more]":".sidebar [data-view=properties]");
    await page.locator(width===390?".mobile-nav [data-view=more]":".sidebar [data-view=properties]").first().click();
    if(width===390)await page.locator('[data-view=properties]:visible').first().click();
    await page.locator("[data-edit=properties]").first().click();
    const form=page.locator("#editor-root #edit-form");
    await form.waitFor();
    await page.locator("[data-context-tab=info]").click();
    assert.ok(await form.evaluate(el=>el.classList.contains("editor-readonly")));
    assert.equal(await page.locator("body.editor-frame-active").count(),0,"Visa får inte visa grön kant");
    const propertyTitle=page.locator("#edit-form #editor-title");
    assert.notEqual((await propertyTitle.innerText()).trim(),"Fastighet",
      "Fastighetsbeteckningen ska vara rubriken, inte ordet Fastighet");
    assert.ok(await page.locator("#edit-form .property-heading-address").count(),
      "Adressen ligger direkt under huvudrubriken");
    assert.equal(await page.locator("#edit-form .property-contact-row").count(),0,
      "Verksamhetens kontakt visas inte längre som ett separat kort");
    const contractContacts=page.locator("#edit-form .property-grid > .property-person-field:has([data-property-contract-contact])");
    if(await contractContacts.count()){
      const first=contractContacts.first();
      assert.match(await first.innerText(),/Verksamhetens kontaktperson/);
      assert.equal(await first.locator("select[data-property-contract-contact]").count(),1);
      assert.equal(await first.locator(".editor-mode-value").count(),1,
        "Avtalskontakt får samma läsrepresentation som övriga kontakter");
      assert.equal(await first.locator(".editor-mode-value").isVisible(),true);
      const borders=await first.evaluate(node=>{
        const parent=getComputedStyle(node.parentElement);
        return {top:parent.borderTopWidth,box:node.parentElement.getBoundingClientRect().height};
      });
      assert.equal(borders.top,"0px","Inget stort kantat kontaktkort");
      assert.ok(borders.box<170,"Alla kontaktpersoner ligger tätt i samma grid");
    }
    const contactGeometry=async()=>page.locator("#edit-form .property-grid .property-person-field").evaluateAll(rows=>rows.map(row=>{
      const label=row.querySelector(".field-name");
      const value=row.querySelector(".editor-mode-value");
      const select=row.querySelector("select");
      const active=[value,select].find(el=>el&&getComputedStyle(el).display!=="none");
      const a=label.getBoundingClientRect(),b=active.getBoundingClientRect();
      return {height:row.getBoundingClientRect().height,labelLeft:a.left,valueLeft:b.left,labelRight:a.right};
    }));
    const contactsBefore=await contactGeometry();
    assert.ok(contactsBefore.length>=2,"Fastighetens kontaktpersoner visas i en gemensam lista");
    assert.ok(contactsBefore.every(row=>row.valueLeft>=row.labelRight-1),
      "Även avtalskontakter har etikett vänster och värde höger");
    const responsibilityDate=page.locator('#edit-form input[name="responsibilityChangeDate"] + .editor-mode-value');
    if(await responsibilityDate.count())assert.match(
      await responsibilityDate.innerText(),/^\d{4}-\d{2}-\d{2}$/,
      "Datum i Visa använder alltid YYYY-MM-DD"
    );
    // Names and data occupy the same physical row; the editor must not
    // expand a two-line label+value cell when switching modes.
    const inlineProperty=async()=>page.locator("#edit-form .property-field").first().evaluate(el=>{
      const name=el.querySelector(".field-name");
      const value=el.querySelector(".editor-mode-value");
      const native=el.querySelector("input,select");
      const active=[value,native].find(n=>n&&getComputedStyle(n).display!=="none");
      const a=name.getBoundingClientRect(),b=active.getBoundingClientRect();
      return {labelMid:a.top+a.height/2,valueMid:b.top+b.height/2,
        labelRight:a.right,valueLeft:b.left,fieldHeight:el.getBoundingClientRect().height,
        labelText:name.textContent};
    });
    const titleGeometry=async()=>page.locator("#edit-form .property-heading-text").evaluate(root=>{
      const css=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        return {height:box.height,width:box.width,font:parseFloat(style.fontSize),display:style.display};};
      const visible=sel=>[...root.querySelectorAll(sel)].find(node=>getComputedStyle(node).display!=="none");
      const title=visible('#editor-title,.property-heading-edit-title input');
      const address=visible('.property-heading-address,.property-heading-edit-address input');
      return {wrapper:css(root),title:css(title),address:css(address)};
    });
    const titleBefore=await titleGeometry();
    assert.equal(await page.locator('#edit-form input[name="designation"]').count(),1);
    assert.equal(await page.locator('#edit-form input[name="address"]').count(),1);
    assert.equal(await page.locator('#edit-form .property-grid input[name="designation"],#edit-form .property-grid input[name="address"]').count(),0,
      "Rubrik och adress förekommer inte igen som detaljrader");
    const inlineBefore=await inlineProperty();
    assert.ok(inlineBefore.valueLeft>=inlineBefore.labelRight-1,
      "Fastighetsuppgifter visar etikett till vänster om värdet");
    assert.ok(Math.abs(inlineBefore.labelMid-inlineBefore.valueMid)<12,
      "Fastighetsuppgifter visar etikett och värde på samma rad");
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
    const titleAfter=await titleGeometry();
    for(const key of ["wrapper","title","address"]){
      near(titleBefore[key].height,titleAfter[key].height,
        "fastighet "+key+" samma höjd i Visa och Redigera",1);
      near(titleBefore[key].width,titleAfter[key].width,
        "fastighet "+key+" samma bredd i Visa och Redigera",2);
    }
    near(titleBefore.title.font,titleAfter.title.font,"fastighetsnamnets teckenstorlek",0);
    near(titleBefore.address.font,titleAfter.address.font,"adressens teckenstorlek",0);
    const contactsAfter=await contactGeometry();
    assert.equal(contactsAfter.length,contactsBefore.length);
    for(let i=0;i<contactsAfter.length;i++){
      near(contactsBefore[i].height,contactsAfter[i].height,
        "kontaktperson "+(i+1)+" samma radhöjd Visa/Redigera",1);
      near(contactsBefore[i].valueLeft,contactsAfter[i].valueLeft,
        "kontaktperson "+(i+1)+" samma värdeposition",1);
    }
    const inlineAfter=await inlineProperty();
    near(inlineBefore.fieldHeight,inlineAfter.fieldHeight,"fastighet kompakt etikettrad",1);
    assert.ok(inlineAfter.valueLeft>=inlineAfter.labelRight-1,
      "Redigera behåller etikett till vänster om kontrollen");
    assert.ok(Math.abs(inlineAfter.labelMid-inlineAfter.valueMid)<12,
      "Redigera behåller etikett och kontroll på samma rad");
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
    const issueMetrics=async()=>issueRoot.evaluate(root=>{
      const info=(el)=>{if(!el)return null;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return {
        className:el.className,display:cs.display,height:r.height,width:r.width,
        font:cs.fontSize,line:cs.lineHeight,padding:cs.padding,grid:cs.gridTemplateColumns
      };};
      return {
        row:info(root),
        home:info(root.querySelector(".issue-property-reference")),
        field:info(root.querySelector(".issue-mode-field")),
        label:info(root.querySelector(".issue-field-label")),
        value:info(root.querySelector(".issue-field-value")),
        control:info(root.querySelector(".issue-field-control")),
        select:info(root.querySelector("select"))
      };
    });
    // Every issue card occupies the same physical row in Visa and Redigera.
    // This catches layout drift that a mere CSS substring assertion misses.
    const issueSnapshot=async()=>page.locator("#edit-form").evaluate(form=>{
      const box=(selector)=>{
        const el=form.querySelector(selector);
        if(!el)return null;
        const r=el.getBoundingClientRect();
        return {width:r.width,height:r.height};
      };
      const read=form.querySelector(".issue-compact-meta .issue-field-value");
      const edit=form.querySelector(".issue-compact-meta .issue-field-control select");
      const style=el=>el?{font:parseFloat(getComputedStyle(el).fontSize),
        weight:parseInt(getComputedStyle(el).fontWeight,10)}:null;
      return {
        compact:box(".issue-compact-meta .issue-mode-field"),
        cost:box(".issue-history-card-row:has(.issue-cost-edit)"),
        dates:box(".issue-history-card-row:has(.issue-dates-edit)"),
        description:box(".issue-description-row"),
        title:box(".issue-heading-text"),
        read:style(read),edit:style(edit),
        pageWidth:document.documentElement.scrollWidth,viewport:innerWidth
      };
    });
    const issueBefore=await issueRoot.boundingBox();
    const beforeLayout=await issueMetrics();
    const beforeIssue=await issueSnapshot();
    await page.locator("[data-editor-activate]").first().click();
    await page.locator("#edit-form.editor-editing").waitFor();
    assert.equal(await page.locator("#editor-edit-frame").count(),1,"Ärenden använder samma ram");
    const issueAfter=await issueRoot.boundingBox();
    const afterLayout=await issueMetrics();
    if(Math.abs(issueBefore.height-issueAfter.height)>2)
      console.log("Issue edit geometry diagnostic",JSON.stringify({width,before:beforeLayout,after:afterLayout}));
    near(issueBefore.width,issueAfter.width,"ärende radbredd");
    near(issueBefore.height,issueAfter.height,"ärende radhöjd",2);
    const afterIssue=await issueSnapshot();
    if(Math.abs(beforeIssue.title.width-afterIssue.title.width)>2) {
      const buttons=await page.locator("#edit-form .issue-heading-actions").evaluate(group=>{
        const measure=el=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
          return {label:(el.textContent||"").trim(),width:rect.width,height:rect.height,
            display:style.display,visibility:style.visibility,gridArea:style.gridArea,hidden:el.hidden};};
        return {group:measure(group),children:[...group.children].map(measure)};
      });
      console.log("Issue heading button layout",JSON.stringify({width,beforeIssue,afterIssue,buttons}));
    }
    for(const kind of ["compact","cost","dates","description","title"]){
      if(!beforeIssue[kind]||!afterIssue[kind])continue;
      near(beforeIssue[kind].width,afterIssue[kind].width,
        "ärende "+kind+" bredd",2);
      near(beforeIssue[kind].height,afterIssue[kind].height,
        "ärende "+kind+" höjd",2);
    }
    if(beforeIssue.read&&afterIssue.edit){
      near(beforeIssue.read.font,afterIssue.edit.font,"ärendets textstorlek");
      assert.equal(beforeIssue.read.weight,400,"Visa visar vanlig text");
      assert.equal(afterIssue.edit.weight,400,"Redigera visar vanlig text");
    }
    assert.ok(afterIssue.pageWidth<=afterIssue.viewport+1,
      "Redigera får inte förstora sidan i sidled");
    if(width===390){
      assert.ok(afterIssue.edit.font>=16,
        "iPhone använder minst 16px på formulärfält för att undvika automatisk zoom");
      const date=page.locator('#edit-form input[name="startDate"]');
      if(await date.count()){
        const dateBefore=await state(page,'#edit-form input[name="startDate"]');
        await date.focus();
        const dateFocused=await state(page,'#edit-form input[name="startDate"]');
        near(dateBefore.rowHeight,dateFocused.rowHeight,
          "ärendets datumfält får inte växa vid fokus",1);
        near(dateBefore.fontSize,dateFocused.fontSize,
          "ärendets datumtecken får inte växa vid fokus",0);
      }
    }
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

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { reviewCandidateChoices } from "../frontend/v2/views.js";
import { normalize, resolveReview } from "../frontend/v2/model.js";
const source=fs.readFileSync(new URL("../frontend/services/address-match.js",import.meta.url),"utf8");
vm.runInThisContext(source);
const match=globalThis.LokalblickAddressMatch;
test("address normalization ignores spacing but not conflicting house numbers",()=>{
 const properties=[{id:"p1",address:"Esperantogatan 25B"},{id:"p2",address:"Esperantogatan 27"}];
 assert.equal(match.matchProperty(properties,{address:"ESPERANTOGATAN 25 B"}).property.id,"p1");
 assert.equal(match.matchProperty(properties,{address:"Esperantogatan 29"}).property,null);
 assert.equal(match.matchProperty(properties,{address:"Esperantogatan"}).property,null);
});
test("unique full address matches one contract; a second contract needs review",()=>{
 const properties=[{id:"p1",address:"Testgatan 5"}];
 const c1={id:"c1",propertyId:"p1",number:"A1",area:100,start:"2024-01-01"};
 const data={properties,contracts:[c1]};
 assert.equal(match.matchContract(data,{address:"Testgatan 5",area:100}).contract.id,"c1");
 assert.equal(match.matchContract(data,{address:"Testgatan 5",number:"OTHER"}).contract,null);
 assert.equal(match.matchContract({...data,contracts:[c1,{...c1,id:"c2",number:"A2"}]},{address:"Testgatan 5"}).contract,null);
});
test("review shows a short candidate list, not every address",()=>{
 const data=normalize({properties:Array.from({length:250},(_,i)=>({id:"p"+i,address:"Exempelgatan "+(i+1)}))});
 const item={id:"review-1",kind:"property-match",record:{address:"Exempelgatan 15"},status:"pending"};
 const html=reviewCandidateChoices(data,item);
 assert.match(html,/Exempelgatan 15/);
 assert.doesNotMatch(html,/Exempelgatan 250/);
 assert.match(html,/data-review-target/);
 assert.match(reviewCandidateChoices(data,item,"Exempelgatan 220"),/Exempelgatan 220/);
});
test("manual property confirmation stores aliases for future enrichment",()=>{
 const d=normalize({properties:[{id:"p1",address:"Testgatan 5"}],importReview:[{
  id:"r1",kind:"property-match",status:"pending",source:"underlag.xlsx",sheet:"Fastighetslista",row:5,
  record:{address:"Testgatan 5 A",objectNo:"EXT-10",name:"Verksamhetslokal"}
 }]});
 resolveReview(d,"r1","accept","p1","test");
 assert.ok(d.properties[0].sourceAliases.includes("EXT-10"));
 assert.equal(d.importReview[0].status,"accepted");
});

test("previously confirmed address alias is reused during enrichment",()=>{
 const context={window:{},XLSX:{utils:{sheet_to_json:sheet=>sheet.rows}},console,Date,Map,Set,Math};
 vm.runInNewContext(source,context);
 vm.runInNewContext(fs.readFileSync("frontend/services/operational-enrichment-adapter.js","utf8"),context);
 const api=context.LokalblickOperationalEnrichmentAdapter;
 const workbook={SheetNames:["Fastighetslista"],Sheets:{Fastighetslista:{rows:[
   ["Benämning","Postadress","Fastighetsägare","Förvaltare"],
   ["Lokal","Testgatan 5 A","",""]
 ]}}};
 const data=normalize({isDemo:false,properties:[{id:"p1",address:"Testgatan 5",sourceAliases:["Testgatan 5 A"]}]});
 const result=api.enrich(workbook,data,"underlag.xlsx");
 assert.equal(result.report.counts.propertiesMatched,1);
 assert.equal((result.data.importReview||[]).filter(x=>x.kind==="property-match"&&x.status==="pending").length,0);
});

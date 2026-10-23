import {sourceServiceScript} from "./helpers/source-service.js";
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {mkdtemp,rm,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import XLSX from 'xlsx';
import {agreementWithItems,adoptAgreementItems,projectStoredAgreementItems,stripStoredAgreementFinance,validateAgreementItems} from '../frontend/lokaler/finance-view.js';
import {agreementItemsPanel} from '../frontend/v2/finance-ui.js';
import {renderContractEditor} from '../frontend/v2/contract-editor.js';
import {normalize} from '../frontend/v2/model.js';
import {LokalblickRepository} from '../backend/company/data-repository.js';
const fixture=()=>normalize({isDemo:true,properties:[{id:'F',designation:'Testfastighet'}],objects:[{id:'O',propertyId:'F',area:100}],contracts:[{id:'A',number:'1',propertyId:'F',objectId:'O',baseRent:100000,rentAdjustmentMethod:'none',baseAdditions:20000,additionAdjustmentMethod:'none',annualPropertyTax:1000}],auditLog:[],budgetPlans:[{year:2027,status:'Låst',lines:[{amount:121000,sourceSnapshot:{id:'A',baseRent:100000}}]}]});
const row=(id,type,name)=>({id,contractId:'A',type,name,baseAmount:1000,adjustmentMethod:'none'});
test('portfolio always exposes category-specific items, while Budget retains its existing controls',()=>{
 const data=fixture(),contract=data.contracts[0],before=structuredClone(data);
 const html=renderContractEditor(data,contract,'A',false,{portfolio:true});assert.match(html,/data-item-new="A"/);assert.doesNotMatch(html,/name="baseAdditions"/);assert.deepEqual(data,before,'opening the editor never mutates or migrates the workspace');
 const budget=renderContractEditor(data,contract,'A',false,{portfolio:false});assert.match(budget,/name="baseAdditions"/);assert.doesNotMatch(budget,/data-item-new/);
 adoptAgreementItems(data,'A');data.agreementItems.push(row('heat','heat','Värme mätare 1'),row('heat2','heat','Värme mätare 2'),row('water','water','Vatten och avlopp'));projectStoredAgreementItems(data);validateAgreementItems(data);
 const list=agreementItemsPanel(data,data.contracts[0],2027);assert.equal((list.match(/<strong>Värme<\/strong>/g)||[]).length,2);assert.match(list,/<strong>VA<\/strong>/);assert.match(list,/Värme mätare 1/);assert.match(list,/Värme mätare 2/);assert.match(list,/Vatten och avlopp/);assert.deepEqual(data.budgetPlans,before.budgetPlans);
});
test('adopting flat additions preserves calculations, source values and snapshots once without duplicated stored fields',()=>{
 const data=fixture(),c=data.contracts[0],C=globalThis.LokalblickCalculations,before=C.annualValues(c,2027,0,[]),plans=structuredClone(data.budgetPlans);
 const derived=agreementWithItems(data,c);assert.equal(derived.items.filter(x=>x.type==='addition').length,1);assert.equal(derived.items.find(x=>x.type==='addition').type,'addition','unknown historic category is never guessed');
 adoptAgreementItems(data,'A');adoptAgreementItems(data,'A');assert.equal(data.agreementItems.length,3);assert.equal(data.auditLog.length,1);projectStoredAgreementItems(data);assert.deepEqual(C.annualValues(data.contracts[0],2027,0,[]),before);
 const stored=stripStoredAgreementFinance(structuredClone(data));assert.equal(stored.contracts[0].baseRent,undefined);assert.equal(stored.contracts[0].baseAdditions,undefined);assert.equal(stored.contracts[0].items,undefined);assert.deepEqual(stored.budgetPlans,plans);assert.equal(normalize(stored).contracts[0].baseAdditions,20000);
 const fallback={...fixture().contracts[0],baseRent:undefined,baseAdditions:undefined,annualRent:90000,annualAdditions:5000,rentAdjustmentMethod:'kpi',additionAdjustmentMethod:'kpi'};
 assert.deepEqual(C.annualValues(agreementWithItems({contracts:[fallback]},fallback),2027,0,[]),C.annualValues(fallback,2027,0,[]));
});
test('older Excel workspaces retain multiple typed additions through a real workbook roundtrip',()=>{
 const sandbox={window:{LokalblickAgreementItems:globalThis.LokalblickAgreementItems},XLSX,console,Date,Map,Set,URL,Uint8Array,TextDecoder,localStorage:{removeItem(){},getItem(){return null;},setItem(){}}};vm.runInNewContext(sourceServiceScript(),sandbox);
 const data=fixture();adoptAgreementItems(data,'A');data.agreementItems.push(row('heat','heat','Värme'),row('water','water','VA'));projectStoredAgreementItems(data);const adapter=sandbox.window.LokalblickSourceService;
 const book=adapter.dataToWorkbook(data),rawRows=XLSX.utils.sheet_to_json(book.Sheets.Avtal);for(const key of ['baseRent','baseAdditions']){const caption=adapter.schemas.find(s=>s.key==='contracts').columns.find(c=>c[0]===key)[1];assert.ok(rawRows[0][caption]==null||rawRows[0][caption]==='');}
 const restored=normalize(adapter.workbookToData(XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'})));assert.equal(restored.agreementItems.length,5);assert.equal(restored.contracts[0].items.filter(x=>x.type==='heat').length,1);assert.equal(restored.contracts[0].items.find(x=>x.type==='water').name,'VA');assert.deepEqual(restored.budgetPlans[0].lines,data.budgetPlans[0].lines);assert.equal(restored.budgetPlans[0].status,data.budgetPlans[0].status);
});
test('company workspace stores the same item register and projects individual types after restart',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'typed-additions-'));t.after(()=>rm(dir,{recursive:true,force:true}));const source=fixture(),options={dataPath:path.join(dir,'data.json'),sourceAdapter:{loadCore:async()=>({properties:source.properties,contracts:source.contracts}),loadCoordinates:async()=>[]}};
 const repo=await new LokalblickRepository(options).initialize(),data=normalize({...await repo.bootstrap(),objects:source.objects});adoptAgreementItems(data,'A');data.agreementItems.push(row('heat','heat','Värme 1'),row('heat2','heat','Värme 2'),row('water','water','VA'));projectStoredAgreementItems(data);
 await repo.saveWorkspace(data);const raw=JSON.parse(await readFile(options.dataPath,'utf8'));assert.equal(raw.entities.agreementItems.length,6);assert.equal(raw.entities.contractOverlays[0].baseAdditions,undefined);assert.equal(raw.entities.contractOverlays[0].items,undefined);
 const restarted=await new LokalblickRepository(options).initialize(),saved=await restarted.bootstrap();assert.equal(saved.contracts[0].items.length,6);assert.equal(saved.contracts[0].items.filter(x=>x.type==='heat').length,2);
 await assert.rejects(restarted.create('agreementItems',{...row('duplicate','base','Bashyra'),baseAmount:1}),/Endast en bashyra/);
});

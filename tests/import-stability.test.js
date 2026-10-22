import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook,retargetColumn} from '../frontend/services/import-engine.js';
import {columnPreferenceKey} from '../frontend/services/import-preferences.js';
import {parseDate,interpretCell} from '../frontend/services/import-formats.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
const targets=['properties.id','properties.designation','properties.address','objects.id','objects.area','contracts.id','contracts.start','contracts.end','contracts.contractDocumentUrl'];
const headers=['FastighetsID','Fastighetsnamn','Adress','ObjektID','Area','AvtalsID','Hyrestid fr.o.m.','Hyrestid t.o.m.','Länk huvudkontrakt'];
function workbook(rows,name='Underlag'){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows]),name);return book;}
const profile=(name='Underlag')=>({name,headerRow:1,startColumn:0,fileName:'syntetiskt.xlsx',columns:targets.map((target,index)=>({target,index,header:headers[index]}))});
const sample=(id='1')=>['F'+id,'Testfastighet '+id,'Testgatan '+id,'O'+id,100,'A'+id,'2025-01-01','2029-12-31','https://example.invalid/'+id];
const run=(book,base=emptyData(),profiles=[profile()],preferences={})=>prepareCleanImport(book,profiles,base,{fileName:'syntetiskt.xlsx',preferences},XLSX);

test('saved exclusions and manual targets survive suggestions in the actual current catalog',()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Verksamhet','Samordnare','Adress','Objektsnummer / Förvaltningsobjekt'],['Beskrivning','Testperson','Testadress','F1']]),'Lokalbestånd');
 const initial=profileWorkbook(book,importSchemas,XLSX,[],{reviewed:true})[0];assert.equal(initial.columns[3].target,'properties.id');
 const saved={sheet:initial.name,signature:initial.signature,layoutSignature:initial.layoutSignature,columns:initial.columns.map(c=>({...c,target:c.index===0?'@ignore':c.index===1?'contracts.responsiblePersonId':c.index===2?'properties.popularName':'properties.id'}))};
 const read=profileWorkbook(book,importSchemas,XLSX,[saved],{reviewed:true})[0];assert.deepEqual(read.columns.map(c=>c.target),['@ignore','contracts.responsiblePersonId','properties.popularName','properties.id']);
});
test('a descriptive conflict on an exact property ID preserves the field and imports independently identified children',()=>{
 const first=sample(),second=sample();second[1]='Annat namn';second[2]='Annan adress 2';second[3]='O2';second[5]='A2';
 const result=run(workbook([first,second]));assert.equal(result.report.blocking,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.objects.length,2);assert.equal(result.clean.agreements.length,2);
 assert.equal(result.clean.properties[0].name,first[1]);assert.equal(result.clean.properties[0].address,first[2]);assert.equal(result.report.review,2);
 assert(result.clean.workspace.importReview.every(r=>!r.rowRejected&&!r.blocking&&r.recordId==='F1'));assert(result.clean.agreements.every(a=>result.clean.objects.some(o=>o.id===a.object_id&&o.property_id==='F1')));validateData(result.clean);
});
test('invalid optional dates and links retain safely identified rows and preserve exact failed cells',()=>{
 const good=sample(),badDate=sample('2'),badLink=sample('3');badDate[6]='Se avtal';badLink[8]='streamToClient';const base=emptyData(),before=structuredClone(base),result=run(workbook([good,badDate,badLink]),base);
 assert.deepEqual(base,before);assert.equal(result.report.rows,3);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements.length,3);assert.deepEqual(result.clean.properties.map(p=>p.id),['F1','F2','F3']);assert(result.clean.workspace.importReview.every(review=>review.fieldRejected&&!review.rowRejected));
 const date=result.clean.workspace.importReview.find(r=>r.row===3),link=result.clean.workspace.importReview.find(r=>r.row===4);
 assert.equal(date.column,headers[6]);assert.equal(date.value,'Se avtal');assert.equal(date.collection,'contracts');assert.equal(link.column,headers[8]);assert.equal(link.value,'streamToClient');assert.equal(date.recordId,'A2');assert.equal(date.sourceValues[0].raw,'Se avtal');
 const html=columnPreviewHtml({fileName:'syntetiskt.xlsx'},{profiles:[profile()]},result,importSchemas);assert.match(html,/Att kontrollera/);assert.match(html,/Rad 3/);assert.match(html,/Se avtal/);assert.doesNotMatch(html,/data-import-safe-rows/);assert.doesNotMatch(html,/data-apply class="primary-action" disabled/);
 const explicit=columnPreviewHtml({fileName:'syntetiskt.xlsx'},{profiles:[profile()]},result,importSchemas,{}, {allowPartial:true});assert.doesNotMatch(explicit,/data-apply class="primary-action" disabled/);validateData(result.clean);
});
test('invalid optional links are automatically held for completion; valid hyperlinks use their target',()=>{
 const bad=sample();bad[8]='streamToClient';const book=workbook([bad]),p=profile();assert.equal(run(book).report.blocking,0);
 p.columns[8].invalidPolicy='review-field';const chosen=run(book,emptyData(),[p]);assert.equal(chosen.report.blocking,0);assert.equal(chosen.clean.agreements.length,1);assert.equal(chosen.clean.agreements[0].main_contract_url,null);assert.equal(chosen.clean.workspace.importReview[0].value,'streamToClient');assert.equal(chosen.clean.workspace.importReview[0].recordId,'A1');
 book.Sheets.Underlag.I2.l={Target:'https://example.invalid/document.pdf'};const linked=run(book);assert.equal(linked.report.review,0);assert.equal(linked.clean.agreements[0].main_contract_url,'https://example.invalid/document.pdf');
});
test('source precedence is scoped to the exact sheet and column and remains deterministic when sheet order changes',()=>{
 const book=workbook([sample()],'A');const second=sample();second[2]='Vald huvudkälla 1';XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,second]),'B');const a=profile('A'),b=profile('B');
 const preferences={[columnPreferenceKey('properties','address','syntetiskt.xlsx',b,b.columns[2])]:'accept'};
 const one=run(book,emptyData(),[a,b],preferences),two=run(book,emptyData(),[b,a],preferences);
 assert.equal(one.clean.properties[0].address,'Vald huvudkälla 1');assert.equal(two.clean.properties[0].address,'Vald huvudkälla 1');assert.equal(one.report.review,1);assert.equal(one.clean.workspace.importReview[0].sheet,'A');
});
test('an explicit source overwrite rule can never reparent an existing object',()=>{
 const initial=run(workbook([sample()])),other=sample();other[0]='F2';other[1]='Ny fastighet';other[2]='Ny gata';other[5]='A2';const p=profile(),preferences={'objects|propertyId|syntetiskt.xlsx':'accept'};
 const result=run(workbook([other]),initial.clean,[p],preferences);assert.equal(result.report.blocking,1);assert.equal(result.clean.objects[0].property_id,'F1');assert.equal(result.clean.properties.length,1);assert.equal(result.clean.agreements.length,1);assert.match(result.clean.workspace.importReview[0].reason,/inte flytta/);
});
test('date conversion is explicit for string serials and US dates; identities, invalid calendars and unknown dates stay protected',()=>{
 assert.throws(()=>parseDate('45291',XLSX));assert.equal(parseDate('45291',XLSX,false,'excel-1904'),'2028-01-01');assert.equal(parseDate('46753',XLSX,true,'excel-1900'),'2028-01-01');assert.equal(parseDate('01/02/2027',XLSX,false,'mdy'),'2027-01-02');assert.equal(parseDate('01/02/2027',XLSX,false,'dmy'),'2027-02-01');
 assert.equal(parseDate('2027-06-12T12:32:54.123+02:00',XLSX),'2027-06-12');assert.throws(()=>parseDate('2027-02-29T12:00:00Z',XLSX));assert.throws(()=>parseDate('01/02/27',XLSX));
 for(const marker of ['Tills vidare','t.v.','t v','—'])assert.equal(interpretCell({v:marker},{target:'contracts.end',emptyMarkers:true},XLSX),'');
 assert.equal(interpretCell({v:46753,z:'000000'},{target:'objects.id',dateMode:'excel-1900'},XLSX),'046753');
});
test('duplicate header mappings are reused only with the same recorded layout and never migrate by first header match',()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Kontakt','Kontakt'],['A','B']]),'Personer');const schemas=[{key:'people',sheet:'Personer',columns:[['name','Namn'],['email','E-post']]}];
 const p=profileWorkbook(book,schemas,XLSX,[],{reviewed:true})[0];const saved={sheet:p.name,signature:p.signature,columns:[{header:'Kontakt',index:0,target:'people.name'},{header:'Kontakt',index:1,target:'people.email'}]};
 let read=profileWorkbook(book,schemas,XLSX,[saved],{reviewed:true})[0];assert(read.columns.every(c=>!c.approved));saved.layoutSignature=p.layoutSignature;read=profileWorkbook(book,schemas,XLSX,[saved],{reviewed:true})[0];assert.deepEqual(read.columns.map(c=>c.target),['people.name','people.email']);
 retargetColumn(book,read,read.columns[0],'@ignore',XLSX);assert.equal(read.columns[0].approved,true);
});
test('period constraints become record reviews instead of aborting the complete import',()=>{
 const base=run(workbook([sample()])).clean;base.objects[0].valid_from='2025-01-01';base.objects[0].valid_to='2029-12-31';const row=sample();row[5]='A2';row[6]='2030-01-01';row[7]='2035-12-31';const result=run(workbook([row]),base);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements.length,1);assert.equal(result.clean.workspace.importReview[0].recordRejected,true);assert.match(result.clean.workspace.importReview[0].reason,/objektets giltighetstid/);validateData(result.clean);
});

test('column rules follow unique headers when reordered and an explicit reset masks old file-wide rules',async()=>{
 const {importPreference}=await import('../frontend/services/import-preferences.js'),p=profile(),column=p.columns[2];
 const ruleKey=columnPreferenceKey('properties','address','syntetiskt.xlsx',p,column),preferences={[ruleKey]:'accept','properties|address|syntetiskt.xlsx':'reject'};
 const reordered={...p,columns:p.columns.map(c=>({...c,index:targets.length-1-c.index}))};
 assert.equal(importPreference(preferences,'properties','address','syntetiskt.xlsx',reordered,reordered.columns[2]),'accept');
 preferences[ruleKey]='';assert.equal(importPreference(preferences,'properties','address','syntetiskt.xlsx',p,column),'');
});
test('post-import canonical reviews resolve against the exact property; rejected rows and invalid held links cannot be approved',async()=>{
 const {resolveReview}=await import('../frontend/v2/model.js'),{sources}=await import('../frontend/v2/views.js');
 const first=sample(),second=sample();second[2]='Ny adress';second[3]='O2';second[5]='A2';const bad=sample('3');bad[3]='';bad[5]='';
 const result=run(workbook([first,second,bad])),view=result.data,conflict=view.importReview.find(r=>!r.rowRejected);
 const rejected=view.importReview.find(r=>r.recordRejected);const rendered=sources(view,{status:()=>({}),company:()=>false});
 assert.match(rendered,/En del av raden lästes inte in/);assert.ok(!rendered.includes('data-review="'+rejected.id+'" data-decision="accept"'));
 resolveReview(view,conflict.id,'accept','','Testare');assert.equal(view.properties[0].address,'Ny adress');assert.equal(view.contracts.length,2);assert(view.auditLog.some(e=>e.collection==='properties'&&e.recordId==='F1'&&e.fields.some(f=>f.field==='address'&&f.to==='Ny adress')));
 assert.throws(()=>resolveReview(view,rejected.id,'accept','','Testare'),/läs in på nytt/);assert.equal(rejected.status,'pending');resolveReview(view,rejected.id,'reject','','Testare');assert.equal(view.contracts.length,2);assert.equal(rejected.status,'rejected');
 const p=profile();p.columns[8].invalidPolicy='review-field';const invalid=sample();invalid[8]='https://';const held=run(workbook([invalid]),emptyData(),[p]);assert.equal(held.clean.agreements.length,1);assert.throws(()=>resolveReview(held.data,held.data.importReview[0].id,'accept','','Testare'),/läs in på nytt/);
});

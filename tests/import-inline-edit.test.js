import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importCellKey,editedImportWorkbook} from '../frontend/lokaler/import-cell-edits.js';
import {editImportDraft} from '../frontend/lokaler/import-review.js';
import {importCreationPlan,approveImportPlan} from '../frontend/lokaler/import-plan.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {importTableHtml} from '../frontend/v2/import-table.js';
import {importCellCorrections} from '../frontend/v2/import-cell-editor.js';
import {importPeopleHtml} from '../frontend/v2/import-people.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';

function fixture(headers,rows,base=emptyData()){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Underlag');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true});
 const run=(context={},prior=base)=>prepareCleanImport(workbook,profiles,prior,{fileName:'syntetiskt.xlsx',actor:'Testare',...context},XLSX);
 const edit=(row,header,value)=>{const column=profiles[0].columns.find(c=>c.header===header);return {[importCellKey(profiles[0],row,column,'syntetiskt.xlsx')]:{source:'syntetiskt.xlsx',sheet:'Underlag',row,index:column.index,target:column.target,value}};};
 return {base,workbook,profiles,run,edit};
}
const all=(r,b)=>Object.fromEntries(importCreationPlan(r,b).map(e=>[e.key,{signature:e.signature,action:'create'}]));

test('cell corrections are validated by the importer, audited and isolated from the source and saved data',()=>{
 const f=fixture(['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Avtalsnummer','Area'],[['P1','TESTET 1','Testgatan 1','O1','A1',100]]),original=JSON.stringify(f.workbook);
 f.base.workspace.budgetPlans=[{id:'locked',locked:true,amount:123}];
 const edits={...f.edit(2,'Fastighetsnamn','EKEN 2'),...f.edit(2,'Area','125,5')},r=f.run({cellEdits:edits});
 assert.equal(r.clean.properties[0].name,'EKEN 2');assert.equal(r.clean.objects[0].area,125.5);assert.equal(JSON.stringify(f.workbook),original);assert.equal(f.base.properties.length,0);
 assert.equal(approveImportPlan(r,f.base).clean.properties.length,0,'Editing never bypasses creation approval');
 const saved=approveImportPlan(r,f.base,all(r,f.base));assert.deepEqual(saved.clean.workspace.budgetPlans,f.base.workspace.budgetPlans);
 assert(saved.report.changes.some(c=>c.field==='area'&&c.provenance.manual&&c.provenance.confirmedBy==='Testare'));
 assert.equal(r.report.sourceRows[0].manualCorrections.length,2);
 const relink=f.run({cellEdits:f.edit(2,'FastighetsID','P2')},saved.clean);assert(relink.report.blocking>0);assert.equal(relink.clean.objects.find(o=>o.id==='O1').property_id,'P1');
 const invalid=f.run({cellEdits:f.edit(2,'Area','inte en yta')});assert(invalid.clean.workspace.importReview.some(r=>/tal|nummer/i.test(r.reason)));
});

test('edits replace stale cell formulas and are ignored when a column is excluded or remapped',()=>{
 const f=fixture(['FastighetsID','Fastighetsnamn'],[['P1','TESTET 1']]);f.workbook.Sheets.Underlag.B2={t:'s',v:'TESTET 1',w:'gammalt',f:'A1'};
 const edits=f.edit(2,'Fastighetsnamn','NYTT 2'),copy=editedImportWorkbook(f.workbook,f.profiles,edits,'syntetiskt.xlsx',XLSX);
 assert.equal(copy.Sheets.Underlag.B2.v,'NYTT 2');assert(!copy.Sheets.Underlag.B2.f);assert(!copy.Sheets.Underlag.B2.w);assert.equal(f.workbook.Sheets.Underlag.B2.f,'A1');
 f.profiles[0].columns[1].target='@ignore';assert.equal(editedImportWorkbook(f.workbook,f.profiles,edits,'syntetiskt.xlsx',XLSX),f.workbook);
 f.profiles[0].columns[1].target='properties.address';assert.equal(editedImportWorkbook(f.workbook,f.profiles,edits,'syntetiskt.xlsx',XLSX),f.workbook);
});

test('source cells are editable on the opened row and no designation editor remains inside relationship cards',()=>{
 const f=fixture(['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Avtalsnummer'],[['P1','','Testgatan 1','O1','A1']]),r=f.run(),story=explainImport(r,f.base,{profiles:f.profiles});
 const html=importTableHtml({workbook:f.workbook,XLSX,fileName:'syntetiskt.xlsx'},f.profiles,r,f.base,{openRows:new Set([story.rows[0].key])});
 assert.match(html,/data-import-cell=/);assert.match(html,/aria-label="Fastighetsnamn · rad 2"/);assert.doesNotMatch(html,/data-complete-property|Komplettera beteckning nu/);
 const cards=html.slice(html.indexOf('class="import-row-detail'));assert.doesNotMatch(cards,/data-property-designation/);
});

test('person facts are edited once, preserve identity on reimport and do not affect excluded people',()=>{
 const f=fixture(['FastighetsID','Fastighetsnamn','Fastighetsförvaltare'],[['P1','TESTET 1','Person Ett']]),r=f.run(),id=r.clean.people[0].id;
 assert.throws(()=>editImportDraft(r,f.base,{people:{[id]:{email:'fel adress'}}}),/e-postadress/);
 const edited=editImportDraft(r,f.base,{people:{[id]:{name:'Person Rättad',email:'person@example.test',phone:'010123'}}},'Testare'),saved=approveImportPlan(edited,f.base,all(edited,f.base));
 assert.equal(r.clean.people[0].name,'Person Ett');assert.equal(saved.clean.people[0].name,'Person Rättad');
 const again=f.run({},saved.clean);assert.equal(again.clean.people.length,1);assert.equal(again.clean.contacts.length,1);assert.equal(again.clean.people[0].id,id);assert.equal(again.clean.people[0].name,'Person Rättad');assert.equal(again.clean.people[0].email,'person@example.test');
 const html=importPeopleHtml(edited,f.base,{approved:saved,editing:new Set([id])});assert.match(html,/<th data-register="people">E-post/);assert.match(html,/data-person-key="phone"/);assert.match(html,/data-contact-role/);assert.match(html,/data-contact-target/);assert.doesNotMatch(html,/>PER-|>KOP-/);
 f.profiles[0].columns[2].target='@ignore';const excluded=f.run({},saved.clean),ignored=editImportDraft(excluded,saved.clean,{people:{[id]:{name:'Ska ignoreras'}}});assert.equal(ignored.clean.people[0].name,'Person Rättad');
});

test('same-number value conflicts explain whether the old value came from this file or a previous import',()=>{
 const f=fixture(['FastighetsID','Fastighetsnamn','Gatuadress'],[['P1','TESTET 1','Testgatan 1'],['P1','TESTET 2','Testgatan 1']]);
 const first=f.run(),prepared={workbook:f.workbook,XLSX,fileName:'syntetiskt.xlsx'},html=columnPreviewHtml(prepared,{profiles:f.profiles},first,importSchemas);
 assert.equal(first.report.linkProposals.length,0);assert.match(html,/Tidigare rad i filen/);assert.match(html,/Samma identifierare/);assert.match(html,/data-import-conflict-choice=/);assert.doesNotMatch(html,/Är detta samma fastighet/);
 const base=emptyData();base.properties.push(normalize('properties',{id:'P1',name:'SPARAD 1',address:'Testgatan 1'}));
 const next=f.run({},base),comparison=columnPreviewHtml(prepared,{profiles:f.profiles},next,importSchemas,{}, {explanationBase:base});assert.match(comparison,/Sparat före importen/);
});

test('only keyless enrichment offers same or own property, and own choice cannot overwrite an existing business number',()=>{
 const base=emptyData();base.properties.push(normalize('properties',{id:'P1',name:'TESTET 1',address:'Testgatan 1',management_object_number:'1569'}));
 const f=fixture(['Gatuadress','Populärnamn'],[['Testgatan 1','Eget hus']],base),r=f.run(),p=r.report.linkProposals[0];assert.equal(p.canCreateNew,true);
 const own=f.run({rowMatches:{[p.matchingKey]:{action:'new',signature:p.signature,propertyNumber:'2001'}}});assert.equal(own.report.blocking,0);assert.equal(own.clean.properties.length,2);assert.equal(own.clean.properties.find(x=>x.id==='SF2001').popular_name,'Eget hus');assert.equal(own.report.sourceRows[0].matchingDecision.method,'explicit-new-property');
 const bad=f.run({rowMatches:{[p.matchingKey]:{action:'new',signature:p.signature,propertyNumber:'1569'}}});assert.equal(bad.clean.properties.length,1);assert(bad.report.blocking>0);
 const initial=fixture(['FastighetsID','Fastighetsnamn','Gatuadress'],[['SF1','HUS 1','Testgatan 1'],['SF2','HUS 2','Testgatan 1']]).run();assert.equal(initial.clean.properties.length,2);assert.equal(initial.report.linkProposals.length,0);
});


test('manual person correction reuses the imported value when a saved value had already conflicted',()=>{
 const base=emptyData();base.people.push(normalize('people',{id:'KNOWN',name:'Person Ett',phone:'010-gammalt'}));
 const f=fixture(['FastighetsID','Fastighetsnamn','Fastighetsförvaltare','Telefon'],[['P1','TESTET 1','Person Ett','010-filen']],base);f.profiles[0].columns[3].target='contact.2.phone';
 const r=f.run();assert.equal(r.clean.people[0].phone,'010-gammalt');assert(r.report.reviewIds.length>0);
 const corrected=editImportDraft(r,base,{people:{KNOWN:{phone:'010-rättat'}}}),saved=approveImportPlan(corrected,base,all(corrected,base)),again=f.run({},saved.clean);
 assert.equal(again.clean.people.length,1);assert.equal(again.clean.people[0].phone,'010-rättat');assert.equal(again.report.reviewIds.length,0,'The same source value never asks for the resolved phone decision again');
});


test('editing one price column neither changes nor approves other prices with the same mapped field',()=>{
 const f=fixture(['FastighetsID','ObjektID','Avtalsnummer','Bashyra','Tillägg','Tillägg'],[['P1','O1','A1',100000,5000,6000],['P1','O1','A1',100000,5000,6000]]),base=f.run().clean;
 f.workbook.Sheets.Underlag.E2.v=5500;f.workbook.Sheets.Underlag.E3.v=5500;f.workbook.Sheets.Underlag.F2.v=6500;f.workbook.Sheets.Underlag.F3.v=6500;
 const candidate=f.run({},base),rows=explainImport(candidate,base,{profiles:f.profiles}).rows,edits=importCellCorrections(rows,f.profiles,rows[0],f.profiles[0].columns[3],'111000','syntetiskt.xlsx');
 assert.equal(Object.keys(edits).length,2);assert(Object.values(edits).every(e=>e.index===3));
 const r=f.run({cellEdits:edits},base);assert.equal(r.clean.agreement_items.find(i=>i.type==='base').base_amount,111000);assert.deepEqual(r.clean.agreement_items.filter(i=>i.type==='addition').map(i=>i.base_amount),[5000,6000]);assert(r.report.reviewIds.length>=2,'Other price differences still require their own decision');
 const addition=importCellCorrections(rows,f.profiles,rows[0],f.profiles[0].columns[5],'7000','syntetiskt.xlsx');assert.equal(Object.keys(addition).length,2);assert(Object.values(addition).every(e=>e.index===5));
});

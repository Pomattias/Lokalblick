import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importCreationPlan,approveImportPlan} from '../frontend/lokaler/import-plan.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {explainImport,importColumnMeaning} from '../frontend/lokaler/import-explanation.js';
import {importRowHtml,importTableHtml} from '../frontend/v2/import-table.js';
const importStoryHtml=(result,base,options)=>{const story=explainImport(result,base,options);return story.rows.map(row=>importRowHtml(row,result,base)).join('');};
const headers=['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Avtalsnummer','Area','Grundhyra','Hyra justeringsregel','Ort'];
const row=['P1','TESTET 1','Testgatan 1','O1','A1',100,10000,'none','Teststad'];
function prepare(base=emptyData(),rows=[row],names=headers,{fileName='syntetiskt.xlsx',ignore=[]}={}){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([names,...rows]),'Underlag');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true});for(const column of profiles[0].columns)if(ignore.includes(column.header))column.target='@ignore';
 return {workbook,profiles,result:prepareCleanImport(workbook,profiles,base,{fileName},XLSX)};
}
const all=(candidate,base)=>Object.fromEntries(importCreationPlan(candidate,base).map(entry=>[entry.key,{signature:entry.signature,action:'create'}]));

test('every processed row has a source location and actual property/object/agreement/price references',()=>{
 const {result}=prepare(),trace=result.report.sourceRows[0];
 assert.equal(trace.source,'syntetiskt.xlsx');assert.equal(trace.sheet,'Underlag');assert.equal(trace.row,2);
 assert.deepEqual(trace.records.properties,['P1']);assert.deepEqual(trace.records.objects,['O1']);assert.deepEqual(trace.records.agreements,['A1']);assert.equal(trace.records.agreement_items.length,1);
 assert.equal(trace.matchingDecision.method,'property-id');assert(!Object.hasOwn(trace,'sourceValues'));
 assert(!Object.hasOwn(result.clean.workspace.sourceRegistry[0].receipt,'sourceRows'),'Trace stays in the transient review report');
});
test('new roots await a decision and the approved chain shows what will actually be created',()=>{
 const base=emptyData(),{result,profiles}=prepare(base),before=JSON.stringify(result);
 const preview=explainImport(result,base,{profiles});assert.equal(preview.rows[0].status,'pending');assert.equal(preview.counts.pending,1);
 const choices=all(result,base),approved=approveImportPlan(result,base,choices),story=explainImport(result,base,{approved,choices,profiles});
 assert.equal(story.rows[0].status,'created');assert.deepEqual(story.rows[0].nodes.map(node=>node.table),['properties','objects','agreements','agreement_items']);assert(story.rows[0].nodes.every(node=>node.status==='created'));assert.equal(JSON.stringify(result),before);
});
test('a deferred property explains why its object, agreement and price are withheld',()=>{
 const base=emptyData(),{result,profiles}=prepare(base),choices=all(result,base),property=importCreationPlan(result,base).find(entry=>entry.table==='properties');choices[property.key].action='defer';
 const approved=approveImportPlan(result,base,choices),story=explainImport(result,base,{approved,choices,profiles});
 assert.equal(story.rows[0].status,'skipped');assert.equal(story.counts.skipped,1);assert(story.rows[0].nodes.every(node=>node.status==='skipped'));
 assert.match(story.rows[0].nodes.find(node=>node.table==='agreement_items').reason,/Priset läses inte in.*Fastighet P1 är bortvald/);
 assert.equal(story.rows[0].columns.find(column=>column.header==='Avtalsnummer').status,'skipped');
});
test('a new object can be deferred while the approved property remains visible as a partial import',()=>{
 const base=emptyData(),{result,profiles}=prepare(base),choices=all(result,base),object=importCreationPlan(result,base).find(entry=>entry.table==='objects');choices[object.key].action='defer';
 const approved=approveImportPlan(result,base,choices),story=explainImport(result,base,{approved,choices,profiles});
 assert.equal(story.rows[0].partial,true);assert.equal(story.rows[0].status,'created');assert.match(story.rows[0].nodes.find(node=>node.table==='agreement_items').reason,/Objekt O1 är bortvald/);
});
test('known agreements explain their saved links and a true reimport is unchanged',()=>{
 const base=prepare().result.clean,{result,profiles}=prepare(base),story=explainImport(result,base,{approved:approveImportPlan(result,base),profiles});
 assert.equal(story.rows[0].status,'unchanged');assert.equal(story.counts.unchanged,1);assert.match(story.rows[0].explanation,/Avtalsnummer A1 finns redan.*sparade objekt O1 och fastighet P1/);assert(story.rows[0].nodes.every(node=>node.existing));
 const suggested=prepare(base,[['Testgatan 1','A2',100]],['Gatuadress','Avtalsnummer','Area']);assert.equal(suggested.result.report.linkProposals.length,1);assert.match(importTableHtml({fileName:'syntetiskt.xlsx'},suggested.profiles,suggested.result,base),/data-link-proposal="0"/);
});
test('empty facts are completed while changed prices display old and new values',()=>{
 const base=prepare().result.clean;base.objects[0].area=null;
 const complement=prepare(base),story=explainImport(complement.result,base,{approved:approveImportPlan(complement.result,base),profiles:complement.profiles});
 assert.equal(story.rows[0].status,'completed');
 const changed=prepare(base,[[...row.slice(0,6),11000,...row.slice(7)]]),candidate=resolveImportChoices(changed.result,{mode:'replace'}),approved=approveImportPlan(candidate,base),updated=explainImport(candidate,base,{approved,profiles:changed.profiles});
 assert.equal(updated.rows[0].status,'changed');const price=updated.rows[0].nodes.find(node=>node.table==='agreement_items');assert.equal(price.before.base_amount,10000);assert.equal(price.record.base_amount,11000);
 assert.match(importStoryHtml(candidate,base,{approved,profiles:changed.profiles}),/10.000 kr → 11.000 kr/);
});
test('choosing to keep an old value explains the source value that will not be used',()=>{
 const base=prepare().result.clean,changed=prepare(base,[[...row.slice(0,5),130,...row.slice(6)]]),candidate=resolveImportChoices(changed.result,{mode:'keep'}),approved=approveImportPlan(candidate,base),story=explainImport(candidate,base,{approved,profiles:changed.profiles});
 assert.equal(story.rows[0].status,'unchanged');assert.match(story.rows[0].columns.find(column=>column.header==='Area').reason,/Filens avvikande värde används inte/);
});
test('an ignored-only row and ignored columns stay visible without copying cell contents',()=>{
 const rows=[[...row,'DO NOT COPY SOURCE CELL'],['','','','','','','','','','IGNORED ONLY']],{result,profiles}=prepare(emptyData(),rows,[...headers,'Anteckning'],{ignore:['Anteckning']}),story=explainImport(result,emptyData(),{profiles});
 assert.equal(result.report.sourceRows.length,2);assert.equal(result.report.sourceRows[1].ignored,true);assert.equal(story.rows[1].status,'skipped');assert.match(story.rows[0].reasons.join(' '),/Anteckning: Kolumnen är bortvald/);assert(!JSON.stringify(result.report.sourceRows).includes('DO NOT COPY'));assert.equal(result.clean.workspace.sourceRegistry[0].receipt.ignoredRows,1);
});
test('invalid source links are not described as successful saved-agreement matches',()=>{
 const base=prepare().result.clean,input=[...row];input[3]='WRONG-OBJECT';
 const {result,profiles}=prepare(base,[input]),story=explainImport(result,base,{profiles});
 assert.equal(story.rows[0].status,'pending');assert(story.rows[0].nodes.some(node=>node.identified===false));assert.doesNotMatch(story.rows[0].explanation,/sparade objekt/);assert.match(story.rows[0].reasons.join(' '),/olika objekt/);
 const badId=[...row];badId[4]='A1\nA2';const partial=prepare(base,[badId]),explained=explainImport(partial.result,base,{profiles:partial.profiles});assert.match(explained.rows[0].explanation,/bara delvis identifierad/);assert(explained.rows[0].nodes.some(node=>node.table==='agreements'&&node.identified===false));
});
test('a bad optional date explains a partial import rather than hiding the valid records',()=>{
 const base=prepare().result.clean,{result,profiles}=prepare(base,[[...row,'not a date','Fylls i']], [...headers,'Säg upp senast','Användning']),approved=approveImportPlan(result,base),story=explainImport(result,base,{approved,profiles});
 assert.equal(story.rows[0].status,'pending');assert.equal(story.rows[0].partial,true);assert.equal(approved.clean.agreements[0].usage,'Fylls i');assert.match(story.rows[0].columns.find(column=>column.header==='Säg upp senast').reason,/datum/);
});
test('explicit mapping explains the chosen existing property and retains differing facts for a decision',()=>{
 const base=emptyData();base.properties.push(normalize('properties',{id:'E',name:'SPARAD 1',address:'Sparad gata 1'}));
 const {result,profiles}=prepare(base),choices=all(result,base),entry=importCreationPlan(result,base).find(entry=>entry.table==='properties');choices[entry.key]={signature:entry.signature,action:'map',targetId:'E'};
 const approved=approveImportPlan(result,base,choices),story=explainImport(result,base,{approved,choices,profiles});
 assert.equal(story.rows[0].nodes.find(node=>node.table==='properties').actualId,'E');assert.match(story.rows[0].explanation,/Du kopplar fastighetsförslaget P1 till befintlig fastighet E/);assert.equal(story.rows[0].status,'pending');assert(story.rows[0].reasons.some(reason=>/Olika uppgifter vid vald koppling/.test(reason)));assert.equal(story.rows[0].columns.find(column=>column.header==='Fastighetsnamn').status,'pending');
});
test('counts are source rows rather than a sum of properties, objects, agreements and prices',()=>{
 const base=emptyData(),{result,profiles}=prepare(base,[row,row]),choices=all(result,base),approved=approveImportPlan(result,base,choices),story=explainImport(result,base,{approved,choices,profiles});
 assert.equal(story.rows.length,2);assert.equal(story.counts.created,2);assert.equal(Object.values(story.counts).reduce((a,b)=>a+b,0),2);assert.equal(approved.clean.properties.length,1);assert.equal(approved.clean.agreement_items.length,1);
});
test('new source provenance alone is not presented as a changed business price',()=>{
 const base=prepare().result.clean,{result,profiles}=prepare(base,[row],headers,{fileName:'annan-fil.xlsx'}),story=explainImport(result,base,{approved:approveImportPlan(result,base),profiles});
 assert.equal(story.rows[0].status,'unchanged');assert.equal(story.rows[0].nodes.find(node=>node.table==='agreement_items').status,'unchanged');
 assert.equal(result.report.tables.find(table=>table.collection==='agreementItems').updated,0);assert.equal(result.report.tables.find(table=>table.collection==='agreementItems').unchanged,1);
});
test('column explanations use the selected business field and contact role',()=>{
 assert.match(importColumnMeaning({header:'Mitt belopp',target:'agreementItems.baseAmount',itemType:'base'}),/Mitt belopp läses som Bashyra på avtalet/);
 assert.match(importColumnMeaning({header:'Min adress',target:'properties.address'}),/Min adress läses som Adress på fastigheten/);
 assert.match(importColumnMeaning({header:'Förvaltare',target:'properties.ownerResponsiblePersonId'}),/fastighetsägarens kontaktperson på fastigheten/);
 assert.match(importColumnMeaning({header:'Bortvald',target:'@ignore'}),/bortvald/);assert.match(importColumnMeaning({header:'Okänd',target:'@unmapped'}),/Välj vilket fält/);
 assert.match(importColumnMeaning({header:'Tillägg',target:'agreementItems.baseAmount',itemAmbiguous:true}),/Välj vilken avtalspost/);
});

test('a missing column mapping explains the problem and links directly to that column choice',()=>{
 const base=emptyData(),{result,profiles}=prepare(base,[row],headers.map((header,index)=>index===0?'Källans husnyckel':header)),story=explainImport(result,base,{profiles});
 assert.match(story.rows[0].reasons.join(' '),/Källans husnyckel: Välj vilket fält/);
 assert.match(importStoryHtml(result,base,{profiles}),/Källans husnyckel/);
});
test('row cards escape source text and missing designations are never replaced by addresses',()=>{
 const base=emptyData(),input=[...row];input[1]=input[2];
 const {result,profiles}=prepare(base,[input],headers,{fileName:'<img src=x>.xlsx'}),choices=all(result,base),html=importStoryHtml(result,base,{approved:approveImportPlan(result,base,choices),choices,profiles});
 assert.match(html,/Fastighetsbeteckning saknas/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/data-chain-table="objects"/);assert.match(html,/Komplettera beteckning nu/);
});

import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {excludeImportColumn,reviewProfiles} from '../frontend/v2/import-mapping.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {emptyData} from '../frontend/lokaler/model.js';
function fixture(){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['FastighetsID','ObjektID','Avtalsnummer','Bashyra','From'],['P1','O1','A1',10000,'2027-01-01']]),'Test');return {workbook,profile:profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true})[0]};}
test('exclusion preserves the selected price, item identity and date interpretation',()=>{
 const {workbook,profile}=fixture(),price=profile.columns[3],date=profile.columns[4];price.itemKey='base';date.dateMode='dmy';
 for(const column of [price,date]){const before={target:column.target,itemKey:column.itemKey,itemType:column.itemType,dateMode:column.dateMode};excludeImportColumn(workbook,profile,column,true,XLSX);assert.equal(column.target,'@ignore');excludeImportColumn(workbook,profile,column,false,XLSX);for(const [key,value]of Object.entries(before))assert.equal(column[key],value,key);}
});
test('an excluded destination is retained when saving and reopening the import mapping',()=>{
 const {workbook,profile}=fixture(),column=profile.columns[3];excludeImportColumn(workbook,profile,column,true,XLSX);
 const r=prepareCleanImport(workbook,[profile],emptyData(),{fileName:'test.xlsx'},XLSX);assert.equal(r.clean.agreement_items.length,0);
 const reopened=reviewProfiles(profileWorkbook(workbook,importSchemas,XLSX,r.clean.workspace.importMappings,{reviewed:true}),importSchemas)[0];assert.equal(reopened.columns[3].target,'@ignore');assert.equal(reopened.columns[3].excludedTarget,'agreementItems.baseAmount');excludeImportColumn(workbook,reopened,reopened.columns[3],false,XLSX);assert.equal(reopened.columns[3].target,'agreementItems.baseAmount');assert.equal(reopened.columns[3].itemType,'base');
});

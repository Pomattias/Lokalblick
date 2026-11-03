import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {guardMultipleAgreementNumbers} from '../frontend/v2/import-guided-guard.js';
import {editedImportWorkbook} from '../frontend/lokaler/import-cell-edits.js';

test('several agreement numbers in one source cell are deferred without altering the Excel file',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([
  ['FörvaltningsNr','Avtalsnummer','Fastighetsnamn'],
  ['101','A-1; A-2','Huset A'],
  ['102','A-3','Huset B']
 ]);
 const workbook={SheetNames:['Lokallista'],Sheets:{Lokallista:sheet}};
 const prepared={workbook,fileName:'LOKALLISTA BERIKNING.xlsx'};
 const profiles=[{name:'Lokallista',headerIndex:0,headerRow:1,
  columns:[{index:0,target:'properties.managementObjectNumber',header:'FörvaltningsNr'},
   {index:1,target:'contracts.id',header:'Avtalsnummer'}]}];
 const guarded=guardMultipleAgreementNumbers(prepared,profiles,XLSX);
 assert.equal(guarded.issues.length,1);
 assert.equal(guarded.issues[0].row,2);
 assert.match(guarded.issues[0].message,/dela upp dem i flera rader/i);
 assert.deepEqual(Object.values(guarded.edits).map(e=>({row:e.row,index:e.index,value:e.value})),
  [{row:2,index:1,value:''}]);
 const modified=editedImportWorkbook(workbook,profiles,guarded.edits,prepared.fileName,XLSX);
 assert.equal(modified.Sheets.Lokallista.B2.v,'');
 assert.equal(workbook.Sheets.Lokallista.B2.v,'A-1; A-2');
 assert.equal(modified.Sheets.Lokallista.B3.v,'A-3');
});
test('valid hyphenated numbers are never split and an unrelated object column is untouched',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['Avtalsnummer','Objektnummer'],
  ['AVT-2025/02','101-001'],['AVT-2025-3','101-002']]);
 const p={workbook:{SheetNames:['Lokallista'],Sheets:{Lokallista:sheet}},fileName:'source.xlsx'};
 const profiles=[{name:'Lokallista',headerIndex:0,headerRow:1,columns:[
  {index:0,target:'contracts.id',header:'Avtalsnummer'},
  {index:1,target:'objects.id',header:'Objektnummer'}]}];
 const guard=guardMultipleAgreementNumbers(p,profiles,XLSX);
 assert.equal(guard.issues.length,0);
 assert.equal(Object.keys(guard.edits).length,0);
});

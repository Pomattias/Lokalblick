import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {parseDate,parseNumber,interpretCell,profileFormat} from '../frontend/services/import-formats.js';
test('Swedish amounts, currency suffixes, scales and negative amounts are numeric',()=>{
 for(const [raw,value] of [['1 234,50 kr',1234.5],['1\u00a0234,50 SEK',1234.5],['(1 200 kr)',-1200],['1200-',-1200],['6 Mkr',6000000],['15 tkr/år',15000],['1.234,50',1234.5],['1,234.50',1234.5],['2,5 %',2.5]])assert.equal(parseNumber(raw),value,raw);
 for(const raw of ['120 kr ungefär','1,2,3','—','1 2 text'])assert.throws(()=>parseNumber(raw));
});
test('dates are calendar-validated, including Swedish text and both Excel date systems',()=>{
 for(const raw of ['2028-02-29','29/02/2028','20280229'])assert.equal(parseDate(raw,XLSX),'2028-02-29');
 assert.equal(parseDate(46753,XLSX),'2028-01-01');
 assert.equal(parseDate(45291,XLSX,true),'2028-01-01');
 for(const raw of ['2027-02-29','31/04/2027','01/02/27'])assert.throws(()=>parseDate(raw,XLSX));
});
test('semantic identities retain leading zeroes and format does not turn an ID into a date',()=>{
 const c={target:'objects.number',header:'Objektnummer'};
 assert.equal(interpretCell({v:'000123'},c,XLSX),'000123');
 assert.equal(profileFormat([{v:'000123'},{v:46753,z:'yyyy-mm-dd'}],c,XLSX).type,'text');
});
test('automatic currency conversion respects units without double scaling',()=>{
 assert.equal(interpretCell({v:'6'}, {target:'activities.estimatedCost',header:'Bedömd kostnad, Mkr'},XLSX),6000000);
 assert.equal(interpretCell({v:'6 Mkr'}, {target:'activities.estimatedCost',header:'Bedömd kostnad, Mkr'},XLSX),6000000);
 assert.equal(interpretCell({v:'1 200 kr'}, {target:'contracts.baseRent',header:'Bashyra, kr/mån'},XLSX),14400);
 assert.equal(interpretCell({v:.75,z:'0%'}, {target:'contracts.rentIndexPercent'},XLSX),75);
});
test('unknown supplementary columns infer formats and invalid known dates are counted',()=>{
 assert.equal(profileFormat([{v:46753,z:'yyyy-mm-dd'}],{target:'@extra',header:'Besiktning'},XLSX).type,'date');
 assert.equal(profileFormat([{v:'250 kr'}],{target:'@extra',header:'Extra'},XLSX).type,'currency');
 assert.equal(profileFormat([{v:'2,5'}],{target:'@extra'},XLSX).type,'number');
 assert.equal(profileFormat([{v:'2027-02-29'}],{target:'contracts.end'},XLSX).invalid,1);
 assert.equal(interpretCell({v:46753},{target:'@extra',format:{type:'date'}},XLSX),'2028-01-01');
});
test('supplementary money is normalized to kronor and general text stays text',()=>{
 assert.equal(interpretCell({v:6},{target:'@extra',header:'Förslag, Mkr',format:{type:'currency'}},XLSX),6000000);
 assert.equal(interpretCell({v:123},{target:'people.name'},XLSX),'123');
 assert.equal(interpretCell({v:123,z:'000000'},{target:'objects.number'},XLSX),'000123');
 assert.equal(profileFormat([{v:'000123'}],{target:'@extra',header:'Referenskod'},XLSX).type,'text');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {nextObjectNumber,nextAgreementNumber} from '../frontend/v3/numbering.js';
const property=(id='p',number='SF1213')=>({id,management_object_number:number});
const object=(id,number,property_id='p')=>({id,object_number:number,property_id});
test('business numbers cascade from property through physical object and lease',()=>{
 const p=property();
 assert.equal(nextObjectNumber(p,[],[p]),'SF1213-001');
 assert.equal(nextObjectNumber(p,[object('1','SF1213-001'),object('2','SF1213-003')],[p]),'SF1213-004');
 assert.equal(nextAgreementNumber(object('1','SF1213-001'),[]),'SF1213-001-01');
 assert.equal(nextAgreementNumber(object('1','SF1213-001'),[
  {agreement_number:'SF1213-001-01'},{agreement_number:'SF1213-001-03'}
 ]),'SF1213-001-04');
});
test('numbering retains original spelling, leading zeros, and manual imported business numbers',()=>{
 const p=property('x','001213');
 assert.equal(nextObjectNumber(p,[object('a','001213-0001','x')],[p]),'001213-002');
 assert.equal(nextAgreementNumber(object('a','CUSTOM'),[{agreement_number:'CUSTOM-01'}]),'CUSTOM-02');
 assert.equal(nextAgreementNumber(object('a','ABC[27]'),[{agreement_number:'ABC[27]-05'}]),'ABC[27]-06');
 assert.equal(nextAgreementNumber(object('a','SF1213-001'),[{agreement_number:'SF1213-001-01'}, {agreement_number:'A-OTHER'}]),'SF1213-001-02');
});
test('an unnumbered or ambiguously numbered property needs a review, never fake UUID numbering',()=>{
 const p=property('p','');
 assert.equal(nextObjectNumber(p,[],[p]),null);
 const a=property('a','SF1213'),b=property('b','sf1213');
 assert.equal(nextObjectNumber(a,[],[a,b]),null);
 assert.equal(nextAgreementNumber(object('x',''),[]),null);
});

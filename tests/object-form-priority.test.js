import test from 'node:test';
import assert from 'node:assert/strict';
import {isPrimaryObjectField} from '../frontend/v2/record-workspace.js';

test('objektets identitet, yta och datum är direkt tillgängliga',()=>{
  for(const field of ['id','number','name','area','propertyId','unitId','start','end','responsiblePersonId'])
    assert.equal(isPrimaryObjectField(field),true,field);
});

test('objektets övriga uppgifter kan fällas ihop utan att byta datamodell',()=>{
  assert.equal(isPrimaryObjectField('predecessorIds'),true,'Historik har ett eget avsnitt');
  for(const field of ['workplaceCount','hubCount','category','sourceRow','apartmentArea'])
    assert.equal(isPrimaryObjectField(field),false,field);
});

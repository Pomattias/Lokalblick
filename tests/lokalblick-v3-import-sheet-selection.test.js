import test from 'node:test';
import assert from 'node:assert/strict';
import {importableSheetNames} from '../frontend/v3/import.js';

test('master workbook keeps reference sheets out of the import selector',()=>{
 const names=['SF','EXT','Lokallista','Fastighetsregister','Lokalbestånd','Lokaldata','Ärenden','Beställningar','Part','Person'];
 const selected=importableSheetNames(names);
 assert.deepEqual(selected,['Lokallista','Lokalbestånd','Lokaldata','Ärenden','Beställningar','Part','Person']);
 assert.deepEqual(names.slice(0,4),['SF','EXT','Lokallista','Fastighetsregister']);
});

test('Fastighetsregister is never imported even without a Lokallista sheet',()=>{
 assert.deepEqual(importableSheetNames(['FASTIGHETSREGISTER','Ärenden','SF']),['Ärenden','SF']);
});

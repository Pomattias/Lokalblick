#!/usr/bin/env node
import { resolve } from 'node:path';
import { createFreshDatabase } from '../backend/lokaler/v3/database.js';
const file=process.argv[2];
if(!file){console.error('Användning: npm run db:v3:create -- /säker/lokal/sökväg/lokalblick-v3.sqlite');process.exitCode=2;}
else{
 try{
  const path=resolve(file),db=createFreshDatabase(path);
  const tables=db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'store_meta'").get().n;
  db.close();
  console.log('Ny, tom Lokalblick v3-databas skapad: '+path+' ('+tables+' verksamhetstabeller)');
 }catch(error){console.error(error.message);process.exitCode=1;}
}

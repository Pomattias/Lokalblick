import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, readFileSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
export const MODEL_VERSION = 3;
export const APPLICATION_ID = 0x4c425633;

export function openMemoryDatabase() {
 const db = new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 try { db.exec(schema); return db; } catch (error) { db.close(); throw error; }
}

// New installation only: never silently migrate or overwrite a workspace.
export function createFreshDatabase(file) {
 if (!file || file === ':memory:') throw Error('Ange en ny SQLite-filsökväg.');
 if (existsSync(file)) throw Error('Databasfilen finns redan. Välj en ny tom fil.');
 mkdirSync(dirname(file), {recursive:true, mode:0o700});
 const handle = openSync(file,'wx',0o600);
 closeSync(handle);
 let db;
 try {
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(schema);
  chmodSync(file,0o600);
  return db;
 } catch (error) {
  db?.close();
  unlinkSync(file);
  throw error;
 }
}

export function openExistingDatabase(file) {
 if (!existsSync(file)) throw Error('Ingen Lokalblick v3-databas på angiven sökväg.');
 const db = new DatabaseSync(file);
 try {
  db.exec('PRAGMA foreign_keys=ON');
  const app = db.prepare('PRAGMA application_id').get().application_id;
  if (app !== APPLICATION_ID) throw Error('Databasen är inte Lokalblick v3. Migrering stöds inte.');
  const meta = db.prepare('SELECT model_version FROM store_meta WHERE id=1').get();
  if (meta?.model_version !== MODEL_VERSION)
   throw Error('Databasen är inte Lokalblick v3. Migrering stöds inte.');
  // Do not open an older v3 layout in write mode and then fail halfway through
  // a party/order operation. This branch intentionally never migrates data.
  const orderFields=new Set(db.prepare('PRAGMA table_info(orders)').all().map(x=>x.name));
  const rolesSql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stakeholder_assignments'").get()?.sql||'';
  if(!orderFields.has('property_id')||!orderFields.has('object_id')||!rolesSql.includes("'supplier'"))
   throw Error('Den här Lokalblick v3-versionen kräver ny databasstruktur för partroller och beställningar. Den befintliga databasen har inte ändrats.');
  return db;
 } catch (error) { db.close(); throw error; }
}
const date = (day) => {
 if (typeof day!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
 || Number.isNaN(Date.parse(day+'T00:00:00Z'))
 || new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
 throw Error('Ange ett giltigt ISO-datum (YYYY-MM-DD).');
 return day;
};

// A version owns area and other mutable facts. Its end date is derived from the next start.
export function objectVersionAt(db, objectId, asOf) {
 const at=date(asOf);
 return db.prepare(`SELECT v.*,o.object_number,o.property_id,
 CASE WHEN n.valid_from IS NULL THEN o.ended_on
 WHEN o.ended_on IS NOT NULL AND o.ended_on < date(n.valid_from,'-1 day') THEN o.ended_on
 ELSE date(n.valid_from,'-1 day') END AS valid_to
 FROM object_versions v JOIN objects o ON o.id=v.object_id
 LEFT JOIN object_versions n ON n.object_id=v.object_id AND n.valid_from=(
 SELECT MIN(x.valid_from) FROM object_versions x WHERE x.object_id=v.object_id AND x.valid_from>v.valid_from)
 WHERE v.object_id=? AND v.valid_from<=? AND (o.ended_on IS NULL OR o.ended_on>=?)
 ORDER BY v.valid_from DESC LIMIT 1`).get(objectId,at,at) ?? null;
}

// One latest version per agreement number; 'ended' is a displayed status, not a deleted record.
export function agreementVersionsAt(db, asOf, { includeEnded=true }={}) {
 const at=date(asOf);
 const results=db.prepare(`SELECT a.id,a.agreement_number,a.object_id,v.id AS version_id,
 v.valid_from,v.legal_end_on,v.terminated_on,v.agreement_type,v.usage,v.business_description,
 CASE WHEN v.legal_end_on IS NOT NULL AND v.legal_end_on < ? THEN 'ended' ELSE 'current' END AS period_status
 FROM agreements a JOIN agreement_versions v ON v.agreement_id=a.id
 WHERE v.valid_from=(SELECT MAX(x.valid_from) FROM agreement_versions x
 WHERE x.agreement_id=a.id AND x.valid_from<=?)
 ORDER BY a.agreement_number`).all(at,at);
 return includeEnded ? results : results.filter(r=>r.period_status==='current');
}

const parentScope=(db,where)=>{
 // Issue and order scopes may inherit property roles without persisting copies.
 // Supplier and invoice roles remain attached only to the specific order.
 if (where.orderId) {
  const row=db.prepare('SELECT issue_id,object_id,property_id FROM orders WHERE id=?').get(where.orderId);
  if(!row)throw Error('Beställningen saknas.');
  const parent=row.issue_id?{issueId:row.issue_id}:row.object_id?{objectId:row.object_id}:{propertyId:row.property_id};
  return [{field:'order_id',id:where.orderId},...parentScope(db,parent)];
 }
 if (where.issueId) {
  const row=db.prepare('SELECT agreement_id,object_id,property_id FROM issues WHERE id=?').get(where.issueId);
  if(!row)throw Error('Ärendet saknas.');
  const parent=row.agreement_id?{agreementId:row.agreement_id}:row.object_id?{objectId:row.object_id}:{propertyId:row.property_id};
  return [{field:'issue_id',id:where.issueId},...parentScope(db,parent)];
 }
 if (where.agreementId) {
  const row=db.prepare('SELECT a.id AS agreement_id,o.id AS object_id,o.property_id FROM agreements a JOIN objects o ON o.id=a.object_id WHERE a.id=?').get(where.agreementId);
  if (!row) throw Error('Avtalet saknas.');
  return [{field:'agreement_id',id:row.agreement_id},{field:'object_id',id:row.object_id},{field:'property_id',id:row.property_id}];
 }
 if (where.objectId) {
  const row=db.prepare('SELECT id,property_id FROM objects WHERE id=?').get(where.objectId);
  if (!row) throw Error('Objektet saknas.');
  return [{field:'object_id',id:row.id},{field:'property_id',id:row.property_id}];
 }
 if (where.propertyId) {
  if (!db.prepare('SELECT 1 FROM properties WHERE id=?').get(where.propertyId)) throw Error('Fastigheten saknas.');
  return [{field:'property_id',id:where.propertyId}];
 }
 throw Error('Ange fastighet, objekt eller avtal.');
};

function direct(db,field,id,role,at){
 return db.prepare(`SELECT * FROM stakeholder_assignments
 WHERE ${field}=? AND role_code=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>=?)
 ORDER BY is_primary DESC,id`).all(id,role,at,at);
}
// Resolves closest assignment per role. No inherited rows are written.
export function resolvedStakeholders(db, where, asOf) {
 const at=date(asOf),scope=parentScope(db,where),
 roles=['owner','owner_contact','coordinator','tenant','tenant_contact','asset_manager','project_manager','contractor','consultant','supplier','invoice_recipient'];
 const tenantAssignment=where.agreementId
  ? direct(db,'agreement_id',where.agreementId,'tenant',at).find(r=>r.assignment_mode==='assign')
  : null;
 const result={};
 for(const role of roles) {
  // A tenant has legal identity only on its own agreement.
  if(role==='tenant'&&!where.agreementId){result[role]=[];continue;}
  let selected=[];
  for(const s of scope) {
   if(role==='tenant'&&s.field!=='agreement_id')continue;
   if(['supplier','invoice_recipient'].includes(role)&&s.field!=='order_id')continue;
   if(['contractor','consultant'].includes(role)&&!['issue_id','order_id'].includes(s.field))continue;
   const rows=direct(db,s.field,s.id,role,at).filter(r=>
    role!=='tenant_contact'||!where.agreementId||r.assignment_mode==='block'||r.party_id===tenantAssignment?.party_id);
   if(!rows.length)continue;
   selected=rows.some(r=>r.assignment_mode==='block')?[]:rows.map(r=>({
    id:r.id,partyId:r.party_id,personId:r.person_id,
    roleCode:role,sourceLevel:s.field.replace('_id',''),
    inherited:s.field!==scope[0].field,shared:!!r.shared
   }));
   break;
  }
  result[role]=selected;
 }
 return result;
}

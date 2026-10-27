// Lokalblick v3 operational modules. Explicit allowlisted commands and read models.
const expenses=['heat','water','electricity','cooling','waste','other'];
const idDate=(v,date)=>v?date(v):null;
const c=(row,...keys)=>Object.fromEntries(keys.map(k=>[k,row[k]??null]));
const integral=(v,name)=>{if(v==null||v==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Ogiltigt '+name);return n;};
const money=(v,name,{negative=false}={})=>{const n=Number(v);if(v==null||v===''||!Number.isFinite(n)||(!negative&&n<0))throw Error('Ogiltigt '+name);return n;};
function pick(row,allowed,required=[]){
 if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!allowed.includes(k)))throw Error('Ogiltiga fält.');
 for(const x of required)if(!String(row[x]??'').trim())throw Error('Obligatoriskt fält: '+x);
 return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v===''?null:v]));
}
const ref=(lookup,table,id,name)=>{if(!id||!lookup(table,id))throw Error('Välj giltig '+name);return id};
const props=(lookup,row)=>{const ids=['property_id','object_id','agreement_id'].filter(k=>row[k]);
 if(ids.length!==1)throw Error('Välj exakt en hemvist: fastighet, objekt eller avtal.');
 if(row.property_id)ref(lookup,'properties',row.property_id,'fastighet');
 if(row.object_id)ref(lookup,'objects',row.object_id,'objekt');
 if(row.agreement_id)ref(lookup,'agreements',row.agreement_id,'avtal');
 return c(row,'property_id','object_id','agreement_id');
};
export function runModuleCommand(db,command,api){
 const {id,date,optional,nonneg,insert,update,lookup:rawLookup}=api,
 lookup=(table,key)=>rawLookup(db,table,key),p=command.fields||{},rowId=command.id;
 switch(command.action){
 case 'createIssue':{
  const r=pick(p,['title','description','property_id','object_id','agreement_id','kind','category','status','priority','estimated_cost','planned_from','planned_to','notes'],['title']);
  insert(db,'issues',{id:id(),...props(lookup,r),title:r.title,description:r.description||null,
   kind:r.kind||null,category:r.category||null,status:r.status||'open',priority:r.priority||'normal',
   estimated_cost:r.estimated_cost==null?null:nonneg(r.estimated_cost,'kostnad'),
   planned_from:idDate(r.planned_from,date),planned_to:idDate(r.planned_to,date),notes:r.notes||null});break;
 }
 case 'updateIssue':{
  const r=pick(p,['title','description','kind','category','status','priority','estimated_cost','ordered_cost','final_cost','planned_from','planned_to','notes','maintenance_completed_on','maintenance_result','value_increasing','standard_enhancing']);
  if(!lookup('issues',rowId))throw Error('Ärendet saknas.');
  for(const key of ['estimated_cost','ordered_cost','final_cost'])if(r[key]!=null)r[key]=nonneg(r[key],key);
  for(const key of ['planned_from','planned_to','maintenance_completed_on'])if(r[key]!=null)r[key]=date(r[key]);
  for(const key of ['value_increasing','standard_enhancing'])if(r[key]!=null)r[key]=Number(r[key])?1:0;
  update(db,'issues',rowId,r);break;
 }
 case 'createOrder':{
  const r=pick(p,['issue_id','title','amount','status','supplier','reference','delivery','ordered_by','ordered_at','owner_pays'],['issue_id','title']);
  ref(lookup,'issues',r.issue_id,'ärende');
  if(r.ordered_by)ref(lookup,'people',r.ordered_by,'beställare');
  insert(db,'orders',{id:id(),issue_id:r.issue_id,title:r.title,amount:r.amount==null?null:nonneg(r.amount,'beställningsbelopp'),
   status:r.status||'draft',supplier:r.supplier||null,reference:r.reference||null,delivery:r.delivery||null,
   ordered_by:r.ordered_by||null,ordered_at:idDate(r.ordered_at,date),owner_pays:r.owner_pays==null?null:(Number(r.owner_pays)?1:0)});break;
 }
 case 'updateOrder':{
  const r=pick(p,['title','amount','final_cost','status','supplier','reference','delivery','ordered_by','ordered_at','completed_at','payment_status','paid_at','invoice_comment','owner_pays']);
  if(r.ordered_by)ref(lookup,'people',r.ordered_by,'beställare');
  for(const key of ['amount','final_cost'])if(r[key]!=null)r[key]=nonneg(r[key],key);
  for(const key of ['ordered_at','completed_at','paid_at'])if(r[key]!=null)r[key]=date(r[key]);
  if(r.owner_pays!=null)r.owner_pays=Number(r.owner_pays)?1:0;
  update(db,'orders',rowId,r);break;
 }
 case 'createCost':{
  const r=pick(p,['property_id','category','name','annual_amount','valid_from','valid_to'],['property_id','category','name','annual_amount']);
  ref(lookup,'properties',r.property_id,'fastighet');
  insert(db,'recurring_costs',{id:id(),property_id:r.property_id,category:r.category,name:r.name,
   annual_amount:money(r.annual_amount,'planerad årskostnad'),valid_from:idDate(r.valid_from,date),valid_to:idDate(r.valid_to,date)});break;
 }
 case 'updateCost':{
  const r=pick(p,['category','name','annual_amount','valid_from','valid_to']);
  if(r.annual_amount!=null)r.annual_amount=money(r.annual_amount,'planerad årskostnad');
  for(const k of ['valid_from','valid_to'])if(r[k]!=null)r[k]=date(r[k]);
  update(db,'recurring_costs',rowId,r);break;
 }
 case 'addCostEvidence':{
  const r=pick(p,['cost_id','type','year','amount','selected','invoice_reference','invoice_date','valid_from','valid_to','document_url'],['cost_id','type','amount']);
  ref(lookup,'recurring_costs',r.cost_id,'kostnadspost');
  if(r.type==='annual'&&r.year==null)throw Error('Ange år för årsutfall.');
  if(r.type==='invoice'&&(!r.invoice_reference||!r.valid_from||!r.valid_to))throw Error('Faktura kräver referens och kostnadsperiod.');
  insert(db,'cost_evidence',{id:id(),cost_id:r.cost_id,type:r.type,
   year:integral(r.year,'år'),amount:money(r.amount,'fakturabelopp',{negative:true}),
   selected:r.selected===undefined?1:Number(r.selected)?1:0,
   invoice_reference:r.invoice_reference||null,invoice_date:idDate(r.invoice_date,date),
   valid_from:idDate(r.valid_from,date),valid_to:idDate(r.valid_to,date),document_url:r.document_url||null});break;
 }
 case 'createBudget':{
  const r=pick(p,['property_id','budget_year','scenario','version','notes'],['property_id','budget_year']);
  ref(lookup,'properties',r.property_id,'fastighet');
  insert(db,'budgets',{id:id(),property_id:r.property_id,budget_year:integral(r.budget_year,'budgetår'),
   scenario:r.scenario||'base',version:integral(r.version??1,'version'),notes:r.notes||null});break;
 }
 case 'addBudgetLine':{
  const r=pick(p,['budget_id','cost_id','issue_id','line_type','category','name','budget_amount','notes'],['budget_id','name','budget_amount','line_type']);
  const budget=ref(lookup,'budgets',r.budget_id,'budget');
  if(r.cost_id&&r.issue_id)throw Error('Välj kostnadspost eller ärende, inte båda.');
  if(r.cost_id){const cost=lookup('recurring_costs',r.cost_id);if(!cost||cost.property_id!==lookup('budgets',budget).property_id)throw Error('Kostnadsposten hör till en annan fastighet.');}
  if(r.issue_id)ref(lookup,'issues',r.issue_id,'ärende');
  insert(db,'budget_lines',{id:id(),budget_id:budget,cost_id:r.cost_id||null,issue_id:r.issue_id||null,
   line_type:r.line_type,category:r.category||null,name:r.name,budget_amount:money(r.budget_amount,'budgetbelopp',{negative:true}),notes:r.notes||null});break;
 }
 case 'updateBudgetLine':{
  const r=pick(p,['name','line_type','category','budget_amount','notes']);
  if(r.budget_amount!=null)r.budget_amount=money(r.budget_amount,'budgetbelopp',{negative:true});
  update(db,'budget_lines',rowId,r);break;
 }
 case 'setBudgetStatus':{
  const r=pick(p,['status'],['status']);if(!['draft','approved','locked'].includes(r.status))throw Error('Ogiltig budgetstatus.');
  const budget=lookup('budgets',rowId);if(!budget)throw Error('Budgeten saknas.');
  if(budget.status==='locked')throw Error('Låst budget får inte ändras.');
  update(db,'budgets',rowId,{status:r.status,locked_at:r.status==='locked'?new Date().toISOString():null});break;
 }
 case 'createSpace':{
  const r=pick(p,['property_id','object_id','name','floor','notes'],['name']);
  if(Boolean(r.property_id)===Boolean(r.object_id))throw Error('Välj fastighet eller objekt.');
  ref(lookup,r.property_id?'properties':'objects',r.property_id||r.object_id,'hemvist');
  insert(db,'spaces',{id:id(),...c(r,'property_id','object_id'),name:r.name,floor:r.floor||null,notes:r.notes||null});break;
 }
 case 'updateSpace':{
  const r=pick(p,['name','floor','notes']);update(db,'spaces',rowId,r);break;
 }
 case 'createPart':{
  const r=pick(p,['space_id','name','responsibility','kind','notes'],['space_id','name']);
  ref(lookup,'spaces',r.space_id,'utrymme');
  insert(db,'building_parts',{id:id(),space_id:r.space_id,name:r.name,responsibility:r.responsibility||null,kind:r.kind||null,notes:r.notes||null});break;
 }
 case 'updatePart':{
  const r=pick(p,['name','responsibility','kind','notes']);update(db,'building_parts',rowId,r);break;
 }
 case 'createInspection':{
  const r=pick(p,['property_id','object_id','inspected_on','inspector_id','notes'],[]);
  if(Boolean(r.property_id)===Boolean(r.object_id))throw Error('Välj fastighet eller objekt.');
  ref(lookup,r.property_id?'properties':'objects',r.property_id||r.object_id,'hemvist');
  if(r.inspector_id)ref(lookup,'people',r.inspector_id,'besiktningsperson');
  insert(db,'inspections',{id:id(),...c(r,'property_id','object_id'),inspected_on:idDate(r.inspected_on,date),
   inspector_id:r.inspector_id||null,status:'draft',notes:r.notes||null});break;
 }
 case 'addInspectionPoint':{
  const r=pick(p,['inspection_id','part_id','space_id','assessment','comment','last_action','photo_reference','issue_id'],['inspection_id']);
  const insp=lookup('inspections',r.inspection_id);
  if(!insp||insp.status==='completed')throw Error('Besiktningen saknas eller är avslutad.');
  if(Boolean(r.part_id)===Boolean(r.space_id))throw Error('Välj utrymme eller byggnadsdel.');
  const space=r.part_id?lookup('spaces',lookup('building_parts',r.part_id)?.space_id):lookup('spaces',r.space_id);
  if(!space)throw Error('Utrymme eller byggnadsdel saknas.');
  const propertyOf=id=>lookup('objects',id)?.property_id;
  const inspProperty=insp.property_id||propertyOf(insp.object_id);
  const spaceProperty=space.property_id||propertyOf(space.object_id);
  if(inspProperty!==spaceProperty||insp.object_id&&space.object_id!==insp.object_id)
   throw Error('Besiktningspunkten hör till en annan fastighet eller ett annat objekt.');
  if(r.issue_id)ref(lookup,'issues',r.issue_id,'ärende');
  insert(db,'inspection_points',{id:id(),inspection_id:insp.id,part_id:r.part_id||null,space_id:r.space_id||null,
   assessment:r.assessment||'unchecked',comment:r.comment||null,
   last_action:r.last_action||null,photo_reference:r.photo_reference||null,issue_id:r.issue_id||null});break;
 }
 case 'updateInspectionPoint':{
  const r=pick(p,['assessment','comment','last_action','photo_reference','issue_id']);
  if(r.issue_id)ref(lookup,'issues',r.issue_id,'ärende');
  update(db,'inspection_points',rowId,r);break;
 }
 case 'completeInspection':{
  const inspection=lookup('inspections',rowId);if(!inspection||inspection.status!=='draft')throw Error('Besiktningen kan inte avslutas.');
  if(!inspection.inspected_on)throw Error('Ange besiktningsdatum innan avslut.');
  update(db,'inspections',rowId,{status:'completed'});break;
 }
 default:return false;
 }
 return true;
}
const active=(r,at)=>(!r.valid_from||r.valid_from<=at)&&(!r.valid_to||r.valid_to>=at);
function propertyFor(db,row) {
 if(row.property_id)return row.property_id;
 const objectId=row.object_id|| (row.agreement_id?db.prepare('SELECT object_id FROM agreements WHERE id=?').get(row.agreement_id)?.object_id:null);
 return objectId?db.prepare('SELECT property_id FROM objects WHERE id=?').get(objectId)?.property_id:null;
}
function annualCost(db,cost,year){
 const rows=db.prepare('SELECT * FROM cost_evidence WHERE cost_id=?').all(cost.id);
 const annual=rows.find(r=>r.type==='annual'&&r.year===year&&r.selected===1);
 if(annual)return {amount:annual.amount,kind:'annual',complete:true};
 const yFrom=Date.UTC(year,0,1),yTo=Date.UTC(year+1,0,1),day=86400000;
 const invoices=rows.filter(r=>r.type==='invoice');
 const amount=invoices.reduce((sum,r)=>{
  const start=Date.parse(r.valid_from+'T00:00:00Z'),end=Date.parse(r.valid_to+'T00:00:00Z')+day;
  return sum+Math.max(0,Math.min(yTo,end)-Math.max(yFrom,start))/(end-start)*r.amount;
 },0);
 return {amount,kind:invoices.length?'invoices':'none',complete:false};
}
export function operationalSnapshot(db,at,{all}){
 const tables=['issues','orders','recurring_costs','cost_evidence','budgets','budget_lines','spaces','building_parts','inspections','inspection_points','object_links'];
 const map=Object.fromEntries(tables.map(t=>[t,all(db,t)]));
 const year=Number(at.slice(0,4));
 const costs=map.recurring_costs.map(r=>({
  ...r,propertyId:r.property_id,actual:annualCost(db,r,year),
  current:active(r,at),
 }));
 const budgets=map.budgets.map(b=>{
  const lines=map.budget_lines.filter(l=>l.budget_id===b.id);
  return {...b,lines,total:lines.reduce((s,l)=>s+l.budget_amount,0)};
 });
 const issues=map.issues.map(r=>({...r,resolved_property_id:propertyFor(db,r)}));
 const orders=map.orders.map(r=>({...r,property_id:issues.find(i=>i.id===r.issue_id)?.resolved_property_id}));
 const inspections=map.inspections.map(r=>({...r,points:map.inspection_points.filter(p=>p.inspection_id===r.id),resolved_property_id:propertyFor(db,r)}));
 const rentByAgreement=db.prepare('SELECT agreement_id,base_amount,type,valid_from,valid_to FROM agreement_items').all()
  .filter(r=>active(r,at)).reduce((map,r)=>{map[r.agreement_id]=(map[r.agreement_id]||0)+r.base_amount;return map;},{});
 const stats={
  budgetAmount:budgets.filter(b=>b.budget_year===year&&b.scenario==='base'&&b.status==='locked').reduce((s,b)=>s+b.total,0),
  annualPlannedCost:costs.filter(r=>r.current).reduce((s,r)=>s+r.annual_amount,0),
  annualActualCost:costs.reduce((s,r)=>s+r.actual.amount,0),
  annualRent:Object.values(rentByAgreement).reduce((s,v)=>s+v,0),
  openIssues:issues.filter(i=>i.status!=='done').length,
 };
 return {
  issues,orders,recurringCosts:costs,costEvidence:map.cost_evidence,budgets,budgetLines:map.budget_lines,
  spaces:map.spaces,buildingParts:map.building_parts,inspections,inspectionPoints:map.inspection_points,
  objectLinks:map.object_links,financialSummary:stats
 };
}

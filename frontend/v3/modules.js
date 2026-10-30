// Native UI modules for the full Lokalblick v3 schema. No legacy workspace bridge.
export const moreViews={
 overview:'Översikt',issues:'Ärenden',orders:'Beställningar',recurringCosts:'Fastighetskostnader',
 costEvidence:'Fakturor och årsutfall',budgets:'Budget',budgetLines:'Budgetposter',
 spaces:'Utrymmen',buildingParts:'Byggnadsdelar',inspections:'Besiktningar',inspectionPoints:'Besiktningspunkter',
 map:'Karta',datamodel:'Datamodell',sources:'Datakällor'
};
export const moreItems={
 overview:'översikt',issues:'ärende',orders:'beställning',recurringCosts:'kostnadspost',
 costEvidence:'kostnadsunderlag',budgets:'budget',budgetLines:'budgetpost',
 spaces:'utrymme',buildingParts:'byggnadsdel',inspections:'besiktning',inspectionPoints:'besiktningspunkt',
 map:'fastighet',datamodel:'tabell',sources:'källa'
};
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n==null?'–':new Intl.NumberFormat('sv-SE',{maximumFractionDigits:0}).format(n)+' kr';
const one=(snapshot,list,id)=>snapshot[list]?.find(r=>String(r.id)===String(id));
const propertyName=(s,id)=>one(s,'properties',id)?.name||'–';
const objectName=(s,id)=>one(s,'objects',id)?.object_number||'–';
const agreementName=(s,id)=>one(s,'agreements',id)?.agreement_number||'–';
const issueName=(s,id)=>one(s,'issues',id)?.title||'–';
const budgetName=(s,id)=>{const b=one(s,'budgets',id);return b?b.budget_year+' · '+propertyName(s,b.property_id):'–'};
const spaceName=(s,id)=>one(s,'spaces',id)?.name||'–';
const inspectionName=(s,id)=>{const b=one(s,'inspections',id);return b?b.inspected_on||'Besiktning utan datum':'–'};
const kind={heat:'Värme',water:'VA',electricity:'El',cooling:'Kyla',waste:'Avfall',other:'Övrigt',base:'Bashyra',addition:'Tillägg',tax:'Fastighetsskatt',annual:'Årsutfall',invoice:'Faktura',draft:'Utkast',approved:'Godkänd',locked:'Låst',completed:'Avslutad',open:'Öppen',ongoing:'Pågår',done:'Klart',defect:'Brist',urgent:'Akut',unchecked:'Ej bedömd',excellent:'Utmärkt',good:'Bra',ok:'OK'};
export function moreRecords(view,s){
 if(view==='overview')return [{id:'overview',name:'Portföljöversikt'}];
 if(view==='sources')return [{id:'sources',name:'Privat databas'}];
 if(view==='map')return s.properties;
 if(view==='datamodel')return s.schema?.map(t=>({...t,id:t.name}))||[];
 return s[view]||[];
}
export function moreItemName(view,r){
 switch(view){
 case 'overview':return 'Portföljöversikt';
 case 'sources':return 'Privat SQLite-databas';
 case 'map':return r.name;
 case 'datamodel':return r.name;
 case 'issues':return r.title;
 case 'orders':return r.title;
 case 'recurringCosts':return r.name;
 case 'costEvidence':return kind[r.type]||r.type;
 case 'budgets':return 'Budget '+r.budget_year+' · '+(r.scenario||'Grund');
 case 'budgetLines':return r.name;
 case 'spaces':return r.name;
 case 'buildingParts':return r.name;
 case 'inspections':return r.inspected_on||'Besiktning utan datum';
 case 'inspectionPoints':return kind[r.assessment]||r.assessment||'Besiktningspunkt';
 default:return r.id;
 }
}
export function moreSecondary(view,r,s){
 switch(view){
 case 'issues':return (kind[r.status]||r.status)+' · '+propertyName(s,r.resolved_property_id);
 case 'orders':return (r.issue_id?issueName(s,r.issue_id):r.object_id?objectName(s,r.object_id):propertyName(s,r.property_id))+' · '+money(r.amount);
 case 'recurringCosts':return propertyName(s,r.property_id)+' · '+money(r.annual_amount)+'/år';
 case 'costEvidence':return (r.invoice_reference||r.year||'')+' · '+money(r.amount);
 case 'budgets':return propertyName(s,r.property_id)+' · '+(kind[r.status]||r.status);
 case 'budgetLines':return budgetName(s,r.budget_id)+' · '+money(r.budget_amount);
 case 'spaces':return r.object_id?objectName(s,r.object_id):propertyName(s,r.property_id);
 case 'buildingParts':return spaceName(s,r.space_id);
 case 'inspections':return (kind[r.status]||r.status)+' · '+propertyName(s,r.resolved_property_id);
 case 'inspectionPoints':return inspectionName(s,r.inspection_id);
 case 'datamodel':return r.columns.length+' kolumner · '+r.references.length+' relationer';
 case 'map':return [r.address,r.city].filter(Boolean).join(', ')||'Adress saknas';
 case 'overview':return 'Ekonomi, ärenden, avtal och fastigheter';
 case 'sources':return 'Endast lokal SQLite · Datamodell v3';
 }
 return '';
}
const box=(name,value)=>'<div class="fact"><small>'+clean(name)+'</small><strong>'+clean(value??'–')+'</strong></div>';
const action=(mode,label,critical=false)=>'<button type="button" class="'+(critical?'primary':'secondary')+'" data-mode="'+clean(mode)+'">'+clean(label)+'</button>';
const timeline=(rows,render)=>'<div class="timeline">'+(rows.length?rows.map(render).join(''):'<span class="muted">Inga poster.</span>')+'</div>';
const item=(label,value)=>'<article><strong>'+clean(label)+'</strong><span>'+clean(value??'')+'</span></article>';
const stakeholderLabels={owner:'Fastighetsägare',owner_contact:'Fastighetsägarens kontakt',coordinator:'Lokalsamordnare',tenant:'Hyresgäst',tenant_contact:'Hyresgästens kontakt',asset_manager:'Förvaltare',project_manager:'Projektledare',contractor:'Entreprenör',consultant:'Konsult',supplier:'Leverantör',invoice_recipient:'Fakturamottagare'};
function stakeholderSection(record,s){
 const rows=Object.entries(record.stakeholders||{}).flatMap(([role,items])=>items.map(x=>({
  label:stakeholderLabels[role]||role,
  name:[one(s,'parties',x.partyId)?.name,one(s,'people',x.personId)?.name].filter(Boolean).join(' · '),
  origin:x.inherited?'Ärvt från '+x.sourceLevel:'Egen koppling'
 })));
 return '<h3>Parter och ansvar</h3>'+timeline(rows,x=>item(x.label+' · '+x.origin,x.name));
}
export function moreDetail(view,row,s){
 const sections=[];let actions=[],facts=[];
 switch(view){
 case 'overview':{
  const f=s.financialSummary||{};
  facts=[box('Planerade fastighetskostnader',money(f.annualPlannedCost)),box('Faktiska kostnader '+s.asOf.slice(0,4),money(f.annualActualCost)),
   box('Årlig avtalad bashyra och tillägg',money(f.annualRent)),box('Låsta grundbudgetar',money(f.budgetAmount)),
   box('Öppna ärenden',f.openIssues),box('Besiktningar',s.inspections.length)].join('');
  const active=s.issues.filter(i=>i.status!=='done').slice(0,12);
  sections.push('<h3>Aktuella ärenden</h3>'+timeline(active,r=>item(r.title,(kind[r.status]||r.status)+' · '+propertyName(s,r.resolved_property_id))));
  sections.push('<h3>Objekt per aktuellt datum</h3>'+timeline(s.objects.filter(o=>o.currentVersion).slice(0,12),o=>item(o.object_number,(o.currentVersion?.area??'–')+' m² · '+propertyName(s,o.property_id))));
  break;
 }
 case 'issues':
  actions=[action('edit','Redigera'),action('order','Ny beställning'),action('role','Koppla part/person')];
  facts=[box('Status',kind[row.status]||row.status),box('Prioritet',row.priority),box('Fastighet',propertyName(s,row.resolved_property_id)),box('Objekt',row.object_id?objectName(s,row.object_id):'–'),box('Avtal',row.agreement_id?agreementName(s,row.agreement_id):'–'),box('Beräknad kostnad',money(row.estimated_cost)),box('Slutkostnad',money(row.final_cost)),box('Tidplan',[(row.planned_from||'–'),(row.planned_to||'–')].join(' – '))].join('');
  sections.push('<h3>Beskrivning</h3><p class="muted">'+clean(row.description||row.notes||'Ingen beskrivning')+'</p>');
  sections.push('<h3>Beställningar</h3>'+timeline(s.orders.filter(o=>o.issue_id===row.id),o=>item(o.title,money(o.amount))));
  sections.push(stakeholderSection(row,s));
  break;
 case 'orders':
  actions=[action('edit','Redigera'),action('role','Koppla part/person')];
  facts=[box('Ärende',row.issue_id?issueName(s,row.issue_id):'–'),box('Objekt',row.object_id?objectName(s,row.object_id):'–'),box('Fastighet',propertyName(s,row.resolved_property_id)),box('Belopp',money(row.amount)),box('Slutkostnad',money(row.final_cost)),box('Leverantör',row.supplier),box('Status',kind[row.status]||row.status),box('Beställningsdatum',row.ordered_at),box('Betalstatus',row.payment_status)].join('');
  sections.push(stakeholderSection(row,s));
  break;
 case 'recurringCosts':
  actions=[action('edit','Redigera'),action('evidence','Registrera utfall/faktura')];
  facts=[box('Fastighet',propertyName(s,row.property_id)),box('Kategori',kind[row.category]||row.category),box('Planerad årskostnad',money(row.annual_amount)),box('Utfall '+s.asOf.slice(0,4),money(row.actual?.amount)),box('Utfallskälla',row.actual?.kind),box('Giltighet',[(row.valid_from||'–'),(row.valid_to||'Tills vidare')].join(' – '))].join('');
  sections.push('<h3>Fakturor och årsutfall</h3>'+timeline(s.costEvidence.filter(x=>x.cost_id===row.id),x=>item((kind[x.type]||x.type)+' '+(x.invoice_reference||x.year||''),money(x.amount))));
  break;
 case 'costEvidence':
  facts=[box('Kostnadspost',one(s,'recurringCosts',row.cost_id)?.name),box('Typ',kind[row.type]||row.type),box('År',row.year),box('Fakturanummer',row.invoice_reference),box('Belopp',money(row.amount)),box('Fakturadatum',row.invoice_date)].join('');break;
 case 'budgets':
  actions=row.status==='locked'?[]:[action('line','Lägg till budgetpost'),action('kpi','Ändra scenarioindex'),action('lock','Lås budget')];
  facts=[box('Fastighet',propertyName(s,row.property_id)),box('Budgetår',row.budget_year),box('Scenario',row.scenario),box('Version',row.version),box('Status',kind[row.status]||row.status),box('Budgetsumma',money(row.total)),box('Scenario-KPI oktober',row.scenario_index||'Ej angivet')].join('');
  sections.push('<h3>Budgetposter</h3>'+timeline(row.lines||[],x=>item(x.name,money(x.budget_amount))));
  break;
 case 'budgetLines':actions=[action('edit','Redigera')];facts=[box('Budget',budgetName(s,row.budget_id)),box('Kategorisering',row.category),box('Typ',row.line_type),box('Belopp',money(row.budget_amount))].join('');break;
 case 'spaces':actions=[action('edit','Redigera'),action('part','Lägg till byggnadsdel')];facts=[box('Hemvist',row.object_id?objectName(s,row.object_id):propertyName(s,row.property_id)),box('Våning',row.floor)].join('');sections.push('<h3>Byggnadsdelar</h3>'+timeline(s.buildingParts.filter(x=>x.space_id===row.id),r=>item(r.name,kind[r.responsibility]||r.responsibility)));break;
 case 'buildingParts':actions=[action('edit','Redigera')];facts=[box('Utrymme',spaceName(s,row.space_id)),box('Underhållsansvar',row.responsibility),box('Typ',row.kind)].join('');break;
 case 'inspections':
  if(row.status==='draft')actions=[action('point','Lägg till punkt'),action('complete','Avsluta besiktning')];
  facts=[box('Besiktningsdatum',row.inspected_on),box('Fastighet',propertyName(s,row.resolved_property_id)),box('Objekt',objectName(s,row.object_id)),box('Besiktningsperson',one(s,'people',row.inspector_id)?.name),box('Status',kind[row.status]||row.status),box('Antal punkter',row.points?.length)].join('');
  sections.push('<h3>Besiktningspunkter</h3>'+timeline(row.points||[],p=>item(one(s,'buildingParts',p.part_id)?.name||spaceName(s,p.space_id),kind[p.assessment]||p.assessment)));
  break;
 case 'inspectionPoints':
  if(one(s,'inspections',row.inspection_id)?.status==='draft')actions=[action('edit','Redigera')];
  facts=[box('Tillfälle',inspectionName(s,row.inspection_id)),box('Byggnadsdel',one(s,'buildingParts',row.part_id)?.name||spaceName(s,row.space_id)),box('Bedömning',kind[row.assessment]||row.assessment),box('Ärende',issueName(s,row.issue_id))].join('');
  sections.push('<h3>Kommentar</h3><p class="muted">'+clean(row.comment||'Ingen kommentar')+'</p>');break;
 case 'map':{
  actions=[];
  facts=[box('Fastighet',row.name),box('Adress',row.address),box('Ort',row.city),box('Latitud',row.latitude),box('Longitud',row.longitude)].join('');
  if(row.latitude!=null&&row.longitude!=null)sections.push('<p><a target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat='+encodeURIComponent(row.latitude)+'&mlon='+encodeURIComponent(row.longitude)+'#map=17/'+encodeURIComponent(row.latitude)+'/'+encodeURIComponent(row.longitude)+'">Visa läget i OpenStreetMap</a></p>');
  break;
 }
 case 'datamodel':{
  facts=[box('Tabell',row.name),box('Kolumner',row.columns.length),box('Främmande nycklar',row.references.length)].join('');
  sections.push('<h3>Kolumner</h3>'+timeline(row.columns,c=>item(c.name,c.type+(c.primary?' · PK':'')+(c.required?' · Krävs':''))));
  sections.push('<h3>Relationer</h3>'+timeline(row.references,c=>item(c.column,c.table+'.'+c.target)));break;
 }
 case 'sources':
  facts=[box('Lagring','Privat lokal SQLite'),box('Databasversion',3),box('Aktuell dag',s.asOf),box('Register',s.schema.length)].join('');
  sections.push('<h3>Data och säkerhet</h3><p class="muted">All verksamhetsdata läses och ändras via en lokal API-server på 127.0.0.1. Databasen finns utanför GitHub och Vercel. Exportera ett utdrag till en CSV-fil om du behöver kontrollera registren.</p><button type="button" class="secondary" data-export>Exportera register (CSV)</button>');break;
 default:return '';
 }
 const head='<div class="detail-header"><div><h2>'+clean(moreItemName(view,row))+'</h2><p class="muted">'+clean(moreSecondary(view,row,s))+'</p></div><div class="actions">'+actions.join('')+'</div></div>';
 return head+'<div class="details">'+facts+'</div>'+sections.join('');
}
const optionList=(arr)=>arr.map(o=>({id:o.id,label:o.label||o.name||o.id}));
export function moreFormSchema(view,mode,row,ctx){
 const {state,select,label,asOptions}=ctx,s=state.snapshot,p=row||{};
 const home=()=>[
  ...s.properties.map(r=>({id:'property:'+r.id,label:'Fastighet · '+r.name})),
  ...s.objects.map(r=>({id:'object:'+r.id,label:'Objekt · '+r.object_number})),
  ...s.agreements.map(r=>({id:'agreement:'+r.id,label:'Avtal · '+r.agreement_number}))
 ];
 const homeChoice=(allowed=['property','object','agreement'],v=p)=>['property_id','object_id','agreement_id'].map(k=>v[k]&&allowed.includes(k.replace('_id',''))?k.replace('_id','')+':'+v[k]:null).find(Boolean)||'';
 const convert=(r,source='home')=>{const [kind,id]=String(r[source]||'').split(':');delete r[source];if(kind==='property')r.property_id=id;else if(kind==='object')r.object_id=id;else if(kind==='agreement')r.agreement_id=id;else throw Error('Välj en giltig hemvist.');};
 const categoryItems=optionList(['heat','water','electricity','cooling','waste','other'].map(id=>({id,label:kind[id]})));
 const statuses=optionList(['open','ongoing','done'].map(id=>({id,label:kind[id]})));
 const today=state.asOf;
 if(mode==='role'&&['issues','orders'].includes(view)){
  const partyRoles=view==='issues'?['contractor','consultant','project_manager','coordinator']:['supplier','invoice_recipient','contractor','consultant','coordinator'];
  return {title:'Koppla part/person',action:'setRole',fixed:{[view==='issues'?'issue_id':'order_id']:p.id},fields:
    select('Roll','role_code',partyRoles.map(id=>({id,label:stakeholderLabels[id]})),partyRoles[0],true)+
    select('Part','party_id',asOptions('parties'),'',true)+
    select('Person (om rollen avser en person)','person_id',asOptions('people'))+
    label('Giltig från','valid_from',today,'date','required')+
    '<label class="checkbox"><input type="checkbox" name="shared" value="1"> Flera parter får ha samma roll</label>'+
    '<p class="hint">Entreprenör, konsult och leverantör kan kopplas direkt till parten. Kontakter och ansvariga personer måste tillhöra vald part. Andra nivåer ärvs utan att kopior sparas.</p>'};
 }
 if(view==='issues'){
  if(mode==='order')return {title:'Ny beställning',action:'createOrder',fixed:{issue_id:p.id},fields:label('Namn','title','','text','required')+label('Belopp, kr','amount','','number','min="0" step="any"')+label('Leverantör','supplier')+label('Beställningsdatum','ordered_at',today,'date')};
  if(mode==='create')return {title:'Nytt ärende',action:'createIssue',transform:convert,fields:select('Hemvist','home',home(),'',true)+label('Rubrik','title','','text','required')+label('Beskrivning','description')+select('Prioritet','priority',[{id:'low',label:'Låg'},{id:'normal',label:'Normal'},{id:'high',label:'Hög'}],'normal')+label('Uppskattad kostnad','estimated_cost','','number','min="0" step="any"')+label('Planerad start','planned_from','','date')};
  return {title:'Redigera ärende',action:'updateIssue',fields:label('Rubrik','title',p.title,'text','required')+label('Beskrivning','description',p.description)+select('Status','status',statuses,p.status,true)+label('Slutkostnad','final_cost',p.final_cost,'number','min="0" step="any"')+label('Planerad start','planned_from',p.planned_from,'date')+label('Planerat slut','planned_to',p.planned_to,'date')};
 }
 if(view==='orders')return {title:mode==='create'?'Ny beställning':'Redigera beställning',action:mode==='create'?'createOrder':'updateOrder',
  ...(mode==='create'?{transform:fields=>{const [target,id]=String(fields.orderHome||'').split(':');delete fields.orderHome;if(!['issue_id','object_id','property_id'].includes(target)||!id)throw Error('Välj giltig hemvist.');fields[target]=id;}}:{}),
  fields:(mode==='create'?select('Hemvist','orderHome',[
   ...s.issues.map(x=>({id:'issue_id:'+x.id,label:'Ärende · '+x.title})),
   ...s.objects.map(x=>({id:'object_id:'+x.id,label:'Objekt · '+x.object_number})),
   ...s.properties.map(x=>({id:'property_id:'+x.id,label:'Fastighet · '+x.name}))
  ],'',true):'')+
  label('Benämning','title',p.title,'text','required')+label('Belopp','amount',p.amount,'number','min="0" step="any"')+
  select('Status','status',[{id:'draft',label:'Utkast'},{id:'ordered',label:'Beställd'},{id:'done',label:'Klart'}],p.status||'draft')+label('Leverantör','supplier',p.supplier)+label('Slutkostnad','final_cost',p.final_cost,'number','min="0" step="any"')};
 if(view==='recurringCosts'){
  if(mode==='evidence')return {title:'Faktura eller årsutfall',action:'addCostEvidence',fixed:{cost_id:p.id},
   fields:select('Underlag','type',[{id:'annual',label:'Årsutfall'},{id:'invoice',label:'Faktura'}],'annual',true)+
   label('År (årsutfall)','year',today.slice(0,4),'number','min="1900" max="9999"')+label('Belopp, kr','amount','','number','required step="any"')+
   label('Fakturareferens','invoice_reference')+label('Fakturadatum','invoice_date','','date')+
   label('Period från','valid_from','','date')+label('Period till','valid_to','','date')};
  if(mode==='create')return {title:'Ny fastighetskostnad',action:'createCost',
   fields:select('Fastighet','property_id',asOptions('properties'),'',true)+select('Kategori','category',categoryItems,'heat',true)+
   label('Benämning','name','','text','required')+label('Planerad årskostnad','annual_amount','','number','required min="0" step="any"')+label('Giltig från','valid_from','','date')};
  return {title:'Redigera fastighetskostnad',action:'updateCost',fields:select('Kategori','category',categoryItems,p.category,true)+
   label('Benämning','name',p.name,'text','required')+label('Planerad årskostnad','annual_amount',p.annual_amount,'number','required min="0" step="any"')+
   label('Giltig till','valid_to',p.valid_to,'date')};
 }
 if(view==='budgets'){
  if(mode==='kpi')return {title:'Budgetscenario · oktober-KPI',action:'setBudgetScenario',
   fields:label('Prognos KPI oktober '+(Number(p.budget_year)-1)+' (1980=100)','scenario_index',p.scenario_index,'number','min="0.01" step="any"')+
   '<p class="hint">Scenarioindex är din manuella prognos. Publicerade SCB-tal påverkas inte och budgeten kan låsas separat.</p>'};
  if(mode==='line'){
   const costOptions=s.recurringCosts.filter(x=>x.property_id===p.property_id).map(x=>({id:x.id,label:x.name}));
   return {title:'Ny budgetpost',action:'addBudgetLine',fixed:{budget_id:p.id},
    fields:select('Kategori','line_type',[{id:'revenue',label:'Intäkt'},{id:'operating',label:'Drift'},{id:'investment',label:'Investering'},{id:'other',label:'Övrigt'}],'operating',true)+
    label('Benämning','name','','text','required')+label('Budgetbelopp, kr','budget_amount','','number','step="any" required')+
    select('Kopplad kostnadspost','cost_id',costOptions)+label('Notering','notes')};
  }
  if(mode==='lock')return {title:'Bekräfta låsning av budget',action:'setBudgetStatus',fixed:{status:'locked'},
   fields:'<p class="hint">En låst budget och dess poster går inte längre att ändra. Vill du låsa budget '+clean(p.budget_year)+'?</p>'};
  return {title:'Ny budget',action:'createBudget',fields:select('Fastighet','property_id',asOptions('properties'),'',true)+
   label('Budgetår','budget_year',today.slice(0,4),'number','min="1900" required')+label('Scenario','scenario','base')+
   label('Version','version',1,'number','min="1" required')+
   label('Scenario-KPI oktober (valfritt)','scenario_index','','number','min="0.01" step="any"')};
 }
 if(view==='budgetLines')return {title:'Redigera budgetpost',action:'updateBudgetLine',
  fields:label('Benämning','name',p.name,'text','required')+label('Belopp','budget_amount',p.budget_amount,'number','step="any" required')+
   label('Kategori','category',p.category)+label('Notering','notes',p.notes)};
 if(view==='spaces'){
  if(mode==='part')return {title:'Ny byggnadsdel',action:'createPart',fixed:{space_id:p.id},
   fields:label('Namn','name','','text','required')+label('Typ','kind')+
   select('Underhållsansvar','responsibility',[{id:'owner',label:'Fastighetsägaren'},{id:'tenant',label:'Hyresgästen'}])};
  if(mode==='create')return {title:'Nytt utrymme',action:'createSpace',transform:r=>convert(r),
   fields:select('Fastighet eller objekt','home',home().filter(x=>!x.id.startsWith('agreement:')),'',true)+
   label('Namn','name','','text','required')+label('Våning','floor')};
  return {title:'Redigera utrymme',action:'updateSpace',fields:label('Namn','name',p.name,'text','required')+label('Våning','floor',p.floor)+label('Notering','notes',p.notes)};
 }
 if(view==='buildingParts'){
  if(mode==='create')return {title:'Ny byggnadsdel',action:'createPart',fields:select('Utrymme','space_id',asOptions('spaces'),'',true)+
    label('Namn','name','','text','required')+label('Typ','kind')};
  return {title:'Redigera byggnadsdel',action:'updatePart',fields:label('Namn','name',p.name,'text','required')+label('Typ','kind',p.kind)};
 }
 if(view==='inspections'){
  if(mode==='point'){
   const possibleParts=s.buildingParts.filter(b=>s.spaces.some(space=>space.id===b.space_id&&
      (p.object_id?space.object_id===p.object_id:space.property_id===p.property_id)));
   const possibleSpaces=s.spaces.filter(space=>p.object_id?space.object_id===p.object_id:space.property_id===p.property_id);
   const targets=[...possibleSpaces.map(x=>({id:'space:'+x.id,label:'Utrymme · '+x.name})),
    ...possibleParts.map(x=>({id:'part:'+x.id,label:'Del · '+x.name}))];
   return {title:'Ny besiktningspunkt',action:'addInspectionPoint',fixed:{inspection_id:p.id},
    transform:row=>{const [type,id]=String(row.target||'').split(':');delete row.target;if(type==='part')row.part_id=id;else if(type==='space')row.space_id=id;else throw Error('Välj byggnadsdel eller utrymme.');},
    fields:select('Utrymme / byggnadsdel','target',targets,'',true)+
    select('Bedömning','assessment',Object.entries({unchecked:'Ej bedömd',excellent:'5 · Utmärkt',good:'4 · Bra',ok:'3 · OK',defect:'2 · Brist',urgent:'1 · Akut'}).map(([id,label])=>({id,label})),'unchecked',true)+
    label('Kommentar','comment')};
  }
  if(mode==='complete')return {title:'Avsluta besiktning',action:'completeInspection',fields:'<p class="hint">En avslutad besiktning låses. Äldre bedömningar bevaras.</p>'};
  return {title:'Nytt besiktningstillfälle',action:'createInspection',transform:r=>convert(r),
   fields:select('Fastighet / objekt','home',home().filter(x=>!x.id.startsWith('agreement:')),'',true)+
   label('Besiktningsdatum','inspected_on',today,'date','required')+
   select('Besiktningsperson','inspector_id',asOptions('people'))+label('Noteringar','notes')};
 }
 if(view==='inspectionPoints')return {title:'Redigera besiktningspunkt',action:'updateInspectionPoint',fields:
  select('Bedömning','assessment',Object.entries({unchecked:'Ej bedömd',excellent:'5 · Utmärkt',good:'4 · Bra',ok:'3 · OK',defect:'2 · Brist',urgent:'1 · Akut'}).map(([id,label])=>({id,label})),p.assessment,true)+
  label('Kommentar','comment',p.comment)+select('Skapa/länka ärende','issue_id',s.issues.map(x=>({id:x.id,label:x.title})),p.issue_id)};
 return null;
}

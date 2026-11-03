// Native Lokalblick v3. All persisted facts use the private SQLite API.
import {moreViews,moreItems,moreRecords,moreItemName,moreSecondary,moreDetail,moreFormSchema} from './modules.js';
import {mountPropertyImport} from './property-import-ui.js';
import {mountSmartImport} from './smart-import-ui.js';
import {relatedRecords,assignmentHistory,isVisibleAt} from './relations.js';
import {mountPropertyMap} from './map.js';
import {mountBudgetIndex} from './budget-index.js';
import {nextObjectNumber,nextAgreementNumber} from './numbering.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viewNames={properties:'Fastigheter',objects:'Objekt',agreements:'Avtal',parties:'Parter',people:'Personer',...moreViews};
const itemNames={properties:'fastighet',objects:'objekt',agreements:'avtal',parties:'part',people:'person',...moreItems};
const dateToday=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'});
const roles={owner:'Fastighetsägare',owner_contact:'Fastighetsägarens kontakt',coordinator:'Lokalsamordnare',tenant:'Hyresgäst',tenant_contact:'Hyresgästens kontakt',asset_manager:'Förvaltare',project_manager:'Projektledare',contractor:'Entreprenör',consultant:'Konsult',supplier:'Leverantör',invoice_recipient:'Fakturamottagare'};
const state={view:'overview',id:'overview',snapshot:null,asOf:dateToday,mode:null,search:'',rentEditId:null,showHistory:false,importSession:{book:[],selected:[],fileName:'',stage:'properties',propertiesDone:false,objectsDone:false,objectLinks:{}}};
const registerItems=()=>state.snapshot?moreRecords(state.view,state.snapshot).filter(r=>isVisibleAt(state.view,r,state.asOf,state.showHistory)):[];
$('#as-of').value=state.asOf;
async function api(body=null){
 const url='/api/v3/core'+(body?'':'?date='+encodeURIComponent(state.asOf));
 const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Kunde inte läsa databasen.');return result;
}
const notify=(message,error=false)=>{const el=$('#feedback');el.textContent=message;el.classList.toggle('error',error)};
const matches=(row,query)=>JSON.stringify(row).toLocaleLowerCase('sv').includes(query);
const itemName=(view,row)=>view==='properties'?row.name:view==='objects'?row.object_number:view==='agreements'?row.agreement_number:view==='parties'||view==='people'?row.name:moreItemName(view,row);
const secondary=(view,row)=>view==='properties'?[row.management_object_number?'FörvaltningsNr '+row.management_object_number:'FörvaltningsNr saknas',row.address,...(row.externalNumbers||[]).map(n=>n.source_system+': '+n.external_number)].filter(Boolean).join(' · '):view==='objects'?(row.currentVersion?.area??'–')+' m² · '+(state.snapshot.properties.find(p=>p.id===row.property_id)?.name||''):view==='agreements'?'Start '+(row.currentVersion?.valid_from||row.original_start_on||'–'):view==='people'?row.email||'Ingen e-post':view==='parties'?row.organization_number||'Ingen organisationsnummer':moreSecondary(view,row,state.snapshot);
const selected=()=>registerItems().find(x=>x.id===state.id);
const label=(caption,field,value='',type='text',extra='')=>'<label>'+esc(caption)+'<input name="'+esc(field)+'" type="'+esc(type)+'" value="'+esc(value??'')+'" '+extra+'></label>';
const select=(caption,field,items,value='',required=false)=>'<label>'+esc(caption)+'<select name="'+esc(field)+'" '+(required?'required':'')+'><option value="">Välj…</option>'+items.map(x=>'<option value="'+esc(x.id)+'" '+(String(x.id)===String(value)?'selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select></label>';
const asOptions=(type)=>state.snapshot[type].map(x=>({id:x.id,label:itemName(type,x)}));
const fact=(title,value)=>'<div class="fact"><small>'+esc(title)+'</small><strong>'+esc(value??'–')+'</strong></div>';
const formatMoney=n=>n==null?'–':new Intl.NumberFormat('sv-SE').format(n)+' kr';
function renderRoles(rows){
 if(!rows)return '';
 const entries=Object.entries(rows).flatMap(([key,list])=>list.map(person=>({key,...person})));
 return '<h3>Parter, personer och ansvar</h3><div class="people-roles">'+(entries.map(a=>{
 const party=state.snapshot.parties.find(p=>p.id===a.partyId)?.name||'';
 const person=state.snapshot.people.find(p=>p.id===a.personId)?.name||'';
 return '<article><div><strong>'+esc(roles[a.key]||a.key)+'</strong><div class="muted">'+esc([party,person].filter(Boolean).join(' · '))+'</div></div><span class="tag">'+(a.inherited?'Ärvt från '+esc(a.sourceLevel):'Egen koppling')+'</span></article>';
 }).join('')||'<div class="muted">Inga aktiva rollkopplingar för valt datum.</div>')+'</div>';
}
function renderList(){
 const list=registerItems(),query=state.search.toLocaleLowerCase('sv').trim();
 $('#heading').textContent=viewNames[state.view];$('#list-heading').textContent=viewNames[state.view];
 $('#new-record').textContent='+ Lägg till '+itemNames[state.view];
 $('#new-record').hidden=['overview','map','datamodel','sources','costEvidence','budgetLines','inspectionPoints'].includes(state.view);
 const visible=list.filter(r=>!query||matches(r,query));
 $('#record-list').innerHTML=visible.map(row=>'<button type="button" class="record-row" data-id="'+esc(row.id)+'" aria-selected="'+(state.id===row.id)+'"><span><strong>'+esc(itemName(state.view,row))+'</strong><small>'+esc(secondary(state.view,row))+'</small></span><span class="chevron" aria-hidden="true">›</span></button>').join('')||'<div class="empty">Inga poster i valt urval.</div>';
 $('#list-count').textContent=visible.length===list.length?String(visible.length):visible.length+' av '+list.length;
 const historyBtn=$('#toggle-history');
 historyBtn.hidden=!['objects','agreements'].includes(state.view);
 historyBtn.setAttribute('aria-pressed',String(state.showHistory));
 historyBtn.textContent=state.showHistory?'Visa aktuella':'Visa historik';
 $('#stats').innerHTML=[
  ['Fastigheter',state.snapshot.properties.length],['Objekt',state.snapshot.objects.length],
  ['Avtal',state.snapshot.agreements.length],['Parter',state.snapshot.parties.length],['Personer',state.snapshot.people.length]
 ].map(([k,n])=>'<div class="stat"><strong>'+n+'</strong><span>'+k+'</span></div>').join('');
}
function annualSettlementHtml(rows,asOf){
 if(!rows.length)return '';
 const category={heat:'Värme',water:'VA',electricity:'El',cooling:'Kyla',waste:'Avfall'};
 return '<h3>Avräkning av tillägg · '+esc(asOf.slice(0,4))+'</h3>'+
  '<p class="muted">Periodiseras till hyresavtalets och tilläggets gemensamma dagar. Underlag, inte automatisk faktura. Kontrollera faktiskt debiterat belopp.</p>'+
  '<div class="timeline">'+rows.map(r=>{
   const name=category[r.category]||r.category;
   if(r.status==='included')return '<article><strong>'+esc(name)+'</strong><span>Ingår i hyran · inget separat tillägg, ingen avräkning</span></article>';
   if(r.status!=='ready')return '<article><strong>'+esc(name)+'</strong><span>Kräver kontroll · '+esc(r.reason||'Ofullständiga uppgifter')+'</span></article>';
   const status=r.difference>0?'Efterdebitering '+formatMoney(r.difference):
    r.difference<0?'Tillgodo '+formatMoney(-r.difference):'Ingen differens';
   return '<article><strong>'+esc(name)+' · '+esc(status)+'</strong><span>'+
    esc(r.tenancyFrom+' – '+r.tenancyTo+' · '+r.reconciliationDays+' av '+r.yearDays+' avräkningsdagar')+' · '+esc(r.area+' / '+r.totalArea+' m² ('+r.share+' %)')+' · Andel '+esc(formatMoney(r.allocatedCost))+
    ' · Periodiserat tillägg '+esc(formatMoney(r.annualSupplement))+'</span></article>';
  }).join('')+'</div>';
}
function renderDetail(){
 const row=selected(),panel=$('#detail');
 if(state.view==='map'){
  panel.innerHTML='<div id="map-panel" class="map-shell"></div>'+(row?moreDetail('map',row,state.snapshot):'');
  mountPropertyMap($('#map-panel'),state.snapshot,{navigate,notify});
  return;
 }
 if(!row){panel.innerHTML='<div class="empty">Välj en post för att visa dess data, kontaktpersoner och historiska versioner.</div>';return;}
 if(Object.hasOwn(moreViews,state.view)){
  panel.innerHTML=moreDetail(state.view,row,state.snapshot)+relatedRecords(state.view,row,state.snapshot);
  if(state.view==='budgets')mountBudgetIndex(panel,row,state.snapshot);
  if(state.view==='sources'){
   mountPropertyImport(panel,{
    snapshot:state.snapshot,session:state.importSession,
    apply:async commands=>{
     // Reuse the current workbook; refresh the snapshot after each successful batch.
     state.snapshot=await api({version:state.snapshot.version,asOf:state.asOf,commands});
    },
    onSaved:outcome=>{
     const session=state.importSession;
     if(outcome.stage==='properties'){
      session.propertiesDone=true;session.stage='choose-objects';session.propertyResult=outcome;
     }else if(outcome.stage==='objects'){
      session.objectsDone=true;session.stage='objects-done';session.objectResult=outcome;
      Object.assign(session.objectLinks,outcome.objectLinks||{});
     }
     render();
     notify(outcome.saved+' säkra '+(outcome.stage==='objects'?'objekt':'fastighets')+
      'ändringar importerade.'+(outcome.failed.length?' '+outcome.failed.length+' behöver kontrolleras.':''));
    }
   });
   // The previous import remains accessible while the guided remaining steps
   // are built and their existing test contracts remain intact.
   const legacy=document.createElement('details');legacy.className='import-compat';
   legacy.innerHTML='<summary data-old-import-toggle>Tidigare importflöde (avancerat)</summary><div data-old-import-container></div>';
   panel.append(legacy);
   mountSmartImport(legacy.querySelector('[data-old-import-container]'),{snapshot:state.snapshot,apply:async commands=>{
    state.snapshot=await api({version:state.snapshot.version,asOf:state.asOf,commands});
    render();notify(commands.length+' åtgärder importerade till v3.');
   }});
  }
  return;
 }
 let actions='<button type="button" class="secondary" data-mode="edit">Redigera</button>';
 let facts='',history='';
 if(state.view==='properties'){
  facts=[fact('FörvaltningsNr',row.management_object_number),fact('Adress',[row.address,row.city].filter(Boolean).join(', ')),fact('Ägare',row.stakeholders.owner.map(r=>state.snapshot.parties.find(p=>p.id===r.partyId)?.name).join(', ')||'–')].join('');
  actions+='<button class="primary" type="button" data-create-child="objects" data-parent-id="'+esc(row.id)+'">+ Nytt objekt</button>';
  actions+='<button class="secondary" type="button" data-mode="externalNumber">+ Externt nummer</button>';
  actions+='<button class="secondary" type="button" data-mode="role">Koppla part/person</button>';
  history='<h3>Externa fastighetsnummer</h3><div class="timeline">'+((row.externalNumbers||[]).map(n=>
   '<article><div><strong>'+esc(n.external_number)+'</strong><span> · '+esc(n.source_system)+'</span></div>'+
   '<button class="secondary" type="button" data-remove-external-number="'+esc(n.id)+'">Ta bort</button></article>').join('')||
   '<span class="muted">Inga externa nummer kopplade ännu.</span>')+'</div>';
  if(row.address&&row.city)actions+='<button class="secondary" type="button" data-geocode>Hitta position</button>';
  history+=annualSettlementHtml((state.snapshot.costReconciliations||[]).filter(x=>x.propertyId===row.id),state.asOf);
 } else if(state.view==='objects'){
  const v=row.currentVersion;
  facts=[fact('Objektsnummer',row.object_number),fact('Fastighet',state.snapshot.properties.find(p=>p.id===row.property_id)?.name),fact('Gällande area',v?.area==null?'Ingen gällande version':v.area+' m²'),fact('Startdatum version',v?.valid_from),fact('Avslutad',row.ended_on||'Nej')].join('');
  actions='<button class="primary" type="button" data-create-child="agreements" data-parent-id="'+esc(row.id)+'">+ Nytt avtal</button><button class="secondary" type="button" data-mode="revise">Ny objektversion</button><button class="secondary" type="button" data-mode="role">Koppla part/person</button><button class="secondary" type="button" data-mode="end">Avsluta objekt</button>';
  history='<h3>Objekthistorik · '+row.versions.length+' versioner</h3><div class="timeline">'+row.versions.map(v=>'<article><strong>'+esc(v.valid_from)+'</strong><span>'+esc(v.area??'–')+' m² · '+esc(v.category||'Objekt')+'</span></article>').join('')+'</div>';
 } else if(state.view==='agreements'){
  const v=row.currentVersion,tenant=row.stakeholders.tenant[0];
  const object=state.snapshot.objects.find(o=>o.id===row.object_id);
  const rentLines=(state.snapshot.rentCalculations||[]).filter(i=>i.agreement_id===row.id);
  const nominal=rentLines.reduce((sum,i)=>sum+(i.nominal||0),0);
  const unresolved=rentLines.filter(i=>i.amount===null).length;
  const adjusted=rentLines.reduce((sum,i)=>sum+(i.amount||0),0);
  const area=object?.currentVersion?.area;
  facts=[fact('Avtalsnummer',row.agreement_number),fact('Objekt',object?.object_number),
   fact('Hyresgäst',state.snapshot.parties.find(p=>p.id===tenant?.partyId)?.name),
   fact('Avtalsstart',v?.valid_from),fact('Avtalsslut',v?.legal_end_on||'Tills vidare'),
   fact('Användning',v?.usage),
   fact('Nominell årshyresnivå',rentLines.length?formatMoney(nominal):'Ej aktiv hyrespost'),
   fact('Nominell hyra kr/m²',rentLines.length&&area>0?new Intl.NumberFormat('sv-SE',{maximumFractionDigits:0}).format(nominal/area)+' kr/m²':'–'),
   fact('Uppräknad årsnivå',unresolved?'Kräver kontroll av '+unresolved+' post(er)':rentLines.length?formatMoney(adjusted):'–')].join('');
  actions='<button class="secondary" type="button" data-mode="revise">Ny avtalsversion</button><button class="secondary" type="button" data-mode="role">Koppla part/person</button><button class="secondary" type="button" data-mode="rent">Hyra / tillägg</button>';
  history='<h3>Avtalsversioner</h3><div class="timeline">'+row.versions.map(v=>'<article><strong>'+esc(v.valid_from)+'</strong><span>'+esc(v.legal_end_on||'Tills vidare')+'</span></article>').join('')+'</div>';
  const rents=state.snapshot.agreementItems.filter(i=>i.agreement_id===row.id);
  history+=annualSettlementHtml((state.snapshot.costReconciliations||[]).filter(x=>x.agreementId===row.id),state.asOf);
  history+='<h3>Hyra och tillägg · grundbelopp före uppräkning</h3><div class="timeline">'+(rents.map(i=>'<article><strong>'+esc(i.name)+' · '+esc(formatMoney(i.base_amount))+'</strong><span>'+esc(i.valid_from||'Utan start')+' – '+esc(i.valid_to||'Tills vidare')+(i.valid_to?' · Avslutad':' <button type="button" class="secondary" data-edit-rent="'+esc(i.id)+'">Ny hyresperiod</button> <button type="button" class="secondary" data-close-rent="'+esc(i.id)+'">Avsluta post</button>')+'</span></article>').join('')||'<span class="muted">Inga hyresposter.</span>')+'</div>';
 } else if(state.view==='parties'){
  facts=[fact('Namn',row.name),fact('Organisationsnummer',row.organization_number),fact('Typ',row.kind)].join('');
  actions+='<button class="secondary" type="button" data-mode="link">Koppla person</button>';
  history='<h3>Personer som företräder parten</h3><div class="timeline">'+state.snapshot.partyPeople.filter(x=>x.party_id===row.id).map(x=>'<article><strong>'+esc(state.snapshot.people.find(p=>p.id===x.person_id)?.name||'Person')+'</strong><span>'+esc(x.valid_from)+' – '+esc(x.valid_to||'')+'</span></article>').join('')+'</div>';
  const partLinks=(state.snapshot.stakeholderAssignments||[]).filter(x=>x.party_id===row.id);
  const targetName=x=>x.property_id?state.snapshot.properties.find(p=>p.id===x.property_id)?.name:x.object_id?state.snapshot.objects.find(o=>o.id===x.object_id)?.object_number:x.agreement_id?state.snapshot.agreements.find(a=>a.id===x.agreement_id)?.agreement_number:x.issue_id?state.snapshot.issues.find(a=>a.id===x.issue_id)?.title:x.order_id?state.snapshot.orders.find(o=>o.id===x.order_id)?.title:'';
  history+='<h3>Partens kopplingar ('+partLinks.length+')</h3><div class="timeline">'+(partLinks.map(x=>'<article><strong>'+esc(roles[x.role_code]||x.role_code)+'</strong><span>'+esc(targetName(x)||'Okänd hemvist')+' · '+esc(x.valid_from)+' – '+esc(x.valid_to||'Tills vidare')+'</span></article>').join('')||'<p class="muted">Inga direkta kopplingar ännu.</p>')+'</div>';
 } else {
  facts=[fact('Namn',row.name),fact('E-post',row.email),fact('Telefon',row.phone)].join('');
  actions+='<button class="secondary" type="button" data-mode="link">Koppla part</button>';
  history='<h3>Parttillhörighet</h3><div class="timeline">'+state.snapshot.partyPeople.filter(x=>x.person_id===row.id).map(x=>'<article><strong>'+esc(state.snapshot.parties.find(p=>p.id===x.party_id)?.name||'Part')+'</strong><span>'+esc(x.valid_from)+' – '+esc(x.valid_to||'')+'</span></article>').join('')+'</div>';
 }
 const heading=itemName(state.view,row);
 panel.innerHTML='<div class="detail-header"><div><h2>'+esc(heading)+'</h2><p class="muted">Registerpost · '+esc(state.view)+'</p></div><div class="actions">'+actions+'</div></div><div class="details">'+facts+'</div>'+history+(row.stakeholders?renderRoles(row.stakeholders):'')+assignmentHistory(state.view,row,state.snapshot)+relatedRecords(state.view,row,state.snapshot);
}
function render(){
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false'));
 renderList();renderDetail();
}
function navigate(view,id=null){
 if(!viewNames[view]||!state.snapshot)return;
 state.view=view;state.id=id;state.search='';$('#filter').value='';
 if(id&&!registerItems().some(r=>r.id===id)&&['objects','agreements'].includes(view))state.showHistory=true;
 if(!id&&['overview','sources','datamodel'].includes(view))state.id=registerItems()[0]?.id||null;
 render();
}
async function geocodeSelectedProperty(){
 const property=selected();
 if(state.view!=='properties'||!property?.address||!property.city)throw Error('Fastigheten behöver adress och ort.');
 if(!window.confirm('Vill du söka position för '+property.name+'? Adress och ort skickas till den konfigurerade geokodningstjänsten.'))return;
 const response=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({properties:[{
  id:property.id,address:property.address,city:property.city,latitude:null,longitude:null
 }]})});
 const payload=await response.json();if(!response.ok)throw Error(payload.error||'Geokodningen misslyckades.');
 const found=payload.results?.find(r=>r.id===property.id);
 if(found?.status!=='matched'||!Number.isFinite(found.latitude)||!Number.isFinite(found.longitude))
  throw Error('Ingen entydig adressmatchning hittades. Ange koordinaterna manuellt.');
 if(!window.confirm('Föreslagen position: '+found.displayName+' ('+found.latitude.toFixed(5)+', '+found.longitude.toFixed(5)+'). Spara på fastigheten?'))return;
 state.snapshot=await api({version:state.snapshot.version,asOf:state.asOf,command:{action:'updateProperty',id:property.id,
  fields:{latitude:found.latitude,longitude:found.longitude}}});
 render();notify('Position sparad på fastigheten.');
}
function formSchema(mode,row,view=state.view,parentId=null){
 const v=view,r=row||{},a=state.snapshot;
 if(v==='agreements'&&(mode==='editRent'||mode==='endRent')){
  const item=a.agreementItems.find(i=>i.id===state.rentEditId);
  if(!item)throw Error('Hyresposten saknas.');
  if(item.valid_to)throw Error('Hyresperioden är redan avslutad.');
  if(mode==='endRent')return {title:'Avsluta hyrespost',action:'updateAgreementItem',id:item.id,
   fields:label('Giltig till','valid_to',state.asOf,'date','required')+
    '<p class="hint">Endast slutdatum ändras. Historiska villkor bevaras.</p>'};
  return {title:'Ny hyresperiod',action:'reviseAgreementItem',id:item.id,
   fields:label('Ny period från','valid_from',state.asOf,'date','required')+
   label('Benämning','name',item.name,'text','required')+
   label('Grundbelopp per år, kr','base_amount',item.base_amount,'number','required min="0" step="any"')+
   select('Uppräkning','adjustment_method',[{id:'none',label:'Ingen'},{id:'kpi',label:'KPI'},{id:'fixed',label:'Fast årlig procent'},{id:'kpi-limited',label:'KPI min/max'}],item.adjustment_method||'none')+
   label('Basår · första hyresår','base_year',item.base_year,'number','min="1900"')+
   label('KPI-bastal · oktober före basåret','base_index',item.base_index,'number','min="0" step="any"')+
   label('Indexandel (0–1)','index_share',item.index_share,'number','min="0" max="1" step="any"')+
   label('Årlig uppräkning, %','annual_percent',item.annual_percent,'number','step="any"')+
   label('Garanterad minsta årlig höjning, %','min_percent',item.min_percent,'number','min="0" step="any"')+
   label('Högsta årlig höjning, %','max_percent',item.max_percent,'number','min="0" step="any"')+
   select('Grundbelopp som golv','floor',[{id:'1',label:'Ja – minst grundbeloppet'},{id:'0',label:'Nej – sänkning tillåts'}],String(item.floor??1))+
   '<p class="hint">Garanterad minsta höjning gäller varje år även vid oförändrat eller fallande KPI. Max begränsar varje års höjning. Båda utgår från föregående års hyra. Föregående period bevaras.</p>'};
 }
 if(Object.hasOwn(moreViews,v)){
  const spec=moreFormSchema(v,mode,row,{state,select,label,asOptions});
  if(spec)return spec;
  throw Error('Den här funktionen öppnas från sin överordnade registerpost.');
 }
 if(mode==='role'){
  const entity={properties:'property_id',objects:'object_id',agreements:'agreement_id'}[v];
  if(!entity)throw Error('Välj en fastighet, ett objekt eller ett avtal.');
  const roleOptions=Object.entries(roles).map(([id,label])=>({id,label}));
  const defaultRole=v==='agreements'?'tenant':'coordinator';
  return {title:'Ny rollkoppling',action:'setRole',fixed:{[entity]:r.id},fields:
   select('Roll','role_code',roleOptions,defaultRole,true)+
   select('Part','party_id',asOptions('parties'),'',false)+
   select('Person – välj vid kontaktroll','person_id',asOptions('people'))+
   label('Giltig från','valid_from',state.asOf,'date','required')+
   '<p class="hint">Personen måste först vara kopplad till parten. Lämna person tom för hyresgäst eller fastighetsägare. En ny koppling ersätter tidigare ansvar från valt datum.</p>'};
 }
 if(mode==='link'){
  return {title:'Koppla person och part',action:'linkPersonParty',fixed:v==='people'?{person_id:r.id}:{party_id:r.id},
   fields:(v==='people'?select('Part','party_id',asOptions('parties'),'',true):select('Person','person_id',asOptions('people'),'',true))+
   label('Befattning','job_title')+label('Giltig från','valid_from',state.asOf,'date','required')+label('Giltig till (valfritt)','valid_to','','date')};
 }
 if(mode==='rent'){
  return {title:'Hyra eller tillägg',action:'addAgreementItem',fixed:{agreement_id:r.id},
    fields:select('Typ','type',[{id:'base',label:'Bashyra'},{id:'addition',label:'Tilläggshyra'},...['heat','water','electricity','cooling','waste','tax','other'].map(id=>({id,label:({heat:'Värme',water:'VA',electricity:'El',cooling:'Kyla',waste:'Avfall',tax:'Fastighetsskatt',other:'Övrigt'})[id]}))],'base',true)+
     label('Benämning','name','Bashyra','text','required')+label('Grundbelopp, kr per år','base_amount','','number','required min="0" step="any"')+
     label('Giltig från','valid_from',state.asOf,'date')+label('Giltig till','valid_to','','date')+
     select('Uppräkning','adjustment_method',[{id:'none',label:'Ingen'},{id:'kpi',label:'KPI'},{id:'fixed',label:'Fast årlig procent'},{id:'kpi-limited',label:'KPI min/max'}],'none')+
     label('Basår · första hyresår','base_year',state.asOf.slice(0,4),'number','min="1900"')+
     label('KPI-bastal · oktober före basåret','base_index','','number','min="0" step="any"')+
     label('Indexandel (0–1)','index_share','','number','min="0" max="1" step="any"')+
     label('Årlig procent','annual_percent','','number','step="any"')+
     label('Garanterad minsta årlig höjning, %','min_percent','','number','min="0" step="any"')+
     label('Högsta årlig höjning, %','max_percent','','number','min="0" step="any"')+
     select('Grundbelopp som golv','floor',[{id:'1',label:'Ja – minst grundbeloppet'},{id:'0',label:'Nej – sänkning tillåts'}],'1')+
     '<p class="hint">Min är en garanterad årlig höjning även om KPI är lägre eller negativt. Max är årets tak. Båda beräknas på föregående års hyra och anges separat för bashyra och tillägg.</p>'};
 }
 if(mode==='end')return {title:'Avsluta objekt',action:'endObject',fields:label('Slutdatum','ended_on',state.asOf,'date','required')};
 if(v==='properties'&&mode==='externalNumber')return {
  title:'Koppla externt fastighetsnummer',action:'addPropertyExternalNumber',
  fixed:{property_id:r.id},
  fields:label('Källsystem','source_system','','text','required maxlength="80" placeholder="Exempelvis Stadsfastigheter"')+
   label('Nummer i källsystemet','external_number','','text','required maxlength="120" placeholder="SF1600"')+
   '<p class="hint">FörvaltningsNr är huvudnumret. Externa nummer används för sökning och import och ändrar inte objekt eller avtal.</p>'
 };
 if(v==='properties')return {title:mode==='create'?'Ny fastighet':'Redigera fastighet',action:mode==='create'?'createProperty':'updateProperty',
  fields:label('Fastighetsnamn','name',r.name,'text','required')+label('FörvaltningsNr','management_object_number',r.management_object_number)+label('Populärnamn','popular_name',r.popular_name)+label('Adress','address',r.address)+label('Ort','city',r.city)+label('Latitud','latitude',r.latitude,'number','step="any" min="-90" max="90"')+label('Longitud','longitude',r.longitude,'number','step="any" min="-180" max="180"')};
 if(v==='parties')return {title:mode==='create'?'Ny part':'Redigera part',action:mode==='create'?'createParty':'updateParty',
  fields:label('Partens namn','name',r.name,'text','required')+label('Organisationsnummer','organization_number',r.organization_number)+label('Typ','kind',r.kind)};
 if(v==='people')return {title:mode==='create'?'Ny person':'Redigera person',action:mode==='create'?'createPerson':'updatePerson',
  fields:label('Namn','name',r.name,'text','required')+label('E-post','email',r.email,'email')+label('Telefon','phone',r.phone)};
 if(v==='objects'){
  if(mode==='create')return {title:'Nytt objekt',action:'createObject',...(parentId?{fixed:{property_id:parentId}}:{}),fields:(parentId?'<p class="hint">Fastighet: '+esc(a.properties.find(p=>p.id===parentId)?.name||'Okänd')+'</p>':select('Fastighet','property_id',asOptions('properties'),'',true))+
   label('Objektsnummer','object_number',nextObjectNumber(a.properties.find(p=>p.id===parentId),a.objects,a.properties)||'','text','required autocomplete="off"')+
   '<p class="hint">Föreslås från fastighetsnumret, exempelvis SF1213-001. Fritt att ändra vid behov. Fastighetens nummer krävs för automatiskt förslag.</p>'+
   label('Startdatum','valid_from',state.asOf,'date','required')+
   label('Yta m²','area','','number','min="0" step="any"')+label('Kategori','category')};
  const last=r.versions[0],suggest=state.asOf>last.valid_from?state.asOf:'';
  return {title:'Ny version av objekt '+r.object_number,action:'reviseObject',fields:label('Nytt startdatum','valid_from',suggest,'date','required')+
   label('Yta m²','area',last.area,'number','min="0" step="any"')+label('Kategori','category',last.category)+
   '<p class="hint">Samma objektsnummer behålls. Datumet måste vara senare än den senaste versionens startdatum.</p>'};
 }
 if(v==='agreements'){
  if(mode==='create')return {title:'Nytt avtal',action:'createAgreement',...(parentId?{fixed:{object_id:parentId}}:{}),fields:(parentId?'<p class="hint">Objekt: '+esc(a.objects.find(o=>o.id===parentId)?.object_number||'Okänt')+'</p>':select('Objekt','object_id',asOptions('objects'),'',true))+
   label('Avtalsnummer','agreement_number',nextAgreementNumber(a.objects.find(o=>o.id===parentId),a.agreements)||'','text','required autocomplete="off"')+
   '<p class="hint">Föreslås från objektsnumret, exempelvis SF1213-001-01. Tidigare avtalsnummer återanvänds inte. Fritt att ändra vid behov.</p>'+
   label('Startdatum','valid_from',state.asOf,'date','required')+
   label('Avtalsslut','legal_end_on','','date')+label('Användning','usage')};
  const last=r.versions[0],suggest=state.asOf>last.valid_from?state.asOf:'';
  return {title:'Ny avtalsversion',action:'reviseAgreement',fields:label('Ny versionsstart','valid_from',suggest,'date','required')+
   label('Avtalsslut','legal_end_on',last.legal_end_on,'date')+label('Användning','usage',last.usage)+
   '<p class="hint">Avtalsnumret behålls. Hyresgäst och kontaktpersoner styrs separat via rollkopplingar.</p>'};
 }
 throw Error('Det valda formuläret saknas.');
}
function refreshParentNumberSuggestion(){
 const spec=state.mode;
 if(!spec||!['createObject','createAgreement'].includes(spec.action))return;
 const field=spec.action==='createObject'?'object_number':'agreement_number';
 const selectField=spec.action==='createObject'?'property_id':'object_id';
 const input=$('#edit-form').elements.namedItem(field);
 if(!input)return;
 const parent=spec.fixed?.[selectField]||$('#edit-form').elements.namedItem(selectField)?.value;
 const next=spec.action==='createObject'
  ?nextObjectNumber(state.snapshot.properties.find(p=>p.id===parent),state.snapshot.objects,state.snapshot.properties)
  :nextAgreementNumber(state.snapshot.objects.find(o=>o.id===parent),state.snapshot.agreements);
 if(!input.value||input.value===input.dataset.suggested||input.value===next)input.value=next||'';
 input.dataset.suggested=next||'';
}
function openForm(mode,{view=state.view,parentId=null}={}){
 try{
  const row=mode==='create'?null:selected();
  const spec=formSchema(mode,row,view,parentId);
  state.mode={...spec,id:spec.id||row?.id||null,navigateTo:mode==='create'&&view!==state.view?view:null};
  $('#form-title').textContent=spec.title;$('#form-fields').innerHTML=spec.fields;
  refreshParentNumberSuggestion();
  $('#editor').showModal();$('#edit-form').querySelector('input,select')?.focus();
 }catch(error){notify(error.message,true)}
}
async function saveForm(e){
 e.preventDefault();const form=$('#edit-form'),spec=state.mode;
 const entries=Object.fromEntries(new FormData(form).entries());
 for(const [k,v]of Object.entries(entries))if(v==='')delete entries[k];
 const fields={...entries,...spec.fixed};
 if(spec.action==='reviseAgreementItem')
  for(const key of ['base_year','base_index','index_share','annual_percent','min_percent','max_percent']){
   const input=form.elements.namedItem(key);if(input)fields[key]=input.value||null;
  }
 if(spec.transform)spec.transform(fields);
 const command={action:spec.action,fields};
 if(spec.id)command.id=spec.id;
 $('#submit-editor').disabled=true;
 try{
  const previousIds=spec.navigateTo?new Set(state.snapshot[spec.navigateTo].map(row=>row.id)):null;
  const data=await api({version:state.snapshot.version,asOf:state.asOf,command});
  state.snapshot=data;$('#editor').close();notify('Sparat i den privata v3-databasen.');
  if(spec.navigateTo){
   const created=data[spec.navigateTo].find(row=>!previousIds.has(row.id));
   navigate(spec.navigateTo,created?.id||null);
  }else render();
 }catch(error){notify(error.message,true)}finally{$('#submit-editor').disabled=false}
}
async function refresh(){
 try{state.snapshot=await api();const rows=registerItems();if(!rows.some(r=>r.id===state.id))state.id=['overview','sources','datamodel'].includes(state.view)?rows[0]?.id||null:null;render();}
 catch(error){notify(error.message,true)}
}
document.addEventListener('click',e=>{
 const rent=e.target.closest('[data-edit-rent]');
 if(rent){state.rentEditId=rent.dataset.editRent;openForm('editRent');return;}
 const closeRent=e.target.closest('[data-close-rent]');
 if(closeRent){state.rentEditId=closeRent.dataset.closeRent;openForm('endRent');return;}
 const jump=e.target.closest('[data-jump-view]');
 if(jump){navigate(jump.dataset.jumpView,jump.dataset.jumpId);return;}
 const child=e.target.closest('[data-create-child]');
 if(child){openForm('create',{view:child.dataset.createChild,parentId:child.dataset.parentId});return;}
 const removeExternal=e.target.closest('[data-remove-external-number]');
 if(removeExternal){
  const alias=state.snapshot.propertyExternalNumbers?.find(n=>n.id===removeExternal.dataset.removeExternalNumber);
  if(!alias||alias.property_id!==selected()?.id)return;
  if(!window.confirm('Ta bort kopplingen '+alias.source_system+': '+alias.external_number+'? Fastigheten och avtalen behålls.'))return;
  api({version:state.snapshot.version,asOf:state.asOf,command:{action:'removePropertyExternalNumber',id:alias.id}})
   .then(data=>{state.snapshot=data;render();notify('Extern nummerkoppling borttagen.');}).catch(error=>notify(error.message,true));
  return;
 }
 const geo=e.target.closest('[data-geocode]');
 if(geo){geocodeSelectedProperty().catch(error=>notify(error.message,true));return;}
 const nav=e.target.closest('[data-view]');
 if(nav){navigate(nav.dataset.view);return;}
 const row=e.target.closest('[data-id]');
 if(row?.classList.contains('record-row')){state.id=row.dataset.id;renderDetail();renderList();return;}
 const action=e.target.closest('[data-mode]');
 if(action){openForm(action.dataset.mode);return;}
});
$('#toggle-history').addEventListener('click',()=>{
 state.showHistory=!state.showHistory;
 if(state.id&&!registerItems().some(r=>r.id===state.id))state.id=null;
 render();
});
document.addEventListener('click',event=>{
 if(!event.target.closest('[data-export]'))return;
 const rows=state.snapshot;
 const json=JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),snapshot:rows},null,2);
 const file=new Blob([json],{type:'application/json;charset=utf-8'});
 const uri=URL.createObjectURL(file),anchor=document.createElement('a');
 anchor.href=uri;anchor.download='lokalblick-v3-'+state.asOf+'.json';document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(uri),1000);
 notify('Ett JSON-utdrag har skapats lokalt i webbläsaren.');
});
$('#new-record').addEventListener('click',()=>openForm('create'));
$('#filter').addEventListener('input',e=>{state.search=e.target.value;renderList()});
$('#as-of').addEventListener('change',async e=>{if(!e.target.value)return;state.asOf=e.target.value;await refresh()});
$('#edit-form').addEventListener('submit',saveForm);
$('#edit-form').addEventListener('change',event=>{
 if(event.target.matches('[name="property_id"],[name="object_id"]'))refreshParentNumberSuggestion();
});
$('#close-editor').addEventListener('click',()=>$('#editor').close());
$('#cancel-editor').addEventListener('click',()=>$('#editor').close());
refresh();

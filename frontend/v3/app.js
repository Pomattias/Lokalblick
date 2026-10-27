// First native Lokalblick v3 screens. All persisted facts use the v3 HTTP API.
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const viewNames={properties:'Fastigheter',objects:'Objekt',agreements:'Avtal',parties:'Parter',people:'Personer'};
const itemNames={properties:'fastighet',objects:'objekt',agreements:'avtal',parties:'part',people:'person'};
const dateToday=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'});
const roles={owner:'Fastighetsägare',owner_contact:'Fastighetsägarens kontakt',coordinator:'Lokalsamordnare',tenant:'Hyresgäst',tenant_contact:'Hyresgästens kontakt',asset_manager:'Förvaltare',project_manager:'Projektledare'};
const state={view:'properties',id:null,snapshot:null,asOf:dateToday,mode:null,search:''};
$('#as-of').value=state.asOf;
async function api(body=null){
 const url='/api/v3/core'+(body?'':'?date='+encodeURIComponent(state.asOf));
 const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Kunde inte läsa databasen.');return result;
}
const notify=(message,error=false)=>{const el=$('#feedback');el.textContent=message;el.classList.toggle('error',error)};
const matches=(row,query)=>JSON.stringify(row).toLocaleLowerCase('sv').includes(query);
const itemName=(view,row)=>view==='properties'?row.name:view==='objects'?row.object_number:view==='agreements'?row.agreement_number:row.name;
const secondary=(view,row)=>view==='properties'?row.address||row.management_object_number||'Ingen adress':view==='objects'?(row.currentVersion?.area??'–')+' m² · '+(state.snapshot.properties.find(p=>p.id===row.property_id)?.name||''):view==='agreements'?'Start '+(row.currentVersion?.valid_from||row.original_start_on||'–'):view==='people'?row.email||'Ingen e-post':row.organization_number||'Ingen organisationsnummer';
const selected=()=>state.snapshot?.[state.view]?.find(x=>x.id===state.id);
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
 const list=(state.snapshot?.[state.view]||[]),query=state.search.toLocaleLowerCase('sv').trim();
 $('#heading').textContent=viewNames[state.view];$('#list-heading').textContent=viewNames[state.view];
 $('#new-record').textContent='+ Lägg till '+itemNames[state.view];
 const visible=list.filter(r=>!query||matches(r,query));
 $('#record-list').innerHTML=visible.map(row=>'<button type="button" class="record-row" data-id="'+esc(row.id)+'" aria-selected="'+(state.id===row.id)+'"><span><strong>'+esc(itemName(state.view,row))+'</strong><small>'+esc(secondary(state.view,row))+'</small></span><span class="chevron">›</span></button>').join('')||'<div class="empty">Inga poster. Lägg till den första.</div>';
 $('#stats').innerHTML=[
  ['Fastigheter',state.snapshot.properties.length],['Objekt',state.snapshot.objects.length],
  ['Avtal',state.snapshot.agreements.length],['Parter',state.snapshot.parties.length],['Personer',state.snapshot.people.length]
 ].map(([k,n])=>'<div class="stat"><strong>'+n+'</strong><span>'+k+'</span></div>').join('');
}
function renderDetail(){
 const row=selected(),panel=$('#detail');
 if(!row){panel.innerHTML='<div class="empty">Välj en post för att visa dess data, kontaktpersoner och historiska versioner.</div>';return;}
 let actions='<button type="button" class="secondary" data-mode="edit">Redigera</button>';
 let facts='',history='';
 if(state.view==='properties'){
  facts=[fact('Förvaltningsobjekt',row.management_object_number),fact('Adress',[row.address,row.city].filter(Boolean).join(', ')),fact('Ägare',row.stakeholders.owner.map(r=>state.snapshot.parties.find(p=>p.id===r.partyId)?.name).join(', ')||'–')].join('');
  actions+='<button class="secondary" type="button" data-mode="role">Koppla part/person</button>';
  const objs=state.snapshot.objects.filter(o=>o.property_id===row.id);
  history='<h3>Objekt på fastigheten</h3><div class="timeline">'+(objs.map(o=>'<article><strong>'+esc(o.object_number)+'</strong><span>'+esc(o.currentVersion?.area??'–')+' m²</span></article>').join('')||'<span class="muted">Inga objekt ännu.</span>')+'</div>';
 } else if(state.view==='objects'){
  const v=row.currentVersion;
  facts=[fact('Objektsnummer',row.object_number),fact('Fastighet',state.snapshot.properties.find(p=>p.id===row.property_id)?.name),fact('Gällande area',v?.area==null?'Ingen gällande version':v.area+' m²'),fact('Startdatum version',v?.valid_from),fact('Avslutad',row.ended_on||'Nej')].join('');
  actions='<button class="secondary" type="button" data-mode="revise">Ny objektversion</button><button class="secondary" type="button" data-mode="role">Koppla part/person</button><button class="secondary" type="button" data-mode="end">Avsluta objekt</button>';
  history='<h3>Objekthistorik · '+row.versions.length+' versioner</h3><div class="timeline">'+row.versions.map(v=>'<article><strong>'+esc(v.valid_from)+'</strong><span>'+esc(v.area??'–')+' m² · '+esc(v.category||'Objekt')+'</span></article>').join('')+'</div>';
 } else if(state.view==='agreements'){
  const v=row.currentVersion,tenant=row.stakeholders.tenant[0];
  facts=[fact('Avtalsnummer',row.agreement_number),fact('Objekt',state.snapshot.objects.find(o=>o.id===row.object_id)?.object_number),fact('Hyresgäst',state.snapshot.parties.find(p=>p.id===tenant?.partyId)?.name),fact('Avtalsstart',v?.valid_from),fact('Avtalsslut',v?.legal_end_on||'Tills vidare'),fact('Användning',v?.usage)].join('');
  actions='<button class="secondary" type="button" data-mode="revise">Ny avtalsversion</button><button class="secondary" type="button" data-mode="role">Koppla part/person</button><button class="secondary" type="button" data-mode="rent">Hyra / tillägg</button>';
  history='<h3>Avtalsversioner</h3><div class="timeline">'+row.versions.map(v=>'<article><strong>'+esc(v.valid_from)+'</strong><span>'+esc(v.legal_end_on||'Tills vidare')+'</span></article>').join('')+'</div>';
  const rents=state.snapshot.agreementItems.filter(i=>i.agreement_id===row.id);
  history+='<h3>Hyra och tillägg</h3><div class="timeline">'+(rents.map(i=>'<article><strong>'+esc(i.name)+'</strong><span>'+esc(formatMoney(i.base_amount))+' · '+esc(i.valid_from||'Utan start')+'</span></article>').join('')||'<span class="muted">Inga hyresposter.</span>')+'</div>';
 } else if(state.view==='parties'){
  facts=[fact('Namn',row.name),fact('Organisationsnummer',row.organization_number),fact('Typ',row.kind)].join('');
  actions+='<button class="secondary" type="button" data-mode="link">Koppla person</button>';
  history='<h3>Personer som företräder parten</h3><div class="timeline">'+state.snapshot.partyPeople.filter(x=>x.party_id===row.id).map(x=>'<article><strong>'+esc(state.snapshot.people.find(p=>p.id===x.person_id)?.name||'Person')+'</strong><span>'+esc(x.valid_from)+' – '+esc(x.valid_to||'')+'</span></article>').join('')+'</div>';
 } else {
  facts=[fact('Namn',row.name),fact('E-post',row.email),fact('Telefon',row.phone)].join('');
  actions+='<button class="secondary" type="button" data-mode="link">Koppla part</button>';
  history='<h3>Parttillhörighet</h3><div class="timeline">'+state.snapshot.partyPeople.filter(x=>x.person_id===row.id).map(x=>'<article><strong>'+esc(state.snapshot.parties.find(p=>p.id===x.party_id)?.name||'Part')+'</strong><span>'+esc(x.valid_from)+' – '+esc(x.valid_to||'')+'</span></article>').join('')+'</div>';
 }
 const heading=itemName(state.view,row);
 panel.innerHTML='<div class="detail-header"><div><h2>'+esc(heading)+'</h2><p class="muted">Registerpost · '+esc(state.view)+'</p></div><div class="actions">'+actions+'</div></div><div class="details">'+facts+'</div>'+history+(row.stakeholders?renderRoles(row.stakeholders):'');
}
function render(){document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false'));renderList();renderDetail();}
function formSchema(mode,row){
 const v=state.view,r=row||{},a=state.snapshot;
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
    fields:select('Typ','type',[{id:'base',label:'Bashyra'},{id:'addition',label:'Tilläggshyra'},...['heat','water','electricity','cooling','waste','tax','other'].map(id=>({id,label:id}))],'base',true)+
     label('Benämning','name','Bashyra','text','required')+label('Grundbelopp, kr per år','base_amount','','number','required min="0" step="any"')+
     label('Giltig från','valid_from',state.asOf,'date')+label('Giltig till','valid_to','','date')};
 }
 if(mode==='end')return {title:'Avsluta objekt',action:'endObject',fields:label('Slutdatum','ended_on',state.asOf,'date','required')};
 if(v==='properties')return {title:mode==='create'?'Ny fastighet':'Redigera fastighet',action:mode==='create'?'createProperty':'updateProperty',
  fields:label('Fastighetsnamn','name',r.name,'text','required')+label('Förvaltningsobjekt','management_object_number',r.management_object_number)+label('Populärnamn','popular_name',r.popular_name)+label('Adress','address',r.address)+label('Ort','city',r.city)};
 if(v==='parties')return {title:mode==='create'?'Ny part':'Redigera part',action:mode==='create'?'createParty':'updateParty',
  fields:label('Partens namn','name',r.name,'text','required')+label('Organisationsnummer','organization_number',r.organization_number)+label('Typ','kind',r.kind)};
 if(v==='people')return {title:mode==='create'?'Ny person':'Redigera person',action:mode==='create'?'createPerson':'updatePerson',
  fields:label('Namn','name',r.name,'text','required')+label('E-post','email',r.email,'email')+label('Telefon','phone',r.phone)};
 if(v==='objects'){
  if(mode==='create')return {title:'Nytt objekt',action:'createObject',fields:select('Fastighet','property_id',asOptions('properties'),'',true)+
   label('Objektsnummer','object_number','','text','required')+label('Startdatum','valid_from',state.asOf,'date','required')+
   label('Yta m²','area','','number','min="0" step="any"')+label('Kategori','category')};
  const last=r.versions[0],suggest=state.asOf>last.valid_from?state.asOf:'';
  return {title:'Ny version av objekt '+r.object_number,action:'reviseObject',fields:label('Nytt startdatum','valid_from',suggest,'date','required')+
   label('Yta m²','area',last.area,'number','min="0" step="any"')+label('Kategori','category',last.category)+
   '<p class="hint">Samma objektsnummer behålls. Datumet måste vara senare än den senaste versionens startdatum.</p>'};
 }
 if(v==='agreements'){
  if(mode==='create')return {title:'Nytt avtal',action:'createAgreement',fields:select('Objekt','object_id',asOptions('objects'),'',true)+
   label('Avtalsnummer','agreement_number','','text','required')+label('Startdatum','valid_from',state.asOf,'date','required')+
   label('Avtalsslut','legal_end_on','','date')+label('Användning','usage')};
  const last=r.versions[0],suggest=state.asOf>last.valid_from?state.asOf:'';
  return {title:'Ny avtalsversion',action:'reviseAgreement',fields:label('Ny versionsstart','valid_from',suggest,'date','required')+
   label('Avtalsslut','legal_end_on',last.legal_end_on,'date')+label('Användning','usage',last.usage)+
   '<p class="hint">Avtalsnumret behålls. Hyresgäst och kontaktpersoner styrs separat via rollkopplingar.</p>'};
 }
 throw Error('Det valda formuläret saknas.');
}
function openForm(mode){
 try{
  const row=mode==='create'?null:selected();
  const spec=formSchema(mode,row);
  state.mode={...spec,id:row?.id||null};
  $('#form-title').textContent=spec.title;$('#form-fields').innerHTML=spec.fields;
  $('#editor').showModal();$('#edit-form').querySelector('input,select')?.focus();
 }catch(error){notify(error.message,true)}
}
async function saveForm(e){
 e.preventDefault();const form=$('#edit-form'),spec=state.mode;
 const entries=Object.fromEntries(new FormData(form).entries());
 for(const [k,v]of Object.entries(entries))if(v==='')delete entries[k];
 const fields={...entries,...spec.fixed};
 const command={action:spec.action,fields};
 if(spec.id)command.id=spec.id;
 $('#submit-editor').disabled=true;
 try{
  const data=await api({version:state.snapshot.version,asOf:state.asOf,command});
  state.snapshot=data;$('#editor').close();notify('Sparat i den privata v3-databasen.');render();
 }catch(error){notify(error.message,true)}finally{$('#submit-editor').disabled=false}
}
async function refresh(){
 try{state.snapshot=await api();if(!state.snapshot[state.view].some(r=>r.id===state.id))state.id=null;render();}
 catch(error){notify(error.message,true)}
}
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-view]');
 if(nav){state.view=nav.dataset.view;state.id=null;state.search='';$('#filter').value='';render();return;}
 const row=e.target.closest('[data-id]');if(row?.classList.contains('record-row')){state.id=row.dataset.id;render();return;}
 const action=e.target.closest('[data-mode]');if(action){openForm(action.dataset.mode);return;}
});
$('#new-record').addEventListener('click',()=>openForm('create'));
$('#filter').addEventListener('input',e=>{state.search=e.target.value;renderList()});
$('#as-of').addEventListener('change',async e=>{if(!e.target.value)return;state.asOf=e.target.value;await refresh()});
$('#edit-form').addEventListener('submit',saveForm);
$('#close-editor').addEventListener('click',()=>$('#editor').close());
$('#cancel-editor').addEventListener('click',()=>$('#editor').close());
refresh();

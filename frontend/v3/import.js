// Private, opt-in Excel/CSV import. The workbook is parsed locally in the browser.
// No automated migration, guessing across properties or hidden data changes.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const kind={
 parties:{title:'Parter',action:'createParty',fields:{name:['Namn','Part','Organisation','Företag'],organization_number:['Organisationsnummer','Orgnr'],kind:['Typ']},required:['name']},
 people:{title:'Personer',action:'createPerson',fields:{name:['Namn','Person'],email:['E-post','Email','Epost'],phone:['Telefon','Mobil']},required:['name']},
 properties:{title:'Fastigheter',action:'createProperty',fields:{name:['Fastighetsnamn','Fastighet','Namn','Fastighetsbeteckning'],management_object_number:['Förvaltningsobjekt','Fastighetsnummer'],address:['Adress','Gatuadress'],city:['Ort','Stad','Kommun'],popular_name:['Populärnamn']},required:['name']},
 objects:{title:'Objekt',action:'createObject',parent:'property_id',fields:{object_number:['Objektsnummer','Objekt','Objektnummer','Nummer'],valid_from:['Startdatum','Från och med','Giltig från','Fr.o.m.'],area:['Yta','Area','Yta m2','Kvm'],category:['Kategori','Objektkategori']},required:['object_number','valid_from']},
 agreements:{title:'Avtal',action:'createAgreement',parent:'object_id',fields:{agreement_number:['Avtalsnummer','Avtal','AvtalsID','Kontraktsnummer'],valid_from:['Startdatum','Avtal från','Hyrestid från'],legal_end_on:['Slutdatum','Avtal till','Hyrestid till'],usage:['Användning','Verksamhetstyp']},required:['agreement_number','valid_from']},
 issues:{title:'Ärenden',action:'createIssue',parent:'property_id',fields:{title:['Namn','Ärende','Rubrik'],description:['Beskrivning','Notering'],estimated_cost:['Kostnad','Beräknad kostnad','Budget']},required:['title']},
 recurringCosts:{title:'Fastighetskostnader',action:'createCost',parent:'property_id',fields:{name:['Namn','Benämning','Kostnad'],category:['Kategori','Kostnadstyp'],annual_amount:['Årskostnad','Årsbelopp','Budget','Belopp']},required:['name','annual_amount']}
};
const toDate=v=>{
 const s=String(v??'').trim();
 if(!s)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const sw=s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
 if(sw)return sw[3]+'-'+sw[2].padStart(2,'0')+'-'+sw[1].padStart(2,'0');
 const iso=s.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})$/);
 if(iso)return iso[1]+'-'+iso[2].padStart(2,'0')+'-'+iso[3].padStart(2,'0');
 return s;
};
const amount=v=>{
 if(v===''||v==null)return null;
 const n=Number(String(v).replace(/\s/g,'').replace(',','.'));
 return Number.isFinite(n)?n:NaN;
};
function readCsv(value) {
 const sample=value.split(/\r?\n/).slice(0,4).join('\n'),separator=(sample.match(/;/g)||[]).length>(sample.match(/,/g)||[]).length?';':',';
 const output=[];let row=[],cell='',quoted=false;
 for(let i=0;i<value.length;i++) {
  const c=value[i];
  if(c==='"'&&quoted&&value[i+1]==='"'){cell+='"';i++;continue;}
  if(c==='"'){quoted=!quoted;continue;}
  if(c===separator&&!quoted){row.push(cell);cell='';continue;}
  if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&value[i+1]==='\n')i++;row.push(cell);if(row.some(x=>String(x).trim()))output.push(row);row=[];cell='';continue;}
  cell+=c;
 }
 row.push(cell);if(row.some(x=>String(x).trim()))output.push(row);
 return output;
}
const option=(items)=>items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');
// Keep reference sheets available to Excel formulas, but never offer them as import sources.
export function importableSheetNames(names){
 const hasMaster=names.some(name=>normalize(name)==='lokallista');
 return names.filter(name=>normalize(name)!=='fastighetsregister'&&!(hasMaster&&['sf','ext'].includes(normalize(name))));
}
export function mountImport(root,{snapshot,apply}) {
 const shell=document.createElement('section');shell.className='v3-import';
 shell.innerHTML='<h3>Importera nya Excel- eller CSV-uppgifter</h3>'+
  '<p class="muted">Välj ett register och en flik. Kontrollera kolumnmatchningen och förhandsgranska innan du sparar. En import omfattar högst 200 rader åt gången och är helt atomisk. Inga gamla Lokalblick-databaser importeras.</p>'+
  '<div class="import-grid"><label>Register<select data-import-register>'+option(Object.entries(kind).map(([id,k])=>({id,label:k.title})))+'</select></label>'+
  '<label>Excel/CSV-fil<input data-import-file type="file" accept=".xlsx,.xls,.csv,text/csv"></label>'+
  '<label>Flik<select data-import-sheet disabled><option>Välj fil</option></select></label>'+
  '<label data-parent-wrap hidden>Fastighet/objekt<select data-import-parent></select></label></div>'+
  '<div data-import-map></div><div data-import-preview></div>'+
  '<button type="button" class="primary" data-import-apply disabled>Bekräfta import</button>';
 root.append(shell);
 let book=[],columns=[],rows=[],plan=[],errors=[],fileName='';
 const affiliations=new Map(),newParties=new Map();
 const affiliationOptions=()=>[...snapshot.parties,...newParties.values()].sort((a,b)=>a.name.localeCompare(b.name,'sv'));
 const organizationKey=s=>normalize(s);
 const uniquePart=(name,number='')=>affiliationOptions().find(p=>number&&p.organization_number===number)||affiliationOptions().find(p=>organizationKey(p.name)===organizationKey(name));
 const register=shell.querySelector('[data-import-register]'),file=shell.querySelector('[data-import-file]'),
  sheet=shell.querySelector('[data-import-sheet]'),map=shell.querySelector('[data-import-map]'),
  preview=shell.querySelector('[data-import-preview]'),confirm=shell.querySelector('[data-import-apply]'),
  parentWrap=shell.querySelector('[data-parent-wrap]'),parent=shell.querySelector('[data-import-parent]');
 const chosen=()=>kind[register.value];
 function parentFields(){
  const field=chosen().parent;parentWrap.hidden=!field;if(!field)return;
  const items=field==='object_id'?snapshot.objects.map(r=>({id:r.id,label:r.object_number+' · '+snapshot.properties.find(p=>p.id===r.property_id)?.name})):
   snapshot.properties.map(r=>({id:r.id,label:r.name}));
  parentWrap.firstChild.textContent=field==='object_id'?'Objekt':'Fastighet';
  parent.innerHTML='<option value="">Välj…</option>'+option(items);
 }
 function columnsFor(sheetRows){
  affiliations.clear();newParties.clear();
  columns=(sheetRows[0]||[]).map((v,i)=>({id:String(i),label:String(v||'Kolumn '+(i+1))}));
  rows=sheetRows.slice(1).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim())).slice(0,201);
  const k=chosen(),entries=Object.entries(k.fields);
  map.innerHTML='<h3>Kolumnmatchning</h3><div class="import-grid">'+entries.map(([key,aliases])=>{
   const col=columns.find(c=>[key,...aliases].some(a=>normalize(a)===normalize(c.label)));
   return '<label>'+esc(aliases[0])+(k.required.includes(key)?' *':'')+
     '<select data-import-column="'+esc(key)+'"><option value="">Hoppa över</option>'+
     columns.map(c=>'<option value="'+esc(c.id)+'" '+(col?.id===c.id?'selected':'')+'>'+esc(c.label)+'</option>').join('')+
     '</select></label>';
  }).join('')+'</div>';
  buildPreview();
 }
 function buildPreview(){
  plan=[];errors=[];
  if(!rows.length){preview.innerHTML='<p class="muted">Inga rader att importera.</p>';confirm.disabled=true;return;}
  const k=chosen(),assigned={...Object.fromEntries([...map.querySelectorAll('[data-import-column]')].map(e=>[e.dataset.importColumn,e.value]))};
  const used=Object.values(assigned).filter(v=>v!=='');
  if(new Set(used).size!==used.length)errors.push('Samma källkolumn har valts flera gånger.');
  for(const field of k.required)if(!assigned[field])errors.push('Obligatoriskt fält saknar kolumn: '+field);
  if(k.parent&&!parent.value)errors.push('Välj en '+(k.parent==='object_id'?'objekt':'fastighet')+' för samtliga rader.');
  rows.slice(0,200).forEach((row,i)=>{
   const data={};
   for(const [field,index]of Object.entries(assigned))if(index!==''){
    const val=row[Number(index)]??'';if(String(val).trim())data[field]=String(val).trim();
   }
   if(k.parent)data[k.parent]=parent.value;
   for(const field of Object.keys(data)) {
    if(['valid_from','valid_to','legal_end_on'].includes(field))data[field]=toDate(data[field]);
    if(['area','annual_amount','estimated_cost'].includes(field))data[field]=amount(data[field]);
   }
   if(k.action==='createCost'){
    const cat=normalize(data.category);
    data.category=({varme:'heat',va:'water',vatten:'water',el:'electricity',kyla:'cooling',sopor:'waste',avfall:'waste',ovrigt:'other'})[cat]||
     (['heat','water','electricity','cooling','waste','other'].includes(data.category)?data.category:'other');
   }
   if(k.required.some(field=>data[field]==null||data[field]===''))errors.push('Rad '+(i+2)+': obligatoriskt värde saknas.');
   if(data.area!=null&&!Number.isFinite(data.area))errors.push('Rad '+(i+2)+': ogiltig yta.');
   if(data.annual_amount!=null&&!Number.isFinite(data.annual_amount))errors.push('Rad '+(i+2)+': ogiltigt årsbelopp.');
   plan.push({action:k.action,fields:data,sourceRow:i+2});
  });
  if(rows.length>200)errors.push('Filen har fler än 200 datarader. Dela upp importen i mindre filer.');
  if(register.value==='people'){
   const partyCommands=[...newParties.values()].map(p=>({action:'createParty',id:p.id,fields:{name:p.name,...(p.organization_number?{organization_number:p.organization_number}:{})}}));
   const links=plan.filter((_,i)=>affiliations.get(i)).length;
   if(plan.length+links+partyCommands.length>200)errors.push('För många åtgärder för en transaktion (högst 200). Dela upp importen.');
  }
  preview.innerHTML='<h3>Förhandsgranskning · '+plan.length+' rader</h3>'+
    (errors.length?'<p class="error-text">'+errors.map(esc).join(' · ')+'</p>':'<p class="muted">Inga kolumn- eller datakontrollfel i förhandsgranskningen. Databasen kontrollerar dessutom alla relationer vid sparning.</p>')+
    '<div class="import-preview-table"><table><thead><tr><th>Rad</th><th>Data</th></tr></thead><tbody>'+
    plan.slice(0,8).map((c,i)=>'<tr><td>'+(i+2)+'</td><td>'+esc(JSON.stringify(c.fields))+'</td></tr>').join('')+
    '</tbody></table></div>'+
    (register.value==='people'?'<h4>Bolag / organisation per person</h4><div class="import-preview-table"><table><thead><tr><th>Person</th><th>Bolag / organisation (Part)</th></tr></thead><tbody>'+plan.map((c,i)=>'<tr><td>'+esc(c.fields.name||'Rad '+(i+2))+'</td><td><select data-person-party="'+i+'"><option value="">Ingen koppling</option>'+affiliationOptions().map(p=>'<option value="'+esc(p.id)+'"'+(affiliations.get(i)===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'<option value="@new">+ Skapa ny part…</option></select></td></tr>').join('')+'</tbody></table></div>':'');
  confirm.disabled=errors.length>0||!plan.length;
 }
 function selectSheet(){
  const found=book.find(b=>b.name===sheet.value);if(found)columnsFor(found.rows);
 }
 file.addEventListener('change',async()=>{
  try{
   const f=file.files?.[0];if(!f)return;fileName=f.name;
   if(f.size>15*1024*1024)throw Error('Högst 15 MB per fil.');
   if(f.name.toLowerCase().endsWith('.csv'))book=[{name:'CSV',rows:readCsv(await f.text())}];
   else {
    if(!globalThis.XLSX)throw Error('Excelbiblioteket kunde inte läsas.');
    const wb=globalThis.XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
    // Preserve Fastighetsregister and other reference sheets in the source workbook.
    // Only their appearance in the import selector is excluded.
    book=importableSheetNames(wb.SheetNames)
      .map(name=>({name,rows:globalThis.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''})}));
   }
   sheet.disabled=false;sheet.innerHTML=option(book.map(x=>({id:x.name,label:x.name})));
   sheet.value=book.find(b=>register.value==='agreements'&&normalize(b.name)==='lokallista')?.name||book.find(b=>normalize(b.name)===normalize(chosen().title))?.name||book[0]?.name||'';
   selectSheet();
  }catch(error){preview.innerHTML='<p class="error-text">'+esc(error.message)+'</p>';confirm.disabled=true}
 });
 register.addEventListener('change',()=>{parentFields();if(book.length){sheet.value=book.find(b=>register.value==='agreements'&&normalize(b.name)==='lokallista')?.name||book.find(b=>normalize(b.name)===normalize(chosen().title))?.name||book[0].name;selectSheet();}});
 sheet.addEventListener('change',selectSheet);
 parent.addEventListener('change',buildPreview);
 map.addEventListener('change',buildPreview);
 preview.addEventListener('change',event=>{
  const select=event.target.closest('[data-person-party]');if(!select)return;
  const index=Number(select.dataset.personParty);
  if(select.value==='@new'){
   const name=window.prompt('Namn på ny organisation/part:');if(!name?.trim()){buildPreview();return;}
   const number=window.prompt('Organisationsnummer (valfritt):')?.trim()||'';
   const match=uniquePart(name.trim(),number);
   if(match)affiliations.set(index,match.id);
   else {const id=crypto.randomUUID();newParties.set(id,{id,name:name.trim(),organization_number:number});affiliations.set(index,id);}
  }else if(select.value)affiliations.set(index,select.value);
  else affiliations.delete(index);
  buildPreview();
 });
 confirm.addEventListener('click',async()=>{
  if(confirm.disabled)return;
  if(!window.confirm('Importera '+plan.length+' rader till '+chosen().title+'? Alla rader sparas i en enda transaktion.'))return;
  confirm.disabled=true;
  try{
   const commands=register.value==='people'?[
    ...[...newParties.values()].filter(p=>[...affiliations.values()].includes(p.id)).map(p=>({action:'createParty',id:p.id,fields:{name:p.name,...(p.organization_number?{organization_number:p.organization_number}:{})}})),
    ...plan.flatMap((c,i)=>{const personId=crypto.randomUUID(),partyId=affiliations.get(i);return [{...c,id:personId},...(partyId?[{action:'linkPersonParty',sourceRow:c.sourceRow,fields:{party_id:partyId,person_id:personId,valid_from:new Date().toISOString().slice(0,10),is_primary:true}}]:[])];})
   ]:plan;
   await apply(commands);preview.innerHTML='<p>Importerade '+plan.length+' rader från '+esc(fileName)+'.</p>';map.innerHTML='';plan=[];}
  catch(error){
   const detail=error.importError||error.details?.importError;
   const match=String(error.message||'').match(/Importfel på rad (\d+)/);
   const row=detail?.sourceRow??(match?Number(match[1]):null);
   const reason=detail?.reason||error.message||'Okänt fel';
   preview.insertAdjacentHTML('afterbegin','<div role="alert" class="error-text"><strong>Importen avbröts – inga uppgifter sparades.</strong><p>'+esc(row!=null?'Fel på Excelrad '+row+': '+reason:reason)+'</p>'+(row!=null?'<p>Kontrollera rad '+row+' i källfilen och försök igen.</p>':'')+'</div>');
   confirm.disabled=false;
  }
 });
 parentFields();
}

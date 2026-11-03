// Guided import: a workbook stays in memory throughout property -> object review.
// The file is never uploaded or persisted in browser storage.
import {readCsv,importableSheetNames} from './import.js';
import {preparePropertyStage} from './property-stage.js';
import {prepareObjectStage,generatedObjectMessage} from './object-stage.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v??'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const defaultSheets=book=>{
 const preferred=new Set(['lokallista','lokalbestand','fastighetslista','lokaldata']);
 const selected=book.filter(s=>preferred.has(key(s.name))).map(s=>s.name);
 return selected.length?selected:book.slice(0,1).map(s=>s.name);
};
const stages=[['Fastigheter','properties'],['Objekt','objects'],['Avtal','agreements'],['Hyresgäster','tenants']];
const ensureSession=session=>{
 const state=session||{};
 state.book??=[];state.selected??=[];state.fileName??='';
 state.stage??='properties';state.propertiesDone??=false;state.objectsDone??=false;
 state.objectLinks??={};
 return state;
};
const showIssues=issues=>'<section class="property-import-issues"><h4>Behöver åtgärdas · '+issues.length+'</h4>'+
 '<p class="muted">Osäkra uppgifter hoppas över eller lämnas oförändrade. De hindrar inte import av säkra poster.</p>'+
 (issues.length?'<div class="property-import-table"><table><thead><tr><th>Flik / rad</th><th>Fält</th><th>Förklaring / åtgärd</th></tr></thead><tbody>'+
 issues.map(x=>'<tr><td>'+esc(x.sheet)+' · '+esc(x.row)+'</td><td>'+esc(x.field)+'</td><td>'+esc(x.message)+
 (x.value?'<small class="muted">Källa: '+esc(x.value.slice(0,120))+'</small>':'')+'</td></tr>').join('')+
 '</tbody></table></div>':'<p class="muted">Inga osäkra uppgifter hittades.</p>')+'</section>';
const summary=items=>'<div class="property-import-stats">'+items.map(([label,count])=>
 '<div><strong>'+count+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>';

export function mountPropertyImport(root,{snapshot,session:provided,apply,onSaved=()=>{}}){
 const session=ensureSession(provided);
 const shell=document.createElement('section');shell.className='property-import';
 shell.innerHTML='<h3>Importera från Excel eller CSV</h3>'+
  '<p class="muted">Vi tar ett register i taget. Granska listan, importera säkra uppgifter och fortsätt med samma fil eller välj en ny.</p>'+
  '<ol class="property-import-steps" data-import-steps aria-label="Importens steg"></ol>'+
  '<div data-import-source></div><div data-property-sheets></div>'+
  '<div data-property-preview aria-live="polite"></div>';
 root.append(shell);
 const progress=shell.querySelector('[data-import-steps]'),source=shell.querySelector('[data-import-source]'),
  tabs=shell.querySelector('[data-property-sheets]'),preview=shell.querySelector('[data-property-preview]');
 let fileInput=null,plan=null,saving=false;

 const chosen=()=>session.book.filter(s=>session.selected.includes(s.name));
 const currentStage=()=>session.stage==='objects'||session.stage==='objects-done'?'objects':'properties';
 function drawProgress(){
  const active=currentStage();
  progress.innerHTML=stages.map(([label,stage],i)=>{
   const done=stage==='properties'?session.propertiesDone:stage==='objects'?session.objectsDone:false;
   const isActive=stage===active&&!done;
   const cls=done?'is-done':isActive?'is-current':
    (session.propertiesDone&&!session.objectsDone&&stage==='objects'||
     session.objectsDone&&stage==='agreements')?'is-next':'is-pending';
   const status=done?'Klart':isActive?'Pågår':cls==='is-next'?'Nästa steg':'Kommer sedan';
   return '<li class="'+cls+'" '+(isActive?'aria-current="step"':'')+'><span class="property-import-step-number">'+
    (done?'✓':i+1)+'</span><strong>'+label+'</strong><small>'+status+'</small></li>';
  }).join('');
 }
 function drawSource(){
  const withFile=session.book.length>0,asking=session.stage==='choose-objects',
   afterObjects=session.stage==='objects-done';
  source.innerHTML=
   (asking?
    '<div class="property-import-done" role="status"><strong>Fastigheter – klart.</strong> '+
     esc(session.propertyResult?.saved??0)+' säkra ändringar sparades.'+
     (session.propertyResult?.failed?.length?' '+session.propertyResult.failed.length+' behöver kontrolleras.':'')+
     '</div>'+
    '<div class="property-import-choice"><strong>Vill du fortsätta med objekt?</strong>'+
     '<p class="muted">Den importerade filen finns kvar här. Vi använder de valda flikarna och kopplar objekten till fastigheterna.</p>'+
     '<div class="property-import-choice-buttons"><button type="button" class="primary" data-continue-objects>'+
      'Fortsätt med objekt från importerad fil</button>'+
     '<button type="button" class="secondary" data-new-object-file>Ladda upp ny fil</button></div></div>':'')+
   (afterObjects?
    '<div class="property-import-done" role="status"><strong>Objekt – klart.</strong> '+
     esc(session.objectResult?.saved??0)+' säkra objekt importerades. '+
     (session.objectResult?.failed?.length?'Vissa objekt behöver kontrolleras. ':'')+
     'Nästa steg är Avtal, där vi kontrollerar och kopplar avtalen till objekten innan import.</div>':'')+
   (withFile&&!asking&&!afterObjects?
    '<p class="property-import-source-name"><strong>Vald fil:</strong> '+esc(session.fileName)+'</p>':'')+
   (!asking&&!afterObjects?
    '<label class="property-import-file">'+(currentStage()==='objects'?'Använd annan fil för objekten':'Välj Excel- eller CSV-fil')+
     '<input data-property-file type="file" accept=".xlsx,.xls,.csv,text/csv"></label>':
    '<input data-property-file class="sr-only" type="file" accept=".xlsx,.xls,.csv,text/csv" aria-label="Ladda upp ny fil">');
  fileInput=source.querySelector('[data-property-file]');
 }
 function drawTabs(){
  if(!session.book.length||session.stage==='choose-objects'||session.stage==='objects-done'){
   tabs.innerHTML='';return;
  }
  tabs.innerHTML='<fieldset class="property-import-sheets"><legend>Valda flikar</legend>'+
   '<div>'+session.book.map((s,i)=>'<label><input type="checkbox" data-property-sheet="'+i+'" '+
    (session.selected.includes(s.name)?'checked':'')+'> '+esc(s.name)+'</label>').join('')+'</div></fieldset>';
 }
 function drawProperties(){
  const list=chosen();
  if(!list.length){plan=null;preview.innerHTML='<p class="muted">Välj minst en flik för att se fastigheterna.</p>';return;}
  plan=preparePropertyStage(list,snapshot);
  const {entries,issues,stats,commands}=plan;
  const labels={new:'Ny fastighet',update:'Kompletteras',existing:'Finns redan',review:'Behöver åtgärdas'};
  preview.innerHTML='<h3>1. Fastigheter – förhandsgranskning</h3>'+
   summary([['Identifierade fastigheter',stats.found],['Nya',stats.new],['Kompletteras',stats.enriched],
    ['Finns redan',stats.existing],['Osäkra fastigheter',stats.review],['Osäkra uppgifter',stats.issues]])+
   '<p class="muted">Fastigheter från valda flikar sammanställs och berikas. Befintliga värden skrivs inte över.</p>'+
   '<div class="property-import-table"><table><thead><tr><th>FörvaltningsNr</th><th>Fastighet</th><th>Adress</th><th>Ort</th><th>Resultat</th></tr></thead><tbody>'+
   (entries.length?entries.map(e=>'<tr><td>'+esc(e.number||'–')+'</td><td>'+esc(e.name||'–')+'</td><td>'+
    esc(e.address||'–')+'</td><td>'+esc(e.city||'–')+'</td><td><span class="property-import-status">'+
    esc(labels[e.status]||e.status)+'</span></td></tr>').join(''):
    '<tr><td colspan="5">Inga fastigheter identifierades.</td></tr>')+'</tbody></table></div>'+
   showIssues(issues)+
   '<div class="property-import-footer"><p class="muted">'+commands.length+
    ' säkra ändringar. Du godkänner alltid innan något sparas.</p>'+
   '<button type="button" class="primary" data-property-save '+((commands.length||entries.length)&&!saving?'':'disabled')+'>'+
    (commands.length?'Importera '+commands.length+' säkra ändringar':'Fastigheterna är klara – gå vidare')+
    '</button></div>';
 }
 function drawObjects(){
  const list=chosen();
  if(!list.length){plan=null;preview.innerHTML='<p class="muted">Välj minst en flik med objekt eller avtalsuppgifter.</p>';return;}
  plan=prepareObjectStage(list,snapshot,{objectLinks:session.objectLinks});
  const {entries,issues,commands,stats}=plan;
  const labels={new:'Nytt objekt',existing:'Finns redan',review:'Behöver åtgärdas'};
  const generated=entries.some(x=>x.status==='new'&&x.generated);
  preview.innerHTML='<h3>2. Objekt – förhandsgranskning</h3>'+
   summary([['Identifierade objekt',stats.found],['Nya',stats.new],
    ['Föreslagna nummer',stats.generated],['Finns redan',stats.existing],
    ['Osäkra objekt',stats.review],['Osäkra uppgifter',stats.issues]])+
   (generated?'<div class="property-import-notice" role="note">'+esc(generatedObjectMessage)+'</div>':'')+
   '<p class="muted">Ett objekt kopplas alltid till en identifierad fastighet. Där objektsnummer saknas skapas ett förslag per unikt avtal; inget avtal importeras i detta steg.</p>'+
   '<div class="property-import-table"><table><thead><tr><th>Fastighet</th><th>Objektsnummer</th><th>Avtal i filen</th><th>Area</th><th>Resultat</th></tr></thead><tbody>'+
   (entries.length?entries.map(e=>'<tr><td>'+esc(e.propertyNumber||e.propertyName||'–')+'</td><td>'+
    esc(e.objectNumber||'–')+(e.generated?'<small class="muted">Föreslaget</small>':'')+
    '</td><td>'+esc(e.agreementNumber||'–')+'</td><td>'+esc(e.area==null?'–':e.area+' m²')+
    '</td><td><span class="property-import-status">'+esc(labels[e.status]||e.status)+'</span></td></tr>').join(''):
    '<tr><td colspan="5">Inga objekt kunde identifieras. Välj en annan flik eller fil.</td></tr>')+'</tbody></table></div>'+
   showIssues(issues)+
   '<div class="property-import-footer"><p class="muted">'+commands.length+
    ' säkra nya objekt. Avtal och hyresgäster skapas inte ännu.</p>'+
   '<button type="button" class="primary" data-object-save '+((commands.length||entries.some(x=>x.status==='existing'))&&!saving?'':'disabled')+
    '>'+(commands.length?'Importera '+commands.length+' säkra objekt':'Objekten är klara – gå vidare')+'</button></div>';
 }
 function draw(){
  drawProgress();drawSource();drawTabs();
  if(session.stage==='choose-objects'||session.stage==='objects-done'){plan=null;preview.innerHTML='';return;}
  if(!session.book.length){plan=null;preview.innerHTML='<p class="muted">Välj en fil för att börja.</p>';return;}
  if(currentStage()==='objects')drawObjects();else drawProperties();
 }
 async function readFile(file){
  if(!file)return;
  if(file.size>15*1024*1024)throw Error('Filen är för stor (högst 15 MB).');
  let book;
  if(/\.csv$/i.test(file.name))book=[{name:'CSV',rows:readCsv(await file.text())}];
  else{
   if(!globalThis.XLSX)throw Error('Excelbiblioteket kunde inte läsas.');
   const wb=globalThis.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
   book=importableSheetNames(wb.SheetNames)
    .map(name=>({name,rows:globalThis.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''})}));
  }
  if(!book.length)throw Error('Filen saknar flikar som kan importeras.');
  // Only replace the workbook after successful parsing. All sheets remain
  // private in this browser session; no source data is sent to the server.
  session.book=book;session.fileName=file.name;session.selected=defaultSheets(book);
  if(session.propertiesDone)session.stage='objects';
  else {session.stage='properties';session.objectLinks={};session.objectsDone=false;}
  draw();
 }
 source.addEventListener('change',async event=>{
  if(!event.target.matches('[data-property-file]'))return;
  try{await readFile(event.target.files?.[0]);}
  catch(error){preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">'+esc(error.message)+'</p>');}
 });
 source.addEventListener('click',event=>{
  if(event.target.closest('[data-new-object-file]')){fileInput?.click();return;}
  if(event.target.closest('[data-continue-objects]')){
   if(!session.book.length){fileInput?.click();return;}
   session.stage='objects';draw();
  }
 });
 tabs.addEventListener('change',event=>{
  const input=event.target.closest('[data-property-sheet]');if(!input)return;
  const chosenSheet=session.book[Number(input.dataset.propertySheet)];if(!chosenSheet)return;
  if(input.checked)session.selected=[...new Set([...session.selected,chosenSheet.name])];
  else session.selected=session.selected.filter(name=>name!==chosenSheet.name);
  draw();
 });
 async function persist(commands){
  let saved=0;const failed=[],savedCommands=[];
  for(let i=0;i<commands.length;i+=100){
   const batch=commands.slice(i,i+100);
   try{await apply(batch);saved+=batch.length;savedCommands.push(...batch);}
   catch(error){
    // Do not repeat a potentially committed transaction after a transport error.
    if(!/^Importfel\b/i.test(String(error.message||'')))throw Object.assign(error,{saved,savedCommands,failed});
    for(const command of batch){
     try{await apply([command]);saved++;savedCommands.push(command);}
     catch(cause){failed.push({command,message:cause.message||'Kunde inte spara posten'});}
    }
   }
  }
  return {saved,failed,savedCommands};
 }
 preview.addEventListener('click',async event=>{
  const property=Boolean(event.target.closest('[data-property-save]'));
  const object=Boolean(event.target.closest('[data-object-save]'));
  if(!property&&!object||saving||!plan)return;
  const commands=plan.commands.slice(),stage=object?'objects':'properties';
  if(!commands.length&&!property&&!plan.entries.some(e=>e.status==='existing'))return;
  const question=commands.length?
   'Importera '+commands.length+' säkra '+(object?'objekt':'fastighetsändringar')+
   ' från '+session.fileName+'? Osäkra uppgifter hoppas över.':
   (object?'Objekten finns redan. Markera objektsteget som klart utan att skriva några ändringar?':
    'Fastigheterna finns redan. Fortsätta till objekt utan att skriva några ändringar?');
  if(!window.confirm(question))return;
  if(!commands.length){
   onSaved({stage,saved:0,failed:[],issues:plan.issues.length,
    objectLinks:object?plan.objectLinks:{}});
   return;
  }
  saving=true;
  const approved=plan;draw();
  try{
   const result=await persist(commands);
   if(result.saved){
    const links={};
    if(object)for(const entry of approved.entries){
     if(!entry.id||!entry.agreementNumbers?.length)continue;
     if(entry.status!=='existing'&&!result.savedCommands.some(c=>c.id===entry.id))continue;
     for(const agreement of entry.agreementNumbers)
      links[entry.propertyId+'|'+String(agreement).trim().toLocaleLowerCase('sv').replace(/\s+/g,' ')]=entry.id;
    }
    onSaved({stage,saved:result.saved,failed:result.failed,issues:approved.issues.length,objectLinks:links});
    return;
   }
   preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">Inga ändringar kunde sparas. '+
    esc(result.failed[0]?.message||'Kontrollera uppgifterna.')+'</p>');
  }catch(error){
   if(error.saved){
    onSaved({stage,saved:error.saved,failed:[...error.failed,{message:error.message}],
     issues:approved.issues.length,objectLinks:{}});
    return;
   }
   preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">Importen kunde inte slutföras: '+
    esc(error.message)+'. Kontrollera uppgifterna innan du försöker igen.</p>');
  }finally{saving=false;}
 });
 draw();
}

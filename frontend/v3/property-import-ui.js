// Guided import: a workbook stays in memory throughout property -> object review.
// The file is never uploaded or persisted in browser storage.
import {readCsv,importableSheetNames} from './import.js';
import {preparePropertyStage} from './property-stage.js';
import {prepareObjectStage,generatedObjectMessage} from './object-stage.js';
import {prepareAgreementStage} from './agreement-stage.js';
import {preparePeopleStage} from './people-stage.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v??'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const defaultSheets=book=>{
 const preferred=new Set(['lokallista','lokalbestand','fastighetslista','lokaldata']);
 const selected=book.filter(s=>preferred.has(key(s.name))).map(s=>s.name);
 return selected.length?selected:book.slice(0,1).map(s=>s.name);
};
const stages=[['Fastigheter','properties'],['Objekt','objects'],['Avtal','agreements'],['Hyresgäster & personer','people']];
const ensureSession=session=>{
 const state=session||{};
 state.book??=[];state.selected??=[];state.fileName??='';
 state.stage??='properties';state.propertiesDone??=false;state.objectsDone??=false;
 state.agreementsDone??=false;state.peopleDone??=false;
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
 const currentStage=()=>{
  if(['choose-objects','properties'].includes(session.stage))return 'properties';
  if(['objects','objects-done','choose-agreements'].includes(session.stage))return 'objects';
  if(['agreements','choose-people'].includes(session.stage))return 'agreements';
  return 'people';
 };
 const done=stage=>stage==='properties'?session.propertiesDone:stage==='objects'?session.objectsDone:
  stage==='agreements'?session.agreementsDone:session.peopleDone;
 function drawProgress(){
  const active=currentStage();
  progress.innerHTML=stages.map(([label,stage],i)=>{
   const completed=done(stage),isActive=stage===active&&!completed;
   const isNext=!completed&&!isActive&&i===stages.findIndex(([,s])=>!done(s));
   const cls=completed?'is-done':isActive?'is-current':isNext?'is-next':'is-pending';
   const status=completed?'Klart':isActive?'Pågår':isNext?'Nästa steg':'Kommer sedan';
   return '<li class="'+cls+'" '+(isActive?'aria-current="step"':'')+
    '><span class="property-import-step-number">'+(completed?'✓':i+1)+
    '</span><strong>'+label+'</strong><small>'+status+'</small></li>';
  }).join('');
 }
 const promptStep=(label,nextLabel,keyName,result)=>'<div class="property-import-done" role="status">'+
  '<strong>'+label+' – klart.</strong> '+(result?.saved??0)+' säkra ändringar sparades.'+
  (result?.failed?.length?' '+result.failed.length+' behöver kontrolleras.':'')+'</div>'+
  '<div class="property-import-choice"><strong>Vill du fortsätta med '+nextLabel+'?</strong>'+
   '<p class="muted">Filen '+esc(session.fileName)+' finns kvar. Fortsätt från de valda flikarna eller välj en annan fil för nästa steg.</p>'+
   '<div class="property-import-choice-buttons">'+
   '<button type="button" class="primary" data-import-continue="'+keyName+'"'+(keyName==='objects'?' data-continue-objects':'')+'>Fortsätt med '+nextLabel+' från importerad fil</button>'+
   '<button type="button" class="secondary" data-import-new-file '+(keyName==='objects'?'data-new-object-file':'')+'>Ladda upp ny fil</button></div></div>';
 function drawSource(){
  const asking=['choose-objects','objects-done','choose-agreements','choose-people'].includes(session.stage);
  const finished=session.stage==='complete';
  const steps={
   'choose-objects':['Fastigheter','objekt','objects',session.propertyResult],
   'objects-done':['Objekt','avtal','agreements',session.objectResult],
   'choose-agreements':['Objekt','avtal','agreements',session.objectResult],
   'choose-people':['Avtal','hyresgäster, parter och personer','people',session.agreementResult]
  };
  const p=steps[session.stage];
  source.innerHTML=(p?promptStep(...p):'')+
   (finished?'<div class="property-import-done" role="status"><strong>Importen är genomgången.</strong> Fastigheter, objekt, avtal, parter och personer har granskats i tur och ordning. Osäkra uppgifter kan åtgärdas separat.</div>'+
    '<button type="button" class="secondary" data-import-restart>Starta ny import</button>':'')+
   (session.book.length&&!asking&&!finished?
    '<p class="property-import-source-name"><strong>Vald fil:</strong> '+esc(session.fileName)+'</p>':'')+
   (!asking&&!finished?
    '<label class="property-import-file">'+(currentStage()==='properties'?'Välj Excel- eller CSV-fil':
     'Använd annan fil för '+({objects:'objekt',agreements:'avtal',people:'parter och personer'})[currentStage()])+
     '<input data-property-file type="file" accept=".xlsx,.xls,.csv,text/csv"></label>':
    '<input data-property-file class="sr-only" type="file" accept=".xlsx,.xls,.csv,text/csv" aria-label="Ladda upp ny fil">');
  fileInput=source.querySelector('[data-property-file]');
 }
 function drawTabs(){
  if(!session.book.length||['choose-objects','objects-done','choose-agreements','choose-people','complete'].includes(session.stage)){
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
 function drawAgreements(){
  const list=chosen();
  if(!list.length){plan=null;preview.innerHTML='<p class="muted">Välj minst en flik med avtalsuppgifter.</p>';return;}
  plan=prepareAgreementStage(list,snapshot,{objectLinks:session.objectLinks});
  const {entries,issues,commands,stats}=plan;
  preview.innerHTML='<h3>3. Avtal – förhandsgranskning</h3>'+
   summary([['Identifierade avtal',stats.found],['Nya',stats.new],['Finns redan',stats.existing],
    ['Behöver åtgärdas',stats.review],['Säkra hyresposter',stats.prices],['Osäkra uppgifter',stats.issues]])+
   '<p class="muted">Avtal kopplas till rätt objekt och fastighet. Hyresposter läses in separat när belopp, startdatum och eventuella indexvillkor är säkra. Befintliga avtalsvillkor ändras inte.</p>'+
   '<div class="property-import-table"><table><thead><tr><th>Fastighet</th><th>Objekt</th><th>Avtal</th><th>Fr.o.m.</th><th>Status</th></tr></thead><tbody>'+
   (entries.length?entries.map(e=>'<tr><td>'+esc(e.propertyNumber||'–')+'</td><td>'+esc(e.objectNumber||'–')+
    '</td><td>'+esc(e.agreementNumber||'–')+'</td><td>'+esc(e.validFrom||'–')+'</td><td>'+
    esc(e.status==='new'?'Nytt avtal':e.status==='existing'?'Finns redan':e.reason||'Behöver åtgärdas')+'</td></tr>').join(''):
    '<tr><td colspan="5">Inga avtalsrader kunde identifieras.</td></tr>')+'</tbody></table></div>'+
   showIssues(issues)+
   '<div class="property-import-footer"><p class="muted">'+commands.length+' säkra åtgärder, varav '+
    stats.prices+' hyresposter. Inget sparas utan godkännande.</p>'+
   '<button type="button" class="primary" data-agreement-save '+(!saving?'':'disabled')+'>'+
    (commands.length?'Importera '+commands.length+' säkra avtalsuppgifter':'Inga säkra nya avtal – gå vidare')+
   '</button></div>';
 }
 function drawPeople(){
  const list=chosen();
  if(!list.length){plan=null;preview.innerHTML='<p class="muted">Välj minst en flik med uppgifter om hyresgäster, parter eller personer.</p>';return;}
  plan=preparePeopleStage(list,snapshot);
  const {entries,issues,commands,stats}=plan;
  preview.innerHTML='<h3>4. Hyresgäster, parter och personer – förhandsgranskning</h3>'+
   summary([['Källrader',stats.found],['Nya parter',stats.parties],['Nya personer',stats.people],
    ['Person–part-kopplingar',stats.memberships],['Ansvarskopplingar',stats.roles],
    ['Osäkra uppgifter',stats.issues]])+
   '<p class="muted">Hyresgäster kopplas till avtal, fastighetsägare och lokalsamordnare till fastigheter, och personer till verifierade organisationer. Inga befintliga ansvar eller kontaktuppgifter skrivs över.</p>'+
   '<div class="property-import-table"><table><thead><tr><th>Fastighet</th><th>Avtal</th><th>Hyresgäst</th><th>Fastighetsägare</th><th>Parter</th></tr></thead><tbody>'+
   (entries.length?entries.map(e=>'<tr><td>'+esc(e.propertyNumber||'–')+'</td><td>'+esc(e.agreementNumber||'–')+
    '</td><td>'+esc(e.tenant||'–')+'</td><td>'+esc(e.owner||'–')+'</td><td>'+
    esc(e.parties.join(', ')||'–')+'</td></tr>').join(''):
    '<tr><td colspan="5">Inga säkra parter eller personuppgifter kunde identifieras.</td></tr>')+'</tbody></table></div>'+
   showIssues(issues)+
   '<div class="property-import-footer"><p class="muted">'+commands.length+
    ' säkra åtgärder. Osäkra relationer och personkopplingar lämnas för åtgärd.</p>'+
   '<button type="button" class="primary" data-people-save '+(!saving?'':'disabled')+'>'+
    (commands.length?'Importera '+commands.length+' säkra kopplingar':'Slutför granskningen utan ändringar')+'</button></div>';
 }
 function draw(){
  drawProgress();drawSource();drawTabs();
  if(['choose-objects','objects-done','choose-agreements','choose-people','complete'].includes(session.stage)){
   plan=null;preview.innerHTML='';return;
  }
  if(!session.book.length){plan=null;preview.innerHTML='<p class="muted">Välj en fil för att börja.</p>';return;}
  if(currentStage()==='objects')drawObjects();
  else if(currentStage()==='agreements')drawAgreements();
  else if(currentStage()==='people')drawPeople();
  else drawProperties();
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
  if(session.agreementsDone)session.stage='people';
  else if(session.objectsDone)session.stage='agreements';
  else if(session.propertiesDone)session.stage='objects';
  else {session.stage='properties';session.objectLinks={};session.objectsDone=false;}
  draw();
 }
 source.addEventListener('change',async event=>{
  if(!event.target.matches('[data-property-file]'))return;
  try{await readFile(event.target.files?.[0]);}
  catch(error){preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">'+esc(error.message)+'</p>');}
 });
 source.addEventListener('click',event=>{
  if(event.target.closest('[data-import-new-file]')){fileInput?.click();return;}
  const next=event.target.closest('[data-import-continue]')?.dataset.importContinue;
  if(next){
   if(!session.book.length){fileInput?.click();return;}
   session.stage=next;draw();return;
  }
  if(event.target.closest('[data-import-restart]')){
   session.book=[];session.selected=[];session.fileName='';session.stage='properties';
   session.propertiesDone=false;session.objectsDone=false;session.agreementsDone=false;
   session.peopleDone=false;session.objectLinks={};session.propertyResult=null;
   session.objectResult=null;session.agreementResult=null;session.peopleResult=null;
   draw();
  }
 });
 tabs.addEventListener('change',event=>{
  const input=event.target.closest('[data-property-sheet]');if(!input)return;
  const chosenSheet=session.book[Number(input.dataset.propertySheet)];if(!chosenSheet)return;
  if(input.checked)session.selected=[...new Set([...session.selected,chosenSheet.name])];
  else session.selected=session.selected.filter(name=>name!==chosenSheet.name);
  draw();
 });
 async function persist(units){
  let saved=0;const failed=[],savedCommands=[],completed=new Set(),blocked=new Set();
  // Group independent commands for speed. A failed database batch is
  // rolled back, then retried per logical unit, never per dependent command.
  const chunks=[];let pending=[],size=0;
  for(const item of units){
   if(size+item.commands.length>80&&pending.length){chunks.push(pending);pending=[];size=0;}
   pending.push(item);size+=item.commands.length;
  }
  if(pending.length)chunks.push(pending);
  for(const chunk of chunks){
   const run=chunk.filter(u=>!(u.dependsOn||[]).some(d=>blocked.has(d)));
   if(!run.length)continue;
   try{
    const all=run.flatMap(u=>u.commands);
    await apply(all);saved+=all.length;savedCommands.push(...all);
    for(const u of run)completed.add(u.key);
   }catch(error){
    // An unknown transport error may follow a successful commit. Never
    // blindly retry a write if we cannot prove that it was rolled back.
    if(!/^Importfel\b/i.test(String(error.message||'')))
     throw Object.assign(error,{saved,savedCommands,failed});
    for(const u of run){
     if((u.dependsOn||[]).some(dep=>blocked.has(dep))){
      blocked.add(u.key);
      failed.push({unit:u,message:'Beroende uppgift kunde inte importeras.',sheet:u.sheet,row:u.row});
      continue;
     }
     try{
      await apply(u.commands);
      saved+=u.commands.length;savedCommands.push(...u.commands);completed.add(u.key);
     }catch(cause){
      blocked.add(u.key);failed.push({unit:u,message:cause.message||'Kunde inte spara raden',
       sheet:u.sheet,row:u.row});
     }
    }
   }
  }
  return {saved,failed,savedCommands,completed:[...completed]};
 }
 preview.addEventListener('click',async event=>{
  const clicked=event.target.closest('[data-property-save],[data-object-save],[data-agreement-save],[data-people-save]');
  if(!clicked||saving||!plan)return;
  const stage=clicked.hasAttribute('data-object-save')?'objects':
   clicked.hasAttribute('data-agreement-save')?'agreements':
   clicked.hasAttribute('data-people-save')?'people':'properties';
  const approved=plan;
  const units=plan.units||plan.commands.map((command,i)=>({
   key:stage+':'+i,commands:[command],dependsOn:[],sheet:'',row:command.sourceRow
  }));
  const commands=plan.commands;
  const label=({properties:'fastighetsuppgifter',objects:'objekt',agreements:'avtalsuppgifter',
   people:'parter och personkopplingar'})[stage];
  const question=commands.length?
   'Importera '+commands.length+' säkra '+label+' från '+session.fileName+
   '? Osäkra uppgifter hoppas över.':
   'Inga nya säkra '+label+' hittades. Markera steget som genomgånget och fortsätt?';
  if(!window.confirm(question))return;
  if(!commands.length){
   onSaved({stage,saved:0,failed:[],issues:plan.issues.length,
    objectLinks:stage==='objects'?plan.objectLinks:{}});
   return;
  }
  saving=true;draw();
  try{
   const result=await persist(units);
   if(result.saved){
    const links={};
    if(stage==='objects')for(const entry of approved.entries){
     if(!entry.id||!entry.agreementNumbers?.length)continue;
     if(entry.status!=='existing'&&!result.savedCommands.some(c=>c.id===entry.id))continue;
     for(const agreement of entry.agreementNumbers)
      links[entry.propertyId+'|'+String(agreement).trim().toLocaleLowerCase('sv').replace(/\s+/g,' ')]=entry.id;
    }
    onSaved({stage,saved:result.saved,failed:result.failed,issues:approved.issues.length,
     objectLinks:links});
    return;
   }
   preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">Inga ändringar kunde sparas. '+
    esc(result.failed[0]?.message||'Kontrollera uppgifterna.')+'</p>');
  }catch(error){
   if(error.saved){
    onSaved({stage,saved:error.saved,failed:[...(error.failed||[]),{message:error.message}],
     issues:approved.issues.length,objectLinks:{}});
    return;
   }
   preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">Importen kunde inte slutföras: '+
    esc(error.message)+'. Kontrollera uppgifterna innan du försöker igen.</p>');
  }finally{saving=false;}
 });
 draw();
}

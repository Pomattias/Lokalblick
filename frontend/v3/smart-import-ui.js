// One primary action: import a file. Matching and column inference are automatic.
// Technical register and field selection remain accessible, never mandatory.
import {readCsv} from './import.js';
import {prepareSmartImport,suggestImportMapping,importFieldOptions} from './smart-import.js';
import {coreImportFields} from './core-import.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const coreOptions=importFieldOptions.filter(f=>coreImportFields.includes(f.id));
const opts=(items,value)=>items.map(x=>'<option value="'+esc(x.id)+'"'+(value===x.id?' selected':'')+'>'+esc(x.label)+'</option>').join('');
export function mountSmartImport(root,{snapshot,apply}){
 const shell=document.createElement('section');shell.className='smart-import';
 shell.innerHTML='<div class="smart-import-header"><h3>Importera från Excel eller CSV</h3>'+
  '<p class="muted">Endast fastigheter, objekt, avtal och hyresgäster importeras. Kontaktpersoner, gamla ärenden, kostnader, priser och årssummeringar sparas inte. Du får granska alla kopplingar innan något ändras.</p></div>'+
  '<label class="smart-import-drop"><span class="smart-import-icon">⇧</span><strong>Välj fil att importera</strong>'+
  '<span>Excel (.xlsx, .xls) eller CSV · Max 15 MB</span><input data-smart-file type="file" accept=".xlsx,.xls,.csv,text/csv"></label>'+
  '<section data-smart-results aria-live="polite"></section>';


 root.append(shell);
 const fileInput=shell.querySelector('[data-smart-file]'),results=shell.querySelector('[data-smart-results]');
 let book=[],active=null,overrides={},objectChoices={},mapping=null,filter='review',plan=null,fileName='',locked=false,externalSystem='';
 const current=()=>book.find(s=>s.name===active);
 const mapped=()=>suggestImportMapping((current()?.rows?.[0]||[]),overrides).map(f=>coreImportFields.includes(f)?f:'');
 function analyze(){
  const chosen=current();if(!chosen)return;
  const raw=chosen.rows||[],headers=raw[0]||[],rows=raw.slice(1).filter(r=>r.some(c=>String(c??'').trim()));
  mapping=mapped();
  plan=prepareSmartImport({headers,rows},snapshot,{mapping,objectChoices,ignoredColumns:Object.keys(overrides).filter(k=>overrides[k]==='').map(Number),defaultExternalSystem:externalSystem,scope:'core'});
  if(rows.length>200)plan.errors.push('Filen innehåller fler än 200 rader. Dela upp den.');
  if(plan.commands.length>200)plan.errors.push('Fler än 200 åtgärder i transaktionen. Dela upp filen.');
  // With nothing to resolve, show the approved/new rows instead of an empty review list.
  if(plan.stats.review===0&&filter==='review')filter='all';
  draw();
 }
 function draw(){
  if(!plan)return;
  const selected=current(),total=plan.records.length;
  const header=selected.rows[0]||[],matched=plan.mapping.filter(Boolean).length;
  const needsSystem=false; // No additional data sources in the restricted import.
  const choices=book.map(s=>({id:s.name,label:s.name}));
  const labels={matched:'Oförändrad',new:'Ny eller kompletterad',review:'Behöver kontrolleras'};
  const visible=plan.records.filter(r=>filter==='all'||r.status==='review');
  const advanced='<details data-smart-advanced><summary>Ändra kolumner och källdata · '+matched+'/'+header.length+' identifierade</summary>'+
   '<p class="muted">Varje källkolumn mappas till exakt ett registerfält. Ändring räknar om hela importen omedelbart.</p>'+
   '<div class="smart-import-mapping">'+header.map((h,i)=>
    '<label><span>'+esc(h||'Kolumn '+(i+1))+'</span><select data-smart-map="'+i+'">'+
     opts([{id:'',label:'Importera ej'},...coreOptions],plan.mapping[i])+'</select></label>').join('')+
   '</div></details>';
  results.innerHTML='<div class="smart-import-step"><span>1. Fil</span><strong>'+esc(fileName)+'</strong>'+
   '<label>Flik<select data-smart-sheet>'+opts(choices,active)+'</select></label></div>'+
   '<div class="smart-import-step"><span>2. Granska</span><strong>Så tolkar Lokalblick filen</strong></div>'+
   (plan.excludedColumns?.length?'<p class="muted">Importeras inte: '+plan.excludedColumns.length+' kolumner ('+esc(plan.excludedColumns.map(i=>header[Number(i)]||'Kolumn '+(Number(i)+1)).join(', '))+').</p>':'')+
   '<div class="smart-import-stats">'+
    [['matched',plan.stats.matched,'Oförändrade'],['new',plan.stats.created,'Nya/kopplade'],['review',plan.stats.review,'Att kontrollera']].map(([k,n,label])=>
     '<div><strong>'+n+'</strong><span>'+label+'</span></div>').join('')+'</div>'+
   (plan.errors.length?'<p class="smart-import-warning" role="alert">'+esc(plan.errors.length+' frågor behöver lösas innan importen kan sparas.')+'</p>':
    '<p class="muted">Säkra nummer och relationer har matchats automatiskt. Inga befintliga priser eller ansvar skrivs över.</p>')+
   '<div class="smart-import-toolbar"><strong>Rader · '+total+'</strong><div>'+
    '<button type="button" class="secondary" data-smart-filter="review" aria-pressed="'+(filter==='review')+'">Att kontrollera ('+plan.stats.review+')</button>'+
    '<button type="button" class="secondary" data-smart-filter="all" aria-pressed="'+(filter==='all')+'">Alla ('+total+')</button></div></div>'+
   '<div class="smart-import-list">'+(visible.length?visible.map(r=>{
    const candidates=r.candidates||[],picked=objectChoices[r.index]||r.objectId||'';
    const actionControl=r.status==='review'&&r.propertyId&&r.agreementNumber&&/Objekt kan inte avgöras säkert/.test(r.reason)?
     '<label>Objektkoppling<select data-smart-object="'+r.index+'">'+
      opts([{id:'',label:'Välj objekt…'},...candidates.map(o=>({id:o.id,label:o.number})),{id:'@new',label:'+ Skapa nytt objekt'}],picked)+'</select></label>':'';
    const warnings=r.warnings?.length?'<small class="muted">'+esc(r.warnings.join(' · '))+'</small>':'';
    const relationItems=[
     ...(r.objectId?[['Objekt',r.objectNumber||candidates.find(o=>o.id===r.objectId)?.number||'–','Fastighet '+r.propertyNumber]]:[]),
     ...(r.agreementNumber&&r.objectId?[['Avtal',r.agreementNumber,'Objekt '+(r.objectNumber||candidates.find(o=>o.id===r.objectId)?.number||'–')]]:[]),
     ...(r.relationships||[]).map(x=>[x.label,x.name,x.target])
    ];
    const facts=relationItems.map(x=>'<div><strong>'+esc(x[0])+'</strong> '+esc(x[1])+' → '+esc(x[2])+'</div>').join('')+
     (r.pricePreview||[]).map(p=>'<div><strong>'+esc(p.label)+'</strong> '+esc(p.amount)+' kr/år · basår '+esc(p.baseYear)+'</div>').join('');
    const details=facts?'<details class="smart-import-relations"><summary>Visa kopplingar och priser</summary>'+facts+'</details>':'';
    return '<article class="smart-import-row smart-import-'+r.status+'"><div><span class="smart-import-num">Rad '+r.sourceRow+'</span>'+
     '<strong>'+esc(r.agreementNumber||r.propertyName||r.propertyNumber||'Post')+'</strong>'+
     '<span class="smart-import-meta">Fastighet '+esc(r.propertyNumber||'–')+' · Objekt '+esc(r.objectNumber||r.objectId&&candidates.find(o=>o.id===r.objectId)?.number||'–')+'</span>'+
     '<span class="smart-import-meta">'+esc(r.reason||r.description)+'</span>'+warnings+details+'</div>'+
     '<div class="smart-import-row-end"><span class="smart-import-status">'+labels[r.status]+'</span>'+actionControl+'</div></article>';
   }).join(''):'<p class="muted smart-import-empty">Inga rader behöver granskas. Du kan visa alla för att se matchningarna.</p>')+
   '</div>'+advanced+
   '<div class="smart-import-step"><span>3. Bekräfta</span><strong>'+plan.commands.length+' åtgärder i fyra register</strong></div>'+
   '<p class="muted">'+esc(Object.entries({Fastigheter:plan.commands.filter(x=>x.action==='createProperty').length,Objekt:plan.commands.filter(x=>x.action==='createObject').length,Avtal:plan.commands.filter(x=>x.action==='createAgreement').length,Hyresgäster:plan.commands.filter(x=>x.action==='createParty'||x.action==='updateParty'||x.action==='setRole').length}).map(([k,n])=>k+': '+n).join(' · '))+'</p>'+
   '<p class="muted">Alla åtgärder sparas i en transaktion. Vid fel sparas ingenting. Befintliga avtalsvillkor behålls.</p>'+
   '<button type="button" class="primary" data-smart-save '+(plan.errors.length||!plan.commands.length?'disabled':'')+'>Bekräfta '+plan.commands.length+' ändringar</button>';
  if(results.dataset.showAdvanced==='1')results.querySelector('[data-smart-advanced]').open=true;
 }
 async function readFile(){
  const file=fileInput.files?.[0];if(!file)return;
  if(file.size>15*1024*1024){results.innerHTML='<p class="smart-import-warning">Filen är större än 15 MB.</p>';return;}
  fileName=file.name;
  try{
   if(/\.csv$/i.test(file.name))book=[{name:'CSV',rows:readCsv(await file.text())}];
   else{
    if(!globalThis.XLSX)throw Error('Excelbiblioteket kunde inte läsas.');
    const wb=globalThis.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const hasMaster=wb.SheetNames.some(n=>norm(n)==='lokallista');
    book=wb.SheetNames.filter(n=>!(hasMaster&&['sf','ext'].includes(norm(n))))
     .map(name=>({name,rows:globalThis.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''})}));
   }
   const ranked=book.map(s=>({...s,score:(s.rows?.[0]||[]).filter(h=>coreImportFields.includes(suggestImportMapping([h])[0])).length})).sort((a,b)=>b.score-a.score);
   active=ranked[0]?.name||null;
   if(!active)throw Error('Inga läsbara flikar i filen.');
   overrides={};objectChoices={};externalSystem='';filter='review';results.dataset.showAdvanced='0';
   analyze();
  }catch(error){results.innerHTML='<p class="smart-import-warning" role="alert">'+esc(error.message)+'</p>'}
 }
 fileInput.addEventListener('change',readFile);
 results.addEventListener('change',event=>{
  if(event.target.matches('[data-smart-source-system]')){externalSystem=event.target.value.trim();analyze();return;}
  if(event.target.matches('[data-smart-sheet]')){
   active=event.target.value;overrides={};objectChoices={};externalSystem='';filter='review';results.dataset.showAdvanced='0';analyze();
  }else if(event.target.matches('[data-smart-map]')){
   const column=Number(event.target.dataset.smartMap);overrides[column]=event.target.value;
   results.dataset.showAdvanced='1';analyze();
  }else if(event.target.matches('[data-smart-object]')){
   const row=Number(event.target.dataset.smartObject);if(event.target.value)objectChoices[row]=event.target.value;
   else delete objectChoices[row];analyze();
  }
 });
 results.addEventListener('click',async event=>{
  const button=event.target.closest('[data-smart-filter]');
  if(button){filter=button.dataset.smartFilter;draw();return;}
  if(!event.target.closest('[data-smart-save]')||locked||!plan||plan.errors.length||!plan.commands.length)return;
  if(!window.confirm('Spara '+plan.commands.length+' granskade ändringar från '+fileName+'?'))return;
  locked=true;const commands=plan.commands;
  try{
   await apply(commands);
   results.innerHTML='<p class="smart-import-success">Importen har sparats. '+commands.length+' ändringar genomfördes i samma transaktion.</p>';
  }catch(error){
   results.insertAdjacentHTML('afterbegin','<p class="smart-import-warning" role="alert">Importen avbröts. Inga ändringar sparades. '+esc(error.message)+'</p>');
  }finally{locked=false;}
 });
}

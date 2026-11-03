// Guided import, step 1: properties. Later stages deliberately stay separate.
import {readCsv,importableSheetNames} from './import.js';
import {preparePropertyStage} from './property-stage.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v??'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const initialSheets=book=>{
 const preferred=new Set(['lokallista','lokalbestand','fastighetslista','lokaldata']);
 const selected=book.filter(s=>preferred.has(key(s.name))).map(s=>s.name);
 return new Set(selected.length?selected:book.slice(0,1).map(s=>s.name));
};
export function mountPropertyImport(root,{snapshot,apply,onSaved=()=>{},completed=null}){
 const shell=document.createElement('section');shell.className='property-import';
 shell.innerHTML='<h3>Importera från Excel eller CSV</h3>'+
  '<p class="muted">Fyra tydliga steg. Just nu arbetar vi med fastigheter: välj flikar, kontrollera listan och importera det som är säkert. Objekt, avtal och hyresgäster kommer i följande steg.</p>'+
  '<ol class="property-import-steps" aria-label="Importens steg">'+
  '<li class="'+(completed?'is-done':'is-current')+'"><span class="property-import-step-number">'+(completed?'✓':'1')+'</span><strong>Fastigheter</strong><small>'+(completed?'Klart':'Pågår')+'</small></li>'+
  '<li class="'+(completed?'is-next':'is-pending')+'"><span class="property-import-step-number">2</span><strong>Objekt</strong><small>'+(completed?'Nästa steg':'Kommer sedan')+'</small></li>'+
  '<li class="is-pending"><span class="property-import-step-number">3</span><strong>Avtal</strong><small>Kommer sedan</small></li>'+
  '<li class="is-pending"><span class="property-import-step-number">4</span><strong>Hyresgäster</strong><small>Kommer sedan</small></li></ol>'+
  (completed?'<div class="property-import-done" role="status"><strong>Fastigheter – import genomförd.</strong> '+completed.saved+' säkra ändringar sparades.'+
    (completed.failed?.length?' '+completed.failed.length+' ändringar kunde inte sparas och behöver kontrolleras.':'')+
    ' Nästa del av flödet blir Objekt, där vi visar och vid behov föreslår objektsnummer före import.</div>':'')+
  '<label class="property-import-file">Välj Excel- eller CSV-fil <input data-property-file type="file" accept=".xlsx,.xls,.csv,text/csv"></label>'+
  '<div data-property-sheets></div><div data-property-preview aria-live="polite"></div>';
 root.append(shell);
 const fileInput=shell.querySelector('[data-property-file]'),tabs=shell.querySelector('[data-property-sheets]'),
  preview=shell.querySelector('[data-property-preview]');
 let book=[],selected=new Set(),plan=null,fileName='',saving=false;
 function draw(){
  if(!book.length)return;
  tabs.innerHTML='<fieldset class="property-import-sheets"><legend>Flikar som används vid sammanställningen</legend>'+
   '<div>'+book.map((s,i)=>'<label><input type="checkbox" data-property-sheet="'+i+'" '+
    (selected.has(s.name)?'checked':'')+'> '+esc(s.name)+'</label>').join('')+'</div></fieldset>';
  const chosen=book.filter(s=>selected.has(s.name));
  if(!chosen.length){plan=null;preview.innerHTML='<p class="muted">Välj minst en flik för att se fastigheterna.</p>';return;}
  plan=preparePropertyStage(chosen,snapshot);
  const {entries,issues,stats,commands}=plan;
  const labels={new:'Ny fastighet',update:'Kompletteras',existing:'Finns redan',review:'Behöver åtgärdas'};
  preview.innerHTML='<h3>1. Fastigheter – förhandsgranskning</h3>'+
   '<div class="property-import-stats">'+
    [['Identifierade fastigheter',stats.found],['Nya',stats.new],['Kompletteras',stats.enriched],
     ['Finns redan',stats.existing],['Osäkra fastigheter',stats.review],['Osäkra uppgifter',stats.issues]]
     .map(([label,n])=>'<div><strong>'+n+'</strong><span>'+label+'</span></div>').join('')+'</div>'+
   '<p class="muted">Alla fastigheter i listan visas före import. Endast nya eller säkert kompletterade uppgifter sparas. Befintliga värden skrivs inte över.</p>'+
   '<div class="property-import-table"><table><thead><tr><th>FörvaltningsNr</th><th>Fastighet</th><th>Adress</th><th>Ort</th><th>Resultat</th></tr></thead><tbody>'+
    (entries.length?entries.map(e=>'<tr><td>'+esc(e.number||'–')+'</td><td>'+esc(e.name||'–')+
     '</td><td>'+esc(e.address||'–')+'</td><td>'+esc(e.city||'–')+
     '</td><td><span class="property-import-status">'+esc(labels[e.status]||e.status)+'</span></td></tr>').join(''):
     '<tr><td colspan="5">Inga fastigheter kunde identifieras i de valda flikarna.</td></tr>')+
   '</tbody></table></div>'+
   '<section class="property-import-issues"><h4>Behöver åtgärdas · '+issues.length+'</h4>'+
    '<p class="muted">Dessa uppgifter hoppas över eller lämnas oförändrade. Rätta dem i Excel när du vill. Säkra fastigheter går att importera ändå.</p>'+
    (issues.length?'<div class="property-import-table"><table><thead><tr><th>Flik / rad</th><th>Fält</th><th>Information / åtgärd</th></tr></thead><tbody>'+
     issues.map(x=>'<tr><td>'+esc(x.sheet)+' · '+esc(x.row)+'</td><td>'+esc(x.field)+
      '</td><td>'+esc(x.message)+(x.value?'<small class="muted"> Källa: '+esc(x.value.slice(0,120))+'</small>':'')+
      '</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Inga osäkra uppgifter hittades.</p>')+
   '</section>'+
   '<div class="property-import-footer"><p class="muted">'+commands.length+
    ' säkra ändringar är klara. Först efter godkänd import fortsätter vi med objekt och avtalskopplingar.</p>'+
   '<button type="button" class="primary" data-property-save '+(commands.length&&!saving?'':'disabled')+
    '>Importera '+commands.length+' säkra ändringar</button></div>';
 }
 async function readFile(){
  const file=fileInput.files?.[0];if(!file)return;
  fileName=file.name;
  if(file.size>15*1024*1024){preview.innerHTML='<p class="error-text" role="alert">Filen är för stor (högst 15 MB).</p>';return;}
  try{
   if(/\.csv$/i.test(file.name))book=[{name:'CSV',rows:readCsv(await file.text())}];
   else{
    if(!globalThis.XLSX)throw Error('Excelbiblioteket kunde inte läsas.');
    const workbook=globalThis.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    book=importableSheetNames(workbook.SheetNames)
      .map(name=>({name,rows:globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:false,defval:''})}));
   }
   if(!book.length)throw Error('Filen saknar flikar som kan importeras.');
   selected=initialSheets(book);draw();
  }catch(error){preview.innerHTML='<p class="error-text" role="alert">'+esc(error.message)+'</p>';}
 }
 fileInput.addEventListener('change',readFile);
 tabs.addEventListener('change',event=>{
  const input=event.target.closest('[data-property-sheet]');if(!input)return;
  const sheet=book[Number(input.dataset.propertySheet)];if(!sheet)return;
  if(input.checked)selected.add(sheet.name);else selected.delete(sheet.name);
  draw();
 });
 preview.addEventListener('click',async event=>{
  if(!event.target.closest('[data-property-save]')||saving||!plan?.commands?.length)return;
  const commands=plan.commands.slice();
  if(!window.confirm('Importera '+commands.length+' säkra fastighetsändringar från '+fileName+'? Osäkra uppgifter hoppas över.'))return;
  saving=true;draw();
  let saved=0;const failed=[];
  try{
   // Small batches contain unexpected server-side errors; fall back to
   // individual commands, so one bad record cannot prevent safe records.
   for(let offset=0;offset<commands.length;offset+=100){
    const batch=commands.slice(offset,offset+100);
    try{await apply(batch);saved+=batch.length;}
    catch(error){
     // An ambiguous transport failure might mean a committed transaction with a lost reply.
     // Retry only when the API explicitly reports a rolled-back validation error.
     if(!/^Importfel\b/i.test(String(error.message||'')))throw error;
     for(const command of batch){
      try{await apply([command]);saved++;}
      catch(cause){failed.push({command,message:cause.message||'Kunde inte spara posten'});}
     }
    }
   }
   if(saved){
    onSaved({saved,failed,issues:plan.issues.length});
    return;
   }
   preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">Inga ändringar kunde sparas. '+
    esc(failed[0]?.message||'Kontrollera anslutningen.')+'</p>');
  }catch(error){
   if(saved){onSaved({saved,failed:[...failed,{message:error.message}],issues:plan.issues.length});return;}
   preview.insertAdjacentHTML('afterbegin','<p class="error-text" role="alert">Importen stoppades av ett databasfel: '+
    esc(error.message)+'. Uppdatera vyn och kontrollera sparade fastigheter.</p>');
  }finally{saving=false;}
 });
}

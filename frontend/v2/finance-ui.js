import {agreementWithItems,adoptAgreementItems,validateAgreementItems} from '../lokaler/finance-view.js';
import {itemTypes,costCategories,adjustmentMethods,validateFinance} from '../lokaler/finance-model.js';
import {collectWorkspace} from '../lokaler/view-adapter.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:0}).format(Number(n)||0)+' kr';
const choices=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${esc(key)}" ${key===selected?'selected':''}>${esc(label)}</option>`).join('');
const input=(row,key,label,type='text',attrs='')=>`<label class="contract-field"><span class="field-name">${esc(label)}</span><input name="${key}" type="${type}" value="${esc(row[key]??'')}" ${attrs}></label>`;
const select=(row,key,label,values)=>`<label class="contract-field"><span class="field-name">${esc(label)}</span><select name="${key}">${choices(values,row[key])}</select></label>`;
const C=()=>globalThis.LokalblickCalculations,R=()=>globalThis.LokalblickRecurringCosts;
export function agreementItemsPanel(data,contract,year=new Date().getFullYear()){
 contract=agreementWithItems(data,contract);
 const rows=C().agreementItemValues(contract,year,0,data.indexSeries);
 return `<section class="contract-section" data-contract-section="economics" data-finance-panel><div class="section-title"><h3>Hyra och tillägg</h3>${contract.id?`<button type="button" data-item-new="${esc(contract.id)}">Lägg till post</button>`:''}</div>
 <div class="contract-finance-summary"><strong>Aktuell årstakt: ${money(rows.reduce((sum,row)=>sum+row.annualRate,0))}</strong><small>Kalenderår ${year}: ${money(C().agreementYearCost(contract,year,0,data.indexSeries))} · proportionerat efter faktiska datum</small></div>
 <div class="table-wrap"><table><thead><tr><th>Post</th><th>Aktuellt, kr/år</th><th></th></tr></thead><tbody>${rows.map(({item,value,active})=>`<tr data-agreement-item="${esc(item.id)}"><td><strong>${esc(itemTypes[item.type]||item.type)}</strong>${item.name&&item.name!==itemTypes[item.type]?`<small>${esc(item.name)}</small>`:''}<small> ${esc(item.start||'Tills vidare')} – ${esc(item.end||'tills vidare')}</small></td><td data-finance-label="Årstakt">${active?money(value.amount):'Ej aktuell'}${value.status==='Behöver kontroll'?'<small>Kontrollera villkor</small>':''}</td><td><button type="button" data-item-edit="${esc(item.id)}" data-item-contract="${esc(contract.id)}">Redigera</button></td></tr>`).join('')||'<tr><td colspan="3">Inga avtalsposter. Spara avtalet innan du lägger till poster.</td></tr>'}</tbody></table></div>
 <small>Yta från objektet: <span data-object-area>${esc(contract.area??'–')}</span> m² · Bashyra <span data-contract-rent-per-sqm>${Number(contract.area)>0?money(rows.filter(row=>row.item.type==='base').reduce((sum,row)=>sum+row.annualRate,0)/contract.area):'Ej beräknat'}</span>${Number(contract.area)>0?'/m²':''}</small></section>`;
}
export function propertyCostsPanel(data,propertyId,year=new Date().getFullYear()){
 const rows=(data.recurringCosts||[]).filter(row=>row.propertyId===propertyId);
 const years=[...new Set([Number(year),...Array.from({length:11},(_,i)=>new Date().getFullYear()-5+i),...(data.costEvidence||[]).filter(e=>rows.some(c=>c.id===e.costId)).map(e=>e.type==='annual'?Number(e.year):Number(e.start.slice(0,4)))])].sort((a,b)=>b-a);
 return `<section class="property-section" data-finance-panel data-cost-panel="${esc(propertyId)}" data-cost-panel-year="${year}"><div class="section-title"><h3>Kostnader</h3><select data-cost-year="${esc(propertyId)}" aria-label="Kostnadsår">${years.map(y=>`<option value="${y}" ${Number(year)===y?'selected':''}>${y}</option>`).join('')}</select><button type="button" data-cost-new="${esc(propertyId)}" data-cost-panel-year="${year}">Lägg till kostnad</button></div><div class="table-wrap"><table><thead><tr><th>Kostnad</th><th>Budget, kr/år</th><th>Utfall ${year}</th><th></th></tr></thead><tbody>${rows.map(cost=>{const actual=R().evidenceActual(cost,data.costEvidence||[],year);return `<tr><td>${esc(cost.name)}<small>${esc(costCategories[cost.category]||cost.category)}</small></td><td data-finance-label="Budget, kr/år">${money(cost.annualAmount)}</td><td data-finance-label="Utfall">${actual.complete?money(actual.amount):'Ej komplett'}<small>${actual.source==='annual'?'Årsutfall':actual.source==='invoices'?'Fakturor':actual.invoiceCount?'Fakturor hittills: '+money(actual.amount):'Underlag saknas'}</small></td><td><button type="button" data-cost-edit="${esc(cost.id)}">Redigera</button> <button type="button" data-cost-evidence="${esc(cost.id)}">Underlag</button></td></tr>`;}).join('')||'<tr><td colspan="4">Inga fastighetskostnader.</td></tr>'}</tbody></table></div></section>`;
}
function dialogForm(title,content,onSubmit){
 const dialog=document.createElement('dialog');dialog.className='followup-dialog finance-dialog';
 dialog.innerHTML=`<form><h2>${esc(title)}</h2>${content}<p role="alert" data-error></p><div class="actions"><button type="button" data-cancel>Avbryt</button><button type="submit" class="primary-action">Spara</button></div></form>`;
 document.body.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;try{await onSubmit(Object.fromEntries(new FormData(event.currentTarget)));dialog.close();}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}finally{button.disabled=false;}};
 dialog.showModal();return dialog;
}
function validateView(data){validateFinance(collectWorkspace(data));}
export function openItemDialog(data,contractId,itemId,onSave){
 const draft=structuredClone(data);adoptAgreementItems(draft,contractId);
 const old=(draft.agreementItems||[]).find(row=>row.id===itemId),contract=data.contracts.find(row=>row.id===contractId);
 const row=old||{id:crypto.randomUUID(),contractId,type:'',name:'',baseAmount:0,adjustmentMethod:'none',start:contract.start||'',end:contract.end||'',floor:true};
 const rule=(kind,html)=>`<div class="contract-grid" data-item-rule="${kind}">${html}</div>`;
 const content=`<div class="contract-grid">${select(row,'type','Kostnadsslag',{'':'Välj kostnadsslag',...itemTypes})}${input(row,'name','Benämning','text','required maxlength="160"')}${input(row,'baseAmount','Grundbelopp, kr/år','number','required min="0" step="0.01"')}${input(row,'start','Fr.o.m.','date')}${input(row,'end','T.o.m.','date')}${select(row,'adjustmentMethod','Uppräkningsmetod',adjustmentMethods)}</div>
 ${rule('year',input(row,'baseYear','Basår','number','min="1900" max="9998" step="1"'))}
 ${rule('kpi',input(row,'baseIndex','Bastal KPI','number','min="0" step="any"')+input({...row,indexPercent:row.indexPercent==null?'':row.indexPercent*100},'indexPercent','Indexandel, %','number','min="0" max="100" step="any"')+input(row,'seriesBase','KPI-seriens bas (tomt = 1980)'))}
 ${rule('fixed',input(row,'annualPercent','Årlig procent','number','min="-99.99" max="1000" step="any"'))}
 ${rule('limits',input(row,'minPercent','Minsta procent','number','min="-99.99" max="1000" step="any"')+input(row,'maxPercent','Högsta procent','number','min="-99.99" max="1000" step="any"')+select({...row,limitBasis:row.limitBasis||'rent'},'limitBasis','Begränsningen avser',{rent:'Hyresökningen',index:'KPI-förändringen'}))}
 <div data-item-rule="kpi"><label><input name="floor" type="checkbox" ${row.floor!==false?'checked':''}> Lägst grundbelopp</label></div>
 <label><input name="reconcilable" type="checkbox" ${row.reconcilable?'checked':''}> Kan avräknas i framtiden</label><small>Basår avser KPI-basåret. Grundbeloppet gäller följande hyresår. Avräkning görs inte i denna version.</small>`;
 const dialog=dialogForm(old?'Redigera avtalspost':'Lägg till post',content,async values=>{
  if(!values.type)throw Error('Välj kostnadsslag.');
  const method=values.adjustmentMethod,number=key=>values[key]===''||values[key]==null?null:Number(values[key]);
  if(method!=='none'&&!number('baseYear'))throw Error('Ange basår.');
  if(['kpi','kpi-limited'].includes(method)&&number('indexPercent')==null)throw Error('Ange indexandel.');
  if(method==='fixed'&&number('annualPercent')==null)throw Error('Ange årlig procent.');
  if(method==='kpi-limited'&&number('minPercent')==null&&number('maxPercent')==null)throw Error('Ange min eller max.');
  const next={...row,...values,id:row.id,contractId,baseAmount:number('baseAmount'),baseYear:method==='none'?null:number('baseYear'),baseIndex:['kpi','kpi-limited'].includes(method)?number('baseIndex'):null,indexPercent:['kpi','kpi-limited'].includes(method)?number('indexPercent')/100:null,annualPercent:method==='fixed'?number('annualPercent'):null,minPercent:method==='kpi-limited'?number('minPercent'):null,maxPercent:method==='kpi-limited'?number('maxPercent'):null,limitBasis:method==='kpi-limited'?values.limitBasis:null,seriesBase:['kpi','kpi-limited'].includes(method)?values.seriesBase:null,floor:method==='none'?true:values.floor==='on',reconcilable:values.reconcilable==='on'};
  validateAgreementItems({...draft,agreementItems:[...(draft.agreementItems||[]).filter(x=>x.id!==next.id),next]});await onSave(next);
 });
 const update=()=>{const method=dialog.querySelector('[name=adjustmentMethod]').value;dialog.querySelectorAll('[data-item-rule]').forEach(group=>{const k=group.dataset.itemRule;group.hidden=!(k==='year'?method!=='none':k==='kpi'?['kpi','kpi-limited'].includes(method):k==='fixed'?method==='fixed':method==='kpi-limited');group.querySelectorAll('input,select').forEach(field=>field.disabled=group.hidden);});};
 const type=dialog.querySelector('[name=type]'),name=dialog.querySelector('[name=name]');let previousType=row.type;
 type.onchange=()=>{if(!name.value.trim()||name.value===itemTypes[previousType])name.value=itemTypes[type.value]||'';previousType=type.value;};
 dialog.querySelector('[name=adjustmentMethod]').onchange=update;update();
 return dialog;
}
export function openPropertyCostDialog(data,id,propertyId,year,onSave){
 const old=(data.recurringCosts||[]).find(row=>row.id===id),row=old||{id:crypto.randomUUID(),propertyId,category:'other',name:'',annualAmount:0};
 return dialogForm(old?'Redigera fastighetskostnad':'Lägg till kostnad',`<div class="contract-grid">${select(row,'category','Kategori',costCategories)}${input(row,'name','Benämning','text','required')}${input(row,'annualAmount','Budgeterat årsbelopp, kr','number','required min="0" step="0.01"')}${input(row,'start','Fr.o.m.','date')}${input(row,'end','T.o.m.','date')}</div><label><input name="complete" type="checkbox" ${(row.invoiceCompleteYears||[]).includes(Number(year))?'checked':''}> Fakturaunderlaget för ${year} är komplett</label><small>Bekräfta först när samtliga fakturor är registrerade. Kostnadsperioderna måste också täcka året.</small>`,async values=>{
  const next={...row,...values,annualAmount:Number(values.annualAmount),invoiceCompleteYears:[...(row.invoiceCompleteYears||[]).filter(y=>y!==Number(year)),...(values.complete==='on'?[Number(year)]:[])]};delete next.complete;
  validateView({...data,recurringCosts:[...(data.recurringCosts||[]).filter(x=>x.id!==next.id),next]});await onSave(next);
 });
}
export function openEvidenceDialog(data,costId,year,onSave){
 const cost=data.recurringCosts.find(row=>row.id===costId),rows=(data.costEvidence||[]).filter(row=>row.costId===costId);
 const old=rows.find(row=>row.type==='annual'&&row.year===Number(year));
 const row=old||{id:crypto.randomUUID(),costId,type:'annual',year:Number(year),selected:true,amount:''};
 const content=`<p>${esc(cost.name)} · ${esc(year)}</p><details><summary>Befintliga underlag (${rows.length})</summary><ul>${rows.map(x=>`<li>${esc(x.type==='annual'?'Årsutfall '+x.year:x.invoiceReference+' · '+x.start+' – '+x.end)}: ${money(x.amount)}${x.documentUrl?` · <a href="${esc(x.documentUrl)}" target="_blank" rel="noopener noreferrer">Dokument</a>`:''}${x.type==='invoice'?` <button type="button" data-evidence-edit="${esc(x.id)}">Redigera</button>`:''}</li>`).join('')}</ul></details>
 ${select(row,'type','Underlagstyp',{annual:'Årsutfall',invoice:'Faktura'})}<div class="contract-grid">${input(row,'amount','Belopp, kr','number','required step="0.01"')}</div>
 <div data-evidence-type="annual">${input(row,'year','År','number','min="1900" max="9999" required')}<label><input type="checkbox" name="selected" ${row.selected?'checked':''}> Använd årsutfallet i stället för fakturorna</label></div>
 <div class="contract-grid" data-evidence-type="invoice">${input(row,'invoiceReference','Fakturareferens','text','required')}${input(row,'invoiceDate','Fakturadatum','date','required')}${input(row,'start','Kostnadsperiod fr.o.m.','date','required')}${input(row,'end','Kostnadsperiod t.o.m.','date','required')}</div>${input(row,'documentUrl','Dokumentlänk (frivillig)','url')}<small>Fakturor fördelas efter kostnadsperiodens dagar. Ett valt årsutfall ersätter hela fakturasumman; beloppen adderas aldrig.</small>`;
 let editing=row;
 const dialog=dialogForm('Kostnadsunderlag',content,async values=>{
  const annual=values.type==='annual',existingAnnual=annual?rows.find(x=>x.type==='annual'&&x.year===Number(values.year)):null;
  const next={...editing,...values,id:existingAnnual?.id||(editing.type===values.type?editing.id:crypto.randomUUID()),costId,year:annual?Number(values.year):null,amount:Number(values.amount),selected:values.selected==='on',invoiceReference:annual?null:values.invoiceReference,invoiceDate:annual?null:values.invoiceDate,start:annual?null:values.start,end:annual?null:values.end};
  validateView({...data,costEvidence:[...(data.costEvidence||[]).filter(x=>x.id!==next.id),next]});await onSave(next);
 });
 const type=dialog.querySelector('[name=type]');
 const update=()=>dialog.querySelectorAll('[data-evidence-type]').forEach(group=>{group.hidden=group.dataset.evidenceType!==type.value;group.querySelectorAll('input').forEach(x=>x.disabled=group.hidden);});
 type.onchange=()=>{editing=row;update();};
 dialog.querySelectorAll('[data-evidence-edit]').forEach(button=>button.onclick=()=>{editing=rows.find(x=>x.id===button.dataset.evidenceEdit);for(const key of ['type','amount','invoiceReference','invoiceDate','start','end','documentUrl']){const input=dialog.querySelector(`[name="${key}"]`);if(input)input.value=editing[key]??'';}update();});
 update();return dialog;
}

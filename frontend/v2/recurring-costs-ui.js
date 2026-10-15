// One small editor for recurring property/agreement costs.
// No duplicate "drift issue" or annual cloned activity is created.
const esc = x => String(x ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = x => new Intl.NumberFormat("sv-SE",{maximumFractionDigits:0}).format(Number(x)||0)+" kr";

function propertyName(p) {return [p.designation,p.address].filter(Boolean).join(" · ")||p.id;}
export function recurringCostPanel(data, year, visible, editable) {
  const properties = new Set((visible?.properties || data.properties || []).map(p=>p.id));
  const contracts = new Set((visible?.contracts || data.contracts || []).map(c=>c.id));
  const rows = (data.recurringCosts || []).filter(x => x.contractId ? contracts.has(x.contractId) : properties.has(x.propertyId));
  const amount = x=>globalThis.LokalblickRecurringCosts.annualBudget(x,year);
  const actual = x=>globalThis.LokalblickRecurringCosts.annualActual(x,year);
  const active = rows.filter(x=>globalThis.LokalblickRecurringCosts.inYear(x,year));
  const total = active.reduce((sum,x)=>sum+amount(x),0);
  return '<section class="recurring-costs section" aria-label="Löpande kostnader">'+
    '<div class="section-title"><div><h2>Löpande kostnader</h2><small>Årliga kostnader på fastighet eller avtal · budget '+esc(year)+'</small></div>'+
    (editable?'<button type="button" data-new-recurring-cost>Ny kostnad</button>':'')+'</div>'+
    '<p>Årliga kostnader fortsätter automatiskt till slutåret om ett sådant finns. Enskilda åtgärder hör till Ärenden. Registrera inte kostnader som redan ingår i avtalets hyra, tillägg eller fastighetsskatt.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Kostnad</th><th>Kopplad till</th><th>Budget '+esc(year)+'</th><th>Utfall '+esc(year)+'</th><th></th></tr></thead><tbody>'+
    (active.map(x=>{
      const contract=(data.contracts||[]).find(c=>c.id===x.contractId);
      const property=(data.properties||[]).find(p=>p.id===(x.propertyId||contract?.propertyId));
      const owner=x.contractId?'Avtal '+(contract?.number||x.contractId):'Fastighet '+(property?propertyName(property):x.propertyId);
      return '<tr><td>'+esc(x.name)+'</td><td>'+esc(owner)+'</td><td>'+money(amount(x))+'</td><td>'+money(actual(x))+'</td><td>'+
        (editable?'<button type="button" data-recurring-cost="'+esc(x.id)+'">Ändra</button>':'')+'</td></tr>';
    }).join('')||'<tr><td colspan="5">Inga löpande kostnader för valt år.</td></tr>')+
    '</tbody></table></div><p><strong>Summa löpande kostnader: '+money(total)+'</strong></p></section>';
}

export function openRecurringCostDialog(data, id, year, selectedPropertyId, onSave) {
  const existing=(data.recurringCosts||[]).find(x=>x.id===id)||null;
  const owner=existing?.contractId?'contract:'+existing.contractId:existing?.propertyId?'property:'+existing.propertyId:selectedPropertyId?'property:'+selectedPropertyId:'';
  const owners=[
    ...(data.properties||[]).map(p=>({value:'property:'+p.id,label:'Fastighet · '+propertyName(p)})),
    ...(data.contracts||[]).map(c=>({value:'contract:'+c.id,label:'Avtal · '+(c.number||c.id)}))
  ];
  const currentActual=(existing?.actuals||[]).find(a=>a.year===Number(year));
  const dialog=document.createElement("dialog");
  dialog.className="followup-dialog";
  dialog.innerHTML='<form><h2>'+esc(existing?'Ändra löpande kostnad':'Ny löpande kostnad')+'</h2>'+
    '<p>En återkommande kostnad – inte ett ärende. Budgetbeloppet gäller varje år under perioden och får inte redan ingå i avtalskostnaden.</p>'+
    '<label>Vad gäller kostnaden?<input name="name" required maxlength="160" value="'+esc(existing?.name||'')+'" placeholder="Exempelvis el, värme eller städning"></label>'+
    '<label>Fastighet eller avtal<select name="owner" required><option value="">Välj koppling</option>'+
    owners.map(p=>'<option value="'+esc(p.value)+'"'+(owner===p.value?' selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></label>'+
    '<label>Budgeterat per år (kr)<input name="annualAmount" type="number" step="0.01" min="0" required value="'+esc(existing?.annualAmount??'')+'"></label>'+
    '<details><summary>Giltighet och utfall</summary>'+
    '<label>Från år<input name="startYear" type="number" min="1900" max="9999" value="'+esc(existing?.startYear??'')+'"></label>'+
    '<label>Till år<input name="endYear" type="number" min="1900" max="9999" value="'+esc(existing?.endYear??'')+'"></label>'+
    '<label>Utfall '+esc(year)+' (kr)<input name="actualAmount" type="number" step="0.01" value="'+esc(currentActual?.amount??'')+'" placeholder="Fylls i när utfall finns"></label></details>'+
    '<p role="alert" data-error></p><div class="actions"><button type="button" data-cancel>Avbryt</button>'+
    '<button type="submit" class="primary-action">Spara kostnad</button></div></form>';
  document.body.append(dialog);
  dialog.querySelector("[data-cancel]").onclick=()=>dialog.close();
  dialog.onclose=()=>dialog.remove();
  dialog.querySelector("form").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=event.currentTarget, button=form.querySelector('[type="submit"]');
    const v=Object.fromEntries(new FormData(form));
    const [ownerType, ownerId]=String(v.owner).split(":");
    const actuals=[...(existing?.actuals||[])].filter(a=>a.year!==Number(year));
    if(v.actualAmount!=="")actuals.push({year:Number(year),amount:Number(v.actualAmount)});
    const next={
      id:existing?.id||crypto.randomUUID(),
      name:String(v.name).trim(),
      category:existing?.category||"Drift",
      annualAmount:Number(v.annualAmount),
      startYear:v.startYear===""?null:Number(v.startYear),
      endYear:v.endYear===""?null:Number(v.endYear),
      propertyId:ownerType==="property"?ownerId:"",
      contractId:ownerType==="contract"?ownerId:"",
      actuals
    };
    button.disabled=true;
    try{
      globalThis.LokalblickRecurringCosts.validateCosts({
        ...data,recurringCosts:[...(data.recurringCosts||[]).filter(x=>x.id!==next.id),next]
      });
      await onSave(next);
      dialog.close();
    }catch(error){
      form.querySelector("[data-error]").textContent=error.message||"Det gick inte att spara kostnaden.";
    }finally{button.disabled=false;}
  });
  dialog.showModal();
}

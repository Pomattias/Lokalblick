/* UI only: calculations and snapshot revision live in domain/budget-followup.js. */
function budgetFollowupHtml(plan,rows,scoped) {
  if(!plan)return '';
  const locked=plan.status==='Låst';
  return '<section class="budget-comparison"><h2>Budget, prognos och slutkostnad</h2><p>Budgeten är den sparade årsbilden. Prognosen följer aktiva poster och fastställda slutkostnader.</p><div class="budget-comparison-scroll"><table><thead><tr><th>Post / förändring</th><th>Budget</th><th>Prognos</th><th>Slutkostnad</th><th>Åtgärd</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr class="'+(!r.active?'budget-removed':r.budget===null?'budget-new':r.change==='Ändrad'?'budget-changed':'')+'"><td><strong>'+esc(r.source||r.sub||r.category)+'</strong><small>'+esc(r.category)+' · '+esc(r.change)+(r.workStatus?' · '+esc(r.workStatus):'')+'</small></td><td>'+ (r.budget===null?'—':money(r.budget))+'</td><td>'+money(r.forecast)+'</td><td>'+(r.finalCost===null?'—':money(r.finalCost))+'</td><td>'+(r.sourceType!=='contract'&&LokalblickBudgetFollowup.record(state,r)?'<button data-followup-final="'+i+'">Markera utförd / slutkostnad</button>':'')+'<button data-followup-history="'+i+'">Historik</button>'+(r.budget!==null&&!scoped?'<button data-followup-revise="'+i+'">Justera budgetpost</button>':'')+'</td></tr>').join('')+'</tbody></table></div>'+(!scoped?'<details class="budget-danger-zone"><summary>'+(locked?'Riskzon · ändra låst budget':'Budgetjusteringar')+'</summary><p>'+(locked?'Varning: du ändrar beslutad budget. Skriv danger och ange anledning för varje ändring. Föregående version sparas.':'Budgetändringar sparas med anledning och tidigare version.')+'</p><button data-followup-add>Lägg till budgetpost</button><button data-followup-layer>Övergripande justering</button><button data-followup-budget-history>Budgethistorik</button></details>':'')+'</section>';
}
function followupDialog(title,fields,onSave) {
  const d=document.createElement('dialog');d.className='followup-dialog';
  d.innerHTML='<form><h2>'+esc(title)+'</h2>'+fields+'<p role="alert" class="followup-error"></p><div class="dialog-actions"><button type="button" data-cancel>Avbryt</button><button type="submit">Spara</button></div></form>';
  document.body.append(d);d.querySelector('[data-cancel]').onclick=()=>d.close();d.onclose=()=>d.remove();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=d.querySelector('[type=submit]');button.disabled=true;try{await onSave(Object.fromEntries(new FormData(e.target)));d.close();}catch(error){d.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}};d.showModal();
}
function budgetRevisionFields(plan) {
  return '<label>Anledning<textarea name="reason" required></textarea></label>'+(plan.status==='Låst'?'<p class="danger-warning">Varning: den låsta budgeten ändras. Tidigare version behålls.</p><label>Skriv danger för att bekräfta<input name="confirmation" required pattern="danger" autocomplete="off"></label>':'');
}
function bindBudgetFollowup() {
  const plan=budgetPlan(selectedBudgetYear);if(!plan)return;
  const scoped=hasPortfolioScope(),contracts=portfolioScopeContracts();
  const baseline=(scoped?budgetRowsForContracts(plan.lines||[],contracts):plan.lines||[]);
  const rows=LokalblickBudgetFollowup.compare(state,baseline,budgetRows(selectedBudgetYear,contracts),selectedBudgetYear);
  function bind(selector,fn){document.querySelectorAll(selector).forEach(b=>{if(b.dataset.followupBound)return;b.dataset.followupBound='1';b.onclick=()=>{if(!selector.includes('history')&&!canEdit()){alert('Slå på Redigera för att ändra.');return;}fn(b);};});}
  async function revise(values,change){
    if(!canEdit())throw new Error('Slå på Redigera.');
    requireActorIdentity();
    const previous=clone(plan);
    LokalblickBudgetFollowup.revise(plan,values.confirmation,values.reason,currentActorLabel());
    try {change();await saveState();render();} catch(e){Object.keys(plan).forEach(k=>delete plan[k]);Object.assign(plan,previous);throw e;}
  }
  bind('[data-followup-history]',b=>{const r=rows[Number(b.dataset.followupHistory)];showHistory(r.sourceType==='manual'?'budgetPlans':r.sourceType,r.sourceType==='manual'?String(plan.year):r.sourceId);});
  bind('[data-followup-budget-history]',()=>showHistory('budgetPlans',String(plan.year)));
  bind('[data-followup-revise]',b=>{const row=rows[Number(b.dataset.followupRevise)];followupDialog('Justera budgetpost '+plan.year,'<p>'+esc(row.source||row.sub)+'</p><label>Budgetbelopp<input type="number" step="0.01" name="amount" value="'+row.budget+'" required></label><label><input type="checkbox" name="excluded"> Undanta från budgeten</label>'+budgetRevisionFields(plan),v=>revise(v,()=>{
    const line=plan.lines.find(x=>LokalblickBudgetFollowup.key(x)===(row.baselineKey||LokalblickBudgetFollowup.key(row)));
    const before=Number(line.amount)||0;line.amount=Number(v.amount);line.included=!v.excluded;
    plan.targets[row.category]=(Number(plan.targets[row.category])||0)+(v.excluded?0:Number(v.amount))-before;
  }));});
  bind('[data-followup-add]',()=>followupDialog('Lägg till budgetpost','<label>Benämning<input name="title" required></label><label>Kategori<select name="category">'+budgetCategories().map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></label><label>Belopp<input type="number" step="0.01" name="amount" required></label>'+budgetRevisionFields(plan),v=>revise(v,()=>{
    plan.lines.push({sourceType:'manual',sourceId:crypto.randomUUID(),category:v.category,source:v.title,sub:'Budgetpost',amount:Number(v.amount)});
    plan.targets[v.category]=(Number(plan.targets[v.category])||0)+Number(v.amount);
  })));
  bind('[data-followup-layer]',()=>followupDialog('Övergripande budgetjustering','<label>Kategori<select name="category">'+budgetCategories().map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></label><label>Justering (+/−)<input type="number" step="0.01" name="amount" required></label>'+budgetRevisionFields(plan),v=>revise(v,()=>{plan.targets[v.category]=(Number(plan.targets[v.category])||0)+Number(v.amount);plan.notes=plan.notes||{};plan.notes[v.category]=v.reason;})));
  bind('[data-followup-final]',b=>{const row=rows[Number(b.dataset.followupFinal)],item=LokalblickBudgetFollowup.record(state,row);
    followupDialog('Markera utförd och ange slutkostnad','<p>'+esc(row.source||row.sub)+' · '+esc(row.category)+' · '+selectedBudgetYear+'</p><label>Slutkostnad<input name="amount" type="number" min="0" step="0.01" required value="'+(row.finalCost??'')+'"></label>',async v=>{
      if(!canEdit())throw new Error('Slå på Redigera.');
      item.finalCosts=item.finalCosts||{};item.finalCosts[selectedBudgetYear]=item.finalCosts[selectedBudgetYear]||{};item.finalCosts[selectedBudgetYear][row.category]=Number(v.amount);
      if(row.sourceType!=='project'){item.finalCost=Number(v.amount);item.finalCostConfirmed=true;}
      // A project with investigation + execution is complete only when both are settled.
      const categories=rows.filter(r=>r.sourceType===row.sourceType&&r.sourceId===row.sourceId).map(r=>r.category);
      if(categories.every(c=>item.finalCosts[selectedBudgetYear][c]!=null)){item.status='Utförd';item.completedDate=new Date().toISOString().slice(0,10);item.completedAt=item.completedDate;}
      await saveState();render();
    });
  });
}

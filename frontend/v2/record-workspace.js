import {recordContext,isOpenIssue} from './portfolio-context.js';
import {contextTabs,contextContracts,contextIssueFilters,contextIssues,currentContacts} from './context-ui.js';
import {esc} from './views.js';

export function mountWorkspace(root,{data,collection,id,selection,source,canEdit,saved={}}) {
  if(!id||!['properties','objects','contracts'].includes(collection))return null;
  const form=root.querySelector('#edit-form'),aside=root.querySelector('.editor');
  const heading=form.querySelector(':scope > .section-title');
  const current=data(),record=current[collection].find(row=>row.id===id);
  const property=current.properties.find(row=>row.id===record.propertyId);
  const object=(current.objects||[]).find(row=>row.id===record.objectId);
  const link=(kind,row,label)=>row?`<button type="button" class="text-button" data-context-record="${kind}" data-id="${esc(row.id)}">${esc(label)}</button>`:'';
  if(collection!=='properties'){
    const title=heading.querySelector('h2');
    title.textContent=collection==='contracts'?'Avtal '+(record.number||record.id):['Objekt '+(record.number||record.id),record.name].filter(Boolean).join(' · ');
    for(const small of heading.querySelectorAll('small'))small.remove();
    const parent=document.createElement('div');parent.className='context-parent';
    parent.innerHTML=[link('properties',property,[property?.designation,property?.address].filter(Boolean).join(' · ')),link('objects',object,'Objekt '+(object?.number||object?.id||''))].filter(Boolean).join('<span aria-hidden="true">›</span>');
    title.before(parent);
    for(const key of ['number',...(current.cleanModel?['id']:[]),'propertyId',...(collection==='contracts'?['objectId']:['name'])])form.querySelector(`[name="${key}"]`)?.closest('label')?.classList.add('context-header-reference');
  }
  if(collection==='objects'){
    form.querySelector('nav.tabs')?.remove();
    for(const section of form.querySelectorAll('[data-editor-section]'))section.hidden=false;
  }
  const state={tab:collection==='contracts'?'info':'contracts',status:'open',person:'',q:'',all:false,...saved};
  const info=document.createElement('section');info.dataset.contextPanel='info';
  for(const node of [...form.children])if(node!==heading)info.appendChild(node);
  form.appendChild(info);
  aside.classList.add('record-workspace');
  const scopeBanner=document.createElement('div');scopeBanner.className='context-scope';
  heading.after(scopeBanner);
  const tabs=document.createElement('div');scopeBanner.after(tabs);
  const contracts=document.createElement('section');contracts.dataset.contextPanel='contracts';
  contracts.innerHTML='<div data-context-results="contracts"></div>';
  if(collection!=='contracts')form.appendChild(contracts);
  const issues=document.createElement('section');issues.dataset.contextPanel='issues';
  issues.innerHTML=`<div class="context-toolbar"><button type="button" data-context-new-issue${canEdit?'':' disabled'}>Nytt ärende</button></div>${contextIssueFilters(data(),state)}<div data-context-results="issues"></div>`;
  form.appendChild(issues);
  const contactSection=collection==='properties'?[...info.querySelectorAll('.property-section')].find(section=>section.querySelector('[name="responsiblePersonId"]')):collection==='contracts'?info.querySelector('[data-contract-section="contacts"]'):null;
  if(contactSection||collection==='objects'){
    contactSection?.classList.add('context-legacy-contacts');
    const contacts=document.createElement('section');contacts.className='context-current-contacts';
    const roles=collection==='properties'?[['owner','Ägarkontakt','ownerResponsiblePersonId'],['our','Lokalsamordnare','responsiblePersonId']]:[['tenant','Hyresgästens kontakt','tenantResponsiblePersonId'],['our','Vår ansvarige','responsiblePersonId']];
    if(collection==='objects'){
      roles.splice(0,1);roles[0][1]='Vår ansvarige';
      for(const [, ,field] of roles)info.querySelector(`[name="${field}"]`)?.closest('label')?.classList.add('context-header-reference');
    }
    contacts.innerHTML='<h3>Kontaktpersoner</h3>'+currentContacts(current,{properties:'property',objects:'object',contracts:'contract'}[collection],record,roles);
    if(contactSection)contactSection.after(contacts);
    else info.querySelector('.responsibility-section')?.before(contacts);
    // History remains available as an explicit choice in the read view.
    if(collection==='contracts'){
      const responsibility=contactSection.querySelector('.responsibility-section');
      if(responsibility)contacts.after(responsibility);
    }
  }
  if(collection==='contracts'){
    const identity=info.querySelector('[data-contract-section="identity"]');
    identity?.querySelector('.contract-field:last-child')?.classList.add('context-header-reference');
  }
  if(collection==='objects'){
    const predecessor=info.querySelector('[name="predecessorIds"]')?.closest('label');
    const history=document.createElement('details');history.className='context-periods';
    history.innerHTML='<summary>Objektets historik</summary>';
    if(predecessor){predecessor.before(history);history.appendChild(predecessor);}
    const successors=(current.objects||[]).filter(row=>(row.predecessorIds||[]).includes(id));
    if(successors.length){
      const next=document.createElement('div');next.className='context-successors';
      next.innerHTML='<h3>Efterföljande objekt</h3>'+successors.map(row=>link('objects',row,'Objekt '+(row.number||row.name||row.id))).join(' · ');
      history.appendChild(next);
    }
  }
  function setTab(tab) {
    state.tab=['info','issues',...(collection!=='contracts'?['contracts']:[])].includes(tab)?tab:'info';
    aside.dataset.contextTab=state.tab;
    for(const panel of form.querySelectorAll('[data-context-panel]'))panel.hidden=panel.dataset.contextPanel!==state.tab;
    for(const button of tabs.querySelectorAll('[data-context-tab]')){
      const active=button.dataset.contextTab===state.tab;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-controls',`context-${collection}-${encodeURIComponent(id)}-${button.dataset.contextTab}`);
    }
    for(const panel of form.querySelectorAll('[data-context-panel]'))panel.id=`context-${collection}-${encodeURIComponent(id)}-${panel.dataset.contextPanel}`;
  }
  function refresh() {
    const current=data(),context=recordContext(current,collection,id,selection,source,state.all);
    const openCount=context.issues.filter(isOpenIssue).length;
    tabs.innerHTML=contextTabs(collection,openCount);
    scopeBanner.innerHTML=collection==='properties'&&context.totalContracts!==context.contracts.length
      ?`<span>${context.contracts.length} av ${context.totalContracts} avtal i urvalet</span><button type="button" class="text-button" data-context-show-all>Visa hela fastigheten</button>`
      :state.all?'<span>Hela fastigheten</span><button type="button" class="text-button" data-context-show-all>Återgå till urvalet</button>':'';
    if(collection!=='contracts')contracts.querySelector('[data-context-results]').innerHTML=contextContracts(current,context,new Date().getFullYear());
    issues.querySelector('[data-context-results]').innerHTML=contextIssues(current,context,state);
    setTab(state.tab);
  }
  refresh();
  if(saved.openDetails)for(const [index,detail] of [...form.querySelectorAll('details')].entries())detail.open=saved.openDetails.includes(index);
  aside.scrollTop=saved.scroll||0;
  return {state,setTab,refresh,apply(key,value){state[key]=value;refresh();},
    capture:()=>({...state,scroll:aside.scrollTop,openDetails:[...form.querySelectorAll('details')].flatMap((detail,index)=>detail.open?[index]:[])})};
}

export function recordBreadcrumb(data,collection,record,trail=[]) {
  const link=(kind,id,label)=>`<button type="button" class="text-button" data-context-record="${kind}" data-id="${esc(id)}">${esc(label)}</button>`;
  const contract=collection==='contracts'?record:data.contracts.find(row=>row.id===record.contractId);
  const object=(data.objects||[]).find(row=>row.id===record.objectId);
  const property=data.properties.find(row=>row.id===(contract?.propertyId||object?.propertyId||record.propertyId));
  const back=trail.length?'<button type="button" class="text-button" data-context-back>← Tillbaka</button>':'';
  const propertyLink=collection==='activities'&&property?link('properties',property.id,property.designation||property.address):'';
  const contractLink=collection==='activities'&&contract?link('contracts',contract.id,'Avtal '+(contract.number||contract.id)):'';
  return back||propertyLink||contractLink?`<nav class="context-breadcrumb" aria-label="Tillbaka och sammanhang">${[back,propertyLink,contractLink].filter(Boolean).join('<span aria-hidden="true">›</span>')}</nav>`:'';
}

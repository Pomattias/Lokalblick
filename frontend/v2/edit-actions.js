// Enhance explicit edit actions, keeping record names and create actions intact.
// Budget retains its original buttons and behavior.
const pencil='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
function alignHeadingActions(root) {
  const headings=[...(root.matches?.('.section-title')?[root]:[]),...root.querySelectorAll('.section-title')];
  for(const heading of headings){
    const direct=[...heading.children].filter(child=>child.matches('button'));
    let group=heading.querySelector(':scope > .ui-heading-actions,:scope > .issue-heading-actions');
    if(!group&&direct.length){group=document.createElement('div');group.className='ui-heading-actions';heading.append(group);}
    if(!group)continue;
    group.classList.add('ui-heading-actions');heading.classList.add('ui-action-heading');
    for(const button of direct)group.append(button);
  }
}
export function decorateEditActions(root) {
  alignHeadingActions(root);
  const buttons=[...(root.matches?.('button')?[root]:[]),...root.querySelectorAll('button')];
  for(const button of buttons){
    if(button.hasAttribute('data-edit-action'))continue;
    const label=button.getAttribute('aria-label')||button.textContent.trim();
    if(!button.matches('[data-editor-activate],[data-person-edit],.table-pencil')&&!/^(Ändra|Redigera)(\s|$)/i.test(label))continue;
    const headerEdit=button.hasAttribute('data-editor-activate');
    button.dataset.editAction='';button.classList.add(headerEdit?'edit-text-action':'edit-action');
    const primaryCell=button.closest('tr')?.querySelector('.primary-cell,td:first-child');
    const recordName=(primaryCell?.querySelector('button,strong')||primaryCell)?.textContent.trim();
    button.setAttribute('aria-label',label==='Ändra'&&recordName?'Ändra '+recordName:label==='✎'?'Redigera':label);
    button.title=button.getAttribute('aria-label');
    if(button.dataset.edit&&button.dataset.id)button.dataset.editMode='edit';
    if(headerEdit)button.textContent='Redigera';else button.innerHTML=pencil;
  }
}
export function bindEditActions(root,enabled) {
  const observer=new MutationObserver(records=>{
    if(!enabled())return;
    for(const record of records){
      const button=record.target.closest?.('button');
      if(button)decorateEditActions(button);
      for(const node of record.addedNodes)if(node.nodeType===1)decorateEditActions(node);
    }
  });
  observer.observe(root.body||root,{childList:true,subtree:true});
  return observer;
}

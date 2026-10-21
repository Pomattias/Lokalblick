import {issueNeedsLink} from '../lokaler/issue-identity.js';
// Reorder the existing issue form without replacing controls or persistence.
// Installed only outside Budget, which retains its original editor and journal.
const element=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
};
function expandable(value,id,limit=180) {
  if(!value||value.id===id||value.textContent.length<=limit)return;
  value.id=id;
  value.classList.add('issue-text-collapsed');
  const button=element('button','text-button issue-expand-text','Visa mer');
  button.type='button';button.dataset.issueExpand='';
  button.setAttribute('aria-controls',id);button.setAttribute('aria-expanded','false');
  value.after(button);
}
export function toggleIssueText(button) {
  const value=document.getElementById(button.getAttribute('aria-controls'));
  if(!value)return;
  const expanded=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(expanded));
  button.textContent=expanded?'Visa mindre':'Visa mer';
  value.classList.toggle('issue-text-collapsed',!expanded);
}
export function compactIssueJournal(form) {
  if(!form?.closest('.compact-issue'))return;
  const journal=form.querySelector('.activity-journal');
  if(!journal)return;
  // A note refresh renders the original journal. Keep the primary fields already
  // mounted above it and remove the refreshed copies before taking a snapshot.
  journal.querySelector('.activity-journal-history-group')?.remove();
  journal.querySelector('h3').textContent='Noteringar';
  journal.querySelector('.activity-journal-group > h4')?.remove();
  const compose=journal.querySelector('.activity-journal-compose-row');
  if(compose&&!compose.closest('.issue-note-compose')){
    const details=element('details','issue-note-compose');
    details.append(element('summary','','Ny notering'),compose);
    journal.querySelector('.activity-journal-heading').after(details);
  }
  const notes=[...journal.querySelectorAll('.activity-journal-entry.is-note')];
  journal.querySelector('.activity-journal-heading > span').textContent=notes.length===1?'1 notering':notes.length+' noteringar';
  let older=journal.querySelector('.activity-journal-group > details');
  if(notes.length>1){
    if(!older){older=element('details','issue-older-notes');older.append(element('summary'));journal.querySelector('.activity-journal-group').append(older);}
    older.classList.add('issue-older-notes');
    older.querySelector('summary').textContent=`${notes.length-1} äldre noteringar`;
    for(const note of notes.slice(1))older.append(note);
  }
  notes.forEach((note,index)=>expandable(note.querySelector('p'),'issue-note-text-'+index,240));
}
export function mountCompactIssue(root,{isNew=false,issue={}}={}) {
  const form=root.querySelector('#edit-form[data-collection="activities"]');
  if(!form)return;
  const aside=form.closest('.issue-editor');
  if(aside.classList.contains('compact-issue'))return;
  aside.classList.add('compact-issue');
  const heading=form.querySelector('.issue-heading');
  heading.querySelector('.issue-heading-text > small')?.remove();
  if(issue.id)heading.querySelector('.issue-heading-text').append(element('small','',issue.id));
  const chips=element('div','issue-chips');
  for(const name of ['status','priority']){
    const field=form.querySelector(`[name="${name}"]`).closest('.issue-mode-field');
    field.classList.add('issue-chip');field.dataset.issueChip=name;
    const value=field.querySelector('select').value;
    field.style.setProperty('--issue-chip-size',Math.min(20,Math.max(7,value.length+3))+'ch');
    if(name==='priority'&&/^(hög|akut)$/i.test(value))field.dataset.attention=value.toLowerCase()==='akut'?'urgent':'high';
    chips.append(field);
  }
  heading.querySelector('.issue-heading-text').append(chips);

  const main=form.querySelector('.issue-main-section');
  const grid=main.querySelector('.issue-grid');
  const home=form.querySelector('.issue-home-row');
  const property=home.querySelector('.issue-property-reference');
  const breadcrumb=form.querySelector('.context-breadcrumb');
  const links=[...breadcrumb?.querySelectorAll('[data-context-record]')||[]];
  if(links.length){
    const propertyName=property.querySelector('strong').textContent;
    property.replaceChildren();
    for(const link of links){
      if(link.dataset.contextRecord==='properties')link.textContent=propertyName;
      property.append(link);
    }
    for(const separator of breadcrumb.querySelectorAll('span'))separator.remove();
    if(!breadcrumb.querySelector('button'))breadcrumb.remove();
  }
  if(!links.length&&property.querySelector('strong')?.textContent==='Ingen fastighet kopplad')property.textContent=home.querySelector('.issue-field-value').textContent;
  const extra=element('details','issue-extra');
  extra.open=isNew||issueNeedsLink(issue);
  extra.append(element('summary','','Fler uppgifter'));
  const extraFields=element('div','issue-extra-fields');
  extraFields.append(home.querySelector('.issue-mode-field'),form.querySelector('.issue-compact-meta'));
  extra.append(extraFields);
  const description=form.querySelector('.issue-description-row');
  description.querySelector('.issue-field-label').classList.add('visually-hidden');
  expandable(description.querySelector('.issue-field-value'),'issue-description-text');
  grid.append(home,description);
  if(issueNeedsLink(issue)){
    property.textContent='Att koppla';
    const hints=[...new Set((issue.sources||[]).map(source=>source.homeHint).filter(Boolean))];
    if(hints.length)home.append(element('small','',hints.join(' · ')));
  }

  const history=form.querySelector('.activity-journal-history-group');
  const cost=history.querySelector('.issue-history-card:has(.issue-cost-edit)');
  const dates=history.querySelector('.issue-history-card:has(.issue-dates-edit)');
  const focus=element('section','issue-focus-grid');
  focus.setAttribute('aria-label','Kostnad och ansvarig');
  focus.append(cost,form.querySelector('.issue-owner-row'));
  main.after(focus);
  const costTerms=element('details','issue-cost-terms issue-history-card');
  costTerms.append(element('summary','','Kostnadsvillkor'));
  costTerms.append(cost.querySelector('.journal-cost-enhancing'),cost.querySelector('.issue-enhancing-edit'));
  extra.append(costTerms);
  const timing=element('section','issue-focus-timing');
  timing.setAttribute('aria-label','Tidplan');
  timing.append(dates,form.querySelector('[data-issue-planner]'));
  focus.after(timing);
  for(const card of [cost,dates]){
    const history=card.querySelector('.activity-journal-history');
    if(!history.querySelector('.activity-journal-entry'))history.hidden=true;
  }
  compactIssueJournal(form);
  const retained=new Set([heading,main,focus,timing,form.querySelector('.activity-journal'),form.querySelector('.context-breadcrumb')]);
  for(const child of [...form.children])if(!retained.has(child))extra.append(child);
  form.append(extra);
}

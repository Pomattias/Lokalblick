import {esc} from './view-format.js';

export function importPeopleHtml(candidate,base,{approved=null,edits={},editing=new Set(),query='',limit=100,enrichment=false,allowNew=false}={}){
 if(!candidate.clean)return '';
 const data=candidate.clean,ids=new Set((candidate.report.sourceRows||[]).flatMap(row=>row.records.people||[])),people=data.people.filter(p=>ids.has(p.id));if(!people.length)return '';
 const parties=new Map(data.parties.map(p=>[p.id,p])),properties=new Map(data.properties.map(p=>[p.id,p])),companies=new Map();
 const addCompany=(personId,partyId)=>{const name=parties.get(partyId)?.name;if(!name)return;if(!companies.has(personId))companies.set(personId,new Set());companies.get(personId).add(name);};
 for(const person of people)addCompany(person.id,person.party_id);
 // Only an explicit owner's contact implies representation of that company.
 const contactIds=new Set((candidate.report.sourceRows||[]).flatMap(r=>r.records.contacts||[]));
 for(const contact of data.contacts)if(contactIds.has(contact.id)){
  const current={...contact,...edits.contacts?.[contact.id]?.record};
  if(current.role==='owner')addCompany(current.person_id,properties.get(current.property_id)?.owner_party_id);
 }
 const companyName=person=>[...(companies.get(person.id)||[])].sort((a,b)=>a.localeCompare(b,'sv')).join(', ');
 const value=(person,field)=>edits.people?.[person.id]?.[field]??person[field]??'';
 const matching=people.filter(person=>[...['name','email','phone'].map(field=>value(person,field)),companyName(person)].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));
 const before=new Map(base.people.map(p=>[p.id,p])),saved=approved&&new Map(approved.clean.people.map(p=>[p.id,p]));
 const status=person=>saved&&!saved.has(person.id)?enrichment&&!before.has(person.id)?allowNew?'Ny person · Ej vald':'Ny person · Importera ej nya':'Läses inte in':!before.has(person.id)?'Ny person':['name','email','phone','party_id'].some(field=>person[field]!==before.get(person.id)[field])?'Uppdateras':'Befintlig person';
 const input=(person,field)=>`<input type="text" data-person-field="${esc(person.id)}" data-person-key="${field}" aria-label="${({name:'Namn',email:'E-post',phone:'Telefon'})[field]} för ${esc(person.name)}" value="${esc(value(person,field))}" maxlength="20000">`;
 return `<section data-import-people><h3>Personer i importen <small>${people.length} ${people.length===1?'person':'personer'}</small></h3><label>Sök person eller bolag<input type="search" data-people-search value="${esc(query)}"></label><div class="import-source-scroll" tabindex="0"><table class="import-source-table import-people-table" aria-label="Personer i importen"><thead><tr><th>Visa / redigera</th>${['Namn','E-post','Telefon','Bolag / organisation','Resultat'].map(label=>`<th data-register="people">${label}</th>`).join('')}</tr></thead><tbody>${matching.slice(0,limit).map(person=>{
  const active=editing.has(person.id);
  return `<tr data-person-row="${esc(person.id)}" data-person-id="${esc(person.id)}"><th><button type="button" data-edit-import-person="${esc(person.id)}">${active?'Klart':'Visa / redigera'}</button></th>${['name','email','phone'].map(field=>`<td data-register="people">${active?input(person,field):esc(value(person,field)||'–')}</td>`).join('')}<td data-register="organizations">${esc(companyName(person)||'–')}</td><td>${status(person)}</td></tr>`;
 }).join('')}</tbody></table></div><small>Visar ${Math.min(limit,matching.length)} av ${matching.length} ${matching.length===1?'person':'personer'}.</small>${matching.length>limit?'<button type="button" data-people-more>Visa 100 till</button>':''}</section>`;
}

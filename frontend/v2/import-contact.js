import {createBusinessLabels} from '../lokaler/business-identities.js';
import {normalize,validateData,tables} from '../lokaler/model.js';
import {esc,propertyReference} from './view-format.js';

const homes={property_id:'properties',agreement_id:'agreements',issue_id:'issues',order_id:'orders'};
export const importContactRoles={coordinator:'Lokalsamordnare / vår kontaktperson',owner:'Fastighetsägarens kontaktperson',tenant:'Hyresgästens kontaktperson'};
const roles=importContactRoles;

export function chooseImportContact(candidate,row,original=null){
 const data=candidate.clean,labels=createBusinessLabels(data),dialog=document.createElement('dialog');
 dialog.className='followup-dialog import-contact-dialog';
 const initial=original||{person_id:row.nodes.find(node=>node.table==='people')?.id||'',role:'coordinator',property_id:row.nodes.find(node=>node.table==='properties')?.id||null};
 dialog.innerHTML=`<form data-contact-form><h2>${original?'Ändra föreslagen':'Lägg till'} personkoppling</h2><p>Personen finns en gång. Rollen gäller bara kopplingen till det valda målet.</p><label>Person<select name="person_id" required><option value="">Välj person</option>${data.people.map(person=>`<option value="${esc(person.id)}"${initial.person_id===person.id?' selected':''}>${esc(person.name)}${person.email?' · '+esc(person.email):''}</option>`).join('')}</select></label><label>Roll här<select name="role">${Object.entries(roles).map(([value,label])=>`<option value="${value}"${initial.role===value?' selected':''}>${label}</option>`).join('')}</select></label><label>Kopplas till register<select name="home"></select></label><label>Kopplas till post<select name="target" required></select></label><label>Giltig fr.o.m.<input name="valid_from" type="date" value="${esc(initial.valid_from||'')}"></label><label>Giltig t.o.m.<input name="valid_to" type="date" value="${esc(initial.valid_to||'')}"></label><p data-contact-sentence></p><p data-contact-error role="alert"></p><div class="actions"><button type="button" data-contact-cancel>Avbryt</button><button type="submit">Använd kopplingen</button></div></form>`;
 document.body.append(dialog);dialog.showModal();
 return new Promise(resolve=>{
  const form=dialog.querySelector('form'),role=form.elements.role,home=form.elements.home,target=form.elements.target;
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};
  const sentence=()=>{dialog.querySelector('[data-contact-sentence]').textContent=[form.elements.person_id.selectedOptions[0]?.textContent,'är',roles[role.value],'för',target.selectedOptions[0]?.textContent].join(' ');};
  const targets=()=>{
   const field=home.value,table=homes[field],selected=initial[field]||row.nodes.find(node=>node.table===table)?.id;
   target.innerHTML='<option value="">Välj post</option>'+data[table].map(record=>`<option value="${esc(record.id)}"${record.id===selected?' selected':''}>${esc(table==='properties'?propertyReference({designation:record.name,address:record.address}):labels.label(table,record.id))} · ${esc(labels.number(table,record.id))}</option>`).join('');sentence();
  };
  const registers=()=>{
   const previous=home.value,allowed=role.value==='owner'?['property_id']:role.value==='tenant'?['agreement_id']:Object.keys(homes);
   home.innerHTML=allowed.map(field=>`<option value="${field}">${tables[homes[field]].label}</option>`).join('');
   home.value=allowed.includes(previous)?previous:allowed.find(field=>initial[field])||allowed[0];targets();
  };
  role.onchange=registers;home.onchange=targets;target.onchange=sentence;form.elements.person_id.onchange=sentence;registers();
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});dialog.querySelector('[data-contact-cancel]').onclick=()=>finish(null);
  form.onsubmit=event=>{
   event.preventDefault();
   try{
    const record=normalize('contacts',{id:original?.id||'KOP-'+crypto.randomUUID(),person_id:form.elements.person_id.value,role:role.value,[home.value]:target.value,valid_from:form.elements.valid_from.value||null,valid_to:form.elements.valid_to.value||null});
    const same=data.contacts.find(at=>!at.cancelled&&['person_id','role',...Object.keys(homes),'valid_from','valid_to'].every(field=>(at[field]||null)===(record[field]||null)));
    if(same&&same.id!==original?.id){finish({record:same,existing:true});return;}
    const clean={...data,contacts:[...data.contacts.filter(at=>at.id!==record.id),record]};validateData(clean);finish({record});
   }catch(error){dialog.querySelector('[data-contact-error]').textContent=labels.text(error.message);}
  };
 });
}

import {partyNumberFields,normalizeOrganizationNumber} from '../lokaler/model.js';
import {audit,clone} from './model.js';
import {esc} from './views.js';

// Context fields edit the linked party; they are never saved on the property/agreement.
export function partyNumberInput(data,collection,record){
 const table=collection==='contracts'?'agreements':collection,field=partyNumberFields[table];
 const party=data.organizations.find(row=>row.id===record[field.viewVia]);
 return `<input name="${field.key}" data-party-number="${field.viewVia}" value="${esc(party?.organizationNumber||'')}" type="text" inputmode="numeric" maxlength="32" placeholder="000000-0000">`;
}
export function refreshPartyNumber(form,data,reference){
 const input=form.querySelector(`[data-party-number="${reference}"]`),select=form.elements.namedItem(reference);
 if(input&&select)input.value=data.organizations.find(row=>row.id===select.value)?.organizationNumber||'';
}
export function applyLinkedPartyNumber(data,collection,record,actor){
 const field=partyNumberFields[collection==='contracts'?'agreements':collection];
 if(!field||!Object.hasOwn(record,field.key))return;
 const number=normalizeOrganizationNumber(record[field.key]);delete record[field.key];
 const party=data.organizations.find(row=>row.id===record[field.viewVia]);
 if(!party){if(number)throw Error('Välj fastighetsägare eller hyresgäst innan organisationsnumret anges.');return;}
 if(number&&data.organizations.some(row=>row.id!==party.id&&normalizeOrganizationNumber(row.organizationNumber)===number))throw Error('Organisationsnumret tillhör redan en annan part. Välj den befintliga parten.');
 const before=clone(party);party.organizationNumber=number;
 audit(data,'organizations',party.id,before,party,actor);
}

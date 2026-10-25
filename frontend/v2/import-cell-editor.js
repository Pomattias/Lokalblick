import {isInternalIdentifier} from '../lokaler/business-identities.js';
import {tables} from '../lokaler/model.js';
import {viewCollections,viewFields} from '../lokaler/view-fields.js';
import {importCellKey} from '../lokaler/import-cell-edits.js';
import {personRole,contactPart} from '../services/import-person-links.js';
import {importSourceValue,importDateColumn} from './import-row-review.js';
import {esc} from './view-format.js';
export function importCellOwner(row,column,profile){
 const role=personRole(column.target),part=contactPart(column.target);
 if(part)return importCellOwner(row,profile.columns.find(c=>c.index===part.index)||{},profile)&&{...importCellOwner(row,profile.columns.find(c=>c.index===part.index)||{},profile),field:({email:'email',phone:'phone'})[part.field]};
 if(role){const home=({property:'property_id',contract:'agreement_id',activity:'issue_id',order:'order_id'})[role.type],name=({our:'coordinator',owner:'owner',tenant:'tenant'})[role.role];const contacts=row.nodes.filter(n=>n.table==='contacts'&&n.record?.role===name&&n.record?.[home]);const people=[...new Set(contacts.map(n=>n.record.person_id))];return people.length===1?{table:'people',id:people[0],field:'name'}:null;}
 const [collection,viewField]=String(column.target||'').split('.'),table=Object.keys(viewCollections).find(t=>viewCollections[t]===collection),field=Object.entries(viewFields[table]||{}).find(([,f])=>f===viewField)?.[0];
 let nodes=row.nodes.filter(n=>n.table===table&&n.identified!==false&&n.record);
 if(table==='agreement_items'&&column.itemType)nodes=nodes.filter(n=>n.record.type===column.itemType&&(!column.itemKey||n.record.id.startsWith(column.itemKey+'|')));
 return nodes.length===1?{table,id:nodes[0].actualId,field,record:nodes[0].record}:null;
}
export function importCellHtml(prepared,profile,row,column,{editing=false,edits={},cellEdits={},labels,candidate,problem=null}){
 const owner=importCellOwner(row,column,profile);
 let value=importSourceValue({...prepared,cellEdits},profile,row,column);
 if(owner?.table==='properties'&&owner.field==='name'&&Object.hasOwn(edits.properties||{},owner.id))value=edits.properties[owner.id];
 if(owner?.table==='people'&&['name','email','phone'].includes(owner.field))value=edits.people?.[owner.id]?.[owner.field]??candidate.clean.people.find(p=>p.id===owner.id)?.[owner.field]??value;
 if(!editing||column.target.startsWith('@')||isInternalIdentifier(value))return `<span>${esc(value==null||value===''?'–':labels.text(value))}</span>`;
 const label=column.header+' · rad '+row.row,invalid=problem?` aria-invalid="true" aria-describedby="${esc(problem.id)}"`:'';

 if(owner?.table==='people'&&['name','email','phone'].includes(owner.field))return `<input type="text" data-person-field="${esc(owner.id)}" data-person-key="${owner.field}" aria-label="${esc(label)}"${invalid} value="${esc(value??'')}" maxlength="20000">`;
 const field=owner?.field&&tables[owner.table]?.fields.find(f=>f.key===owner.field);if(field?.type==='json')return `<span>${esc(labels.text(value))}</span>`;
 return `<input type="text" data-import-cell="${esc(importCellKey(profile,row.row,column,row.source))}" aria-label="${esc(label)}"${invalid} value="${esc(value??'')}"${importDateColumn(column)?' placeholder="ÅÅÅÅ-MM-DD"':''} maxlength="20000">`;
}


// Share facts only with the same record and item slot. Separate price columns
// can have the same mapped field while representing different agreement items.
export function importCellCorrections(rows,profiles,current,column,value,fileName='Excel'){
 if(!current||!column)return {};
 const profileFor=row=>profiles.find(p=>p.name===row.sheet&&(p.fileName||fileName)===row.source),owner=importCellOwner(current,column,profileFor(current));
 const identity=/(?:^|\.)(?:id|sourceId|number|managementObjectNumber|\w*Id)$/.test(column.target),edits={};
 const related=owner&&!identity?rows.filter(r=>r.nodes.some(n=>n.table===owner.table&&n.actualId===owner.id)):[current];
 for(const row of related){const profile=profileFor(row);for(const c of profile.columns.filter(c=>c.target===column.target)){
  const other=importCellOwner(row,c,profile);
  if(owner?other?.table!==owner.table||other.id!==owner.id||other.field!==owner.field:c.index!==column.index)continue;
  edits[importCellKey(profile,row.row,c,row.source)]={source:row.source,sheet:row.sheet,row:row.row,index:c.index,target:c.target,value};
 }}
 return edits;
}

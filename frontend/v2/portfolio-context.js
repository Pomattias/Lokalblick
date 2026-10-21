import {issueNeedsLink} from '../lokaler/issue-identity.js';
import {activities,scope} from './model.js';

const text = value => String(value||'').trim().toLocaleLowerCase('sv');
const includes = (query,...values) => !query || text(values.join(' ')).includes(text(query));
const unique = rows => [...new Map(rows.map(row=>[row.id,row])).values()];
export const isOpenIssue = issue => !/^(utförd|utfört|slutförd|klar|klart|avslaget|avslagen|avslutad|avslutat|stängd|stängt|makulerad|avbruten)$/i.test(String(issue.status||'').trim());
export const tenantName = (data,contract) => (data.organizations||[]).find(row=>row.id===contract.tenantPartyId)?.name||contract.tenantName||'Hyresgäst saknas';
// Use registered dates here. Calculated renewals are forecasts, not confirmed
// current agreements. Missing dates stay visible so records never disappear.
export function periodPhase(record,at=globalThis.LokalblickResponsibility.today()) {
  if(record.start&&record.start>at)return 'future';
  if(record.end&&record.end<at)return 'past';
  return 'current';
}
export function contractPhase(data,contract,at) {
  const phase=periodPhase(contract,at);
  const object=(data.objects||[]).find(row=>row.id===contract.objectId);
  return phase==='current'&&object?periodPhase(object,at):phase;
}
export function rentalTotals(data,contracts,year) {
  let rent=0,area=0,needsReview=0,preliminary=0;
  for(const contract of contracts) {
    const value=globalThis.LokalblickCalculations.annualValues(contract,year,0,data.indexSeries).rent;
    rent+=Number(value.amount)||0;area+=Number(contract.area)||0;
    if(value.status==='Behöver kontroll')needsReview++;
    if(value.preliminary)preliminary++;
  }
  return {rent,area,needsReview,preliminary,rentPerSqm:area>0&&!needsReview?rent/area:null};
}

// New portfolio navigation deliberately leaves the legacy scope used by Budget
// untouched. Portfolio responsibility refers to the property, not the issue.
export function portfolioScope(data,selection={},local={}) {
  const base=scope(data,{...selection,q:'',person:''});
  const responsible=property=>{
    if(!selection.person)return true;
    const model=globalThis.LokalblickResponsibility;
    const links=model.current(data,'property',property.id,'our');
    return links.length?links.some(link=>link.personId===selection.person):
      !model.history(data,'property',property.id,'our').length&&property.responsiblePersonId===selection.person;
  };
  let properties=base.properties.filter(responsible);
  const propertyIds=new Set(properties.map(row=>row.id));
  let contracts=base.contracts.filter(row=>propertyIds.has(row.propertyId));
  const contractIds=new Set(contracts.map(row=>row.id));
  let objects=(data.objects||[]).filter(row=>propertyIds.has(row.propertyId)&&
    (!selection.unit||row.unitId===selection.unit||contracts.some(contract=>contract.objectId===row.id)));
  const objectIds=new Set(objects.map(row=>row.id));
  let items=activities(data).filter(item=>{
    const issue=item.record;
    if(issue.contractId)return contractIds.has(issue.contractId);
    if(issue.objectId)return objectIds.has(issue.objectId);
    if(item.propertyId)return propertyIds.has(item.propertyId);
    if(selection.owner||selection.person||selection.propertyId)return false;
    return !selection.unit||issue.unitId===selection.unit;
  });
  const query=text(local.q);
  const propertyText=property=>includes(query,property.designation,property.address);
  const objectText=object=>includes(query,object.number,object.name,object.businessName);
  const contractText=contract=>{
    const property=data.properties.find(row=>row.id===contract.propertyId)||{};
    const object=(data.objects||[]).find(row=>row.id===contract.objectId)||{};
    return includes(query,contract.number||contract.id,tenantName(data,contract),contract.use,contract.business,contract.businessName,
      property.designation,property.address,object.number,object.name);
  };
  if(query&&local.view!=='activities') {
    contracts=contracts.filter(contractText);
    objects=objects.filter(object=>objectText(object)||propertyText(data.properties.find(row=>row.id===object.propertyId)||{})||contracts.some(contract=>contract.objectId===object.id));
    properties=properties.filter(property=>propertyText(property)||objects.some(object=>object.propertyId===property.id)||contracts.some(contract=>contract.propertyId===property.id));
    const matchingProperties=new Set(properties.map(row=>row.id));
    const matchingContracts=new Set(contracts.map(row=>row.id));
    const matchingObjects=new Set(objects.map(row=>row.id));
    items=items.filter(item=>item.record.contractId?matchingContracts.has(item.record.contractId):
      item.record.objectId?matchingObjects.has(item.record.objectId):matchingProperties.has(item.propertyId));
  }
  if(local.view==='activities') items=items.filter(item=>{
    const property=data.properties.find(row=>row.id===item.propertyId)||{};
    const contract=data.contracts.find(row=>row.id===item.record.contractId)||{};
    return includes(query,item.record.id,item.title,item.record.description,item.record.type,property.designation,property.address,contract.number||contract.id,tenantName(data,contract))&&
      (!local.person||item.record.responsiblePersonId===local.person)&&
      (!local.type||local.type==='Alla'||item.record.type===local.type)&&
      (local.status==='all'||(local.status==='unlinked'?issueNeedsLink(item.record):local.status==='closed'?!isOpenIssue(item.record):isOpenIssue(item.record)));
  });
  return {properties,contracts:contracts.filter(row=>contractPhase(data,row)==='current'),
    objects:objects.filter(row=>periodPhase(row)==='current'),allContracts:contracts,allObjects:objects,items};
}

export function recordContext(data,collection,id,selection={},source={},all=false,selectedScope=null) {
  const contract=collection==='contracts'?data.contracts.find(row=>row.id===id):null;
  const object=collection==='objects'?(data.objects||[]).find(row=>row.id===id):null;
  const propertyId=contract?.propertyId||object?.propertyId||(collection==='properties'?id:'');
  const selected=all?portfolioScope(data):selectedScope||portfolioScope(data,selection,source);
  const allContracts=contract?[contract]:(selected.allContracts||selected.contracts).filter(row=>row.propertyId===propertyId&&(!object||row.objectId===id));
  const contracts=allContracts.filter(row=>contractPhase(data,row)==='current');
  const selectedIds=new Set(allContracts.map(row=>row.id));
  const allObjects=object?[object]:contract?(data.objects||[]).filter(row=>row.id===contract.objectId):(selected.allObjects||selected.objects).filter(row=>row.propertyId===propertyId);
  const objects=allObjects.filter(row=>periodPhase(row)==='current');
  const objectIds=new Set(allObjects.map(row=>row.id));
  const primary=[],common=[];
  for(const item of selected.items) {
    const issue=item.record;
    if(issue.contractId&&selectedIds.has(issue.contractId))primary.push(issue);
    else if(!issue.contractId&&issue.objectId&&objectIds.has(issue.objectId))primary.push(issue);
    else if(!issue.contractId&&!issue.objectId&&issue.propertyId===propertyId)common.push(issue);
  }
  return {property:data.properties.find(row=>row.id===propertyId),contract,object,contracts,objects,allContracts,allObjects,
    primary:unique(primary),common:unique(common),issues:unique([...primary,...common]),
    totalContracts:data.contracts.filter(row=>row.propertyId===propertyId&&contractPhase(data,row)==='current').length};
}

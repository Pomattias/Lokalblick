// Small operations on the existing V2 workspace; persistence and audit stay shared.
const id=prefix=>prefix+'-'+crypto.randomUUID();
export function inspectionPoints(data,inspectionId){return data.inspectionPoints.filter(point=>point.inspectionId===inspectionId);}
export function objectInspections(data,objectId){return data.inspections.filter(row=>row.objectId===objectId).sort((a,b)=>(a.status==='draft'?0:1)-(b.status==='draft'?0:1)||(b.inspectedOn||'').localeCompare(a.inspectedOn||''));}
export function startInspection(data,objectId,inspectedOn,inspectorId){
 if(!data.objects.some(row=>row.id===objectId))throw Error('Välj ett befintligt objekt.');
 if(objectInspections(data,objectId).some(row=>row.status==='draft'))throw Error('Objektet har redan en pågående besiktning.');
 const row={id:id('BEH'),objectId,inspectedOn,inspectorId,status:'draft'};
 data.inspections.push(row);
 const spaces=new Set(data.spaces.filter(row=>row.objectId===objectId).map(row=>row.id));
 for(const part of data.buildingParts.filter(row=>spaces.has(row.spaceId))){
  const previous=data.inspectionPoints.filter(point=>point.partId===part.id&&point.issueId).find(point=>data.activities.some(issue=>issue.id===point.issueId&&!['Klar','Klart','Avslutad'].includes(issue.status)));
  data.inspectionPoints.push({id:id('BEP'),inspectionId:row.id,partId:part.id,assessment:'unchecked',...(previous?{issueId:previous.issueId}:{})});
 }
 return row.id;
}
export function addSpace(data,objectId,name,floor,names){
 if(!data.objects.some(row=>row.id===objectId))throw Error('Välj ett befintligt objekt.');
 name=String(name||'').trim();floor=String(floor||'').trim();
 if(!name)throw Error('Ange utrymmets namn.');
 if(data.spaces.some(row=>row.objectId===objectId&&row.name.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv')&&(row.floor||'').toLocaleLowerCase('sv')===floor.toLocaleLowerCase('sv')))throw Error('Utrymmet finns redan. Skilj det åt med namn eller placering.');
 const space={id:id('UTR'),objectId,name,floor};data.spaces.push(space);
 for(const name of new Set(names.map(value=>String(value).trim()).filter(Boolean)))addPart(data,space.id,name);
 return space.id;
}
export function addPart(data,spaceId,name,responsibility=null){
 const space=data.spaces.find(row=>row.id===spaceId);if(!space)throw Error('Utrymmet saknas.');
 name=String(name||'').trim();if(!name)throw Error('Ange delens namn.');
 if(data.buildingParts.some(row=>row.spaceId===spaceId&&row.name.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv')))throw Error('Delen finns redan i utrymmet.');
 const part={id:id('DEL'),spaceId,name,responsibility};data.buildingParts.push(part);
 const draft=objectInspections(data,space.objectId).find(row=>row.status==='draft');
 if(draft)data.inspectionPoints.push({id:id('BEP'),inspectionId:draft.id,partId:part.id,assessment:'unchecked'});
 return part.id;
}
export function updatePoint(data,pointId,values){
 const point=data.inspectionPoints.find(row=>row.id===pointId);if(!point)throw Error('Besiktningspunkten saknas.');
 if(data.inspections.find(row=>row.id===point.inspectionId)?.status!=='draft')throw Error('Starta en ny besiktning för att ändra bedömningen.');
 for(const key of Object.keys(values))if(!['assessment','comment','photoReference'].includes(key))throw Error('Uppgiften kan inte ändras här.');
 Object.assign(point,values);
}
export function finishInspection(data,inspectionId){
 const row=data.inspections.find(row=>row.id===inspectionId);if(!row||row.status!=='draft')throw Error('Besiktningen är redan avslutad.');
 if(!row.inspectedOn||!row.inspectorId)throw Error('Ange datum och besiktningsperson.');
 const points=inspectionPoints(data,row.id);
 if(!points.length||points.some(point=>point.assessment==='unchecked'))throw Error('Kontrollera alla delar innan besiktningen avslutas.');
 row.status='completed';
}
export function linkMaintenanceIssue(data,pointId,issueId){
 const point=data.inspectionPoints.find(row=>row.id===pointId),inspection=data.inspections.find(row=>row.id===point?.inspectionId);
 if(!point||!inspection)throw Error('Besiktningspunkten saknas.');
 if(point.issueId){if(!issueId||point.issueId===issueId)return point.issueId;throw Error('Punkten är redan kopplad till ett ärende.');}
 if(issueId){
  const issue=data.activities.find(row=>row.id===issueId),object=data.objects.find(row=>row.id===inspection.objectId);
  if(!issue||(issue.objectId?issue.objectId!==object.id:issue.propertyId!==object.propertyId))throw Error('Välj ett ärende på samma objekt eller fastighet.');
 }else{
  const part=data.buildingParts.find(row=>row.id===point.partId),space=data.spaces.find(row=>row.id===part.spaceId);
  issueId=id('ARE');
  data.activities.push({id:issueId,objectId:inspection.objectId,scopeType:'object',title:space.name+' · '+part.name,description:point.comment||'',status:'Nytt',priority:'Medel',type:'Underhåll',includeInBudget:'Nej',budgetCategory:'Ej budget'});
 }
 point.issueId=issueId;return issueId;
}

// Small operations on the existing V2 workspace; persistence and audit stay shared.
const id=prefix=>prefix+'-'+crypto.randomUUID();
export function inspectionPoints(data,inspectionId){return data.inspectionPoints.filter(point=>point.inspectionId===inspectionId);}
export const maintenanceHome=({objectId,propertyId})=>objectId?{objectId}:propertyId?{propertyId}:{};
export const sameMaintenanceHome=(a,b)=>Boolean(a?.objectId||a?.propertyId)&&(a.objectId||null)===(b?.objectId||null)&&(a.propertyId||null)===(b?.propertyId||null);
function requireHome(data,home){if(!home||Boolean(home.objectId)===Boolean(home.propertyId)||!(home.objectId?data.objects.some(row=>row.id===home.objectId):data.properties.some(row=>row.id===home.propertyId)))throw Error('Välj en befintlig fastighet eller ett befintligt objekt.');}
export function homeInspections(data,home){return data.inspections.filter(row=>sameMaintenanceHome(row,home)).sort((a,b)=>(a.status==='draft'?0:1)-(b.status==='draft'?0:1)||(b.inspectedOn||'').localeCompare(a.inspectedOn||''));}
export function startInspection(data,home,inspectedOn,inspectorId){
 requireHome(data,home);
 if(homeInspections(data,home).some(row=>row.status==='draft'))throw Error('Fastigheten eller objektet har redan en pågående besiktning.');
 const row={id:id('BEH'),...maintenanceHome(home),inspectedOn,inspectorId,status:'draft'};
 data.inspections.push(row);
 const spaces=new Set(data.spaces.filter(row=>sameMaintenanceHome(row,home)).map(row=>row.id));
 const existingPoints=[...data.inspectionPoints];
 const carryIssue=matches=>existingPoints.filter(point=>matches(point)&&point.issueId).find(point=>data.activities.some(issue=>issue.id===point.issueId&&!['Klar','Klart','Avslutad'].includes(issue.status)))?.issueId;
 for(const part of data.buildingParts.filter(row=>spaces.has(row.spaceId))){
  const issueId=carryIssue(point=>point.partId===part.id);
  data.inspectionPoints.push({id:id('BEP'),inspectionId:row.id,partId:part.id,assessment:'unchecked',...(issueId?{issueId}:{})});
 }
 for(const spaceId of spaces)if(existingPoints.some(point=>point.spaceId===spaceId)||!data.buildingParts.some(part=>part.spaceId===spaceId)){
  const issueId=carryIssue(point=>point.spaceId===spaceId);
  data.inspectionPoints.push({id:id('BEP'),inspectionId:row.id,spaceId,assessment:'unchecked',...(issueId?{issueId}:{})});
 }
 return row.id;
}
export function addSpace(data,home,name,floor,names){
 requireHome(data,home);
 name=String(name||'').trim();floor=String(floor||'').trim();
 if(!name)throw Error('Ange utrymmets namn.');
 if(data.spaces.some(row=>sameMaintenanceHome(row,home)&&row.name.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv')&&(row.floor||'').toLocaleLowerCase('sv')===floor.toLocaleLowerCase('sv')))throw Error('Utrymmet finns redan. Skilj det åt med namn eller placering.');
 const space={id:id('UTR'),...maintenanceHome(home),name,floor};data.spaces.push(space);
 for(const name of new Set(names.map(value=>String(value).trim()).filter(Boolean)))addPart(data,space.id,name);
 return space.id;
}
export function addPart(data,spaceId,name,responsibility=null){
 const space=data.spaces.find(row=>row.id===spaceId);if(!space)throw Error('Utrymmet saknas.');
 name=String(name||'').trim();if(!name)throw Error('Ange delens namn.');
 if(data.buildingParts.some(row=>row.spaceId===spaceId&&row.name.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv')))throw Error('Delen finns redan i utrymmet.');
 const part={id:id('DEL'),spaceId,name,responsibility};data.buildingParts.push(part);
 const draft=homeInspections(data,space).find(row=>row.status==='draft');
 if(draft)data.inspectionPoints.push({id:id('BEP'),inspectionId:draft.id,partId:part.id,assessment:'unchecked'});
 return part.id;
}
export function updatePoint(data,pointId,values){
 const point=data.inspectionPoints.find(row=>row.id===pointId);if(!point)throw Error('Besiktningspunkten saknas.');
 if(data.inspections.find(row=>row.id===point.inspectionId)?.status!=='draft')throw Error('Starta en ny besiktning för att ändra bedömningen.');
 for(const key of Object.keys(values))if(!['assessment','comment','photoReference'].includes(key))throw Error('Uppgiften kan inte ändras här.');
 Object.assign(point,values);
}
export function assessSpace(data,spaceId,values){
 const space=data.spaces.find(row=>row.id===spaceId);if(!space)throw Error('Utrymmet saknas.');
 const home=maintenanceHome(space),draftId=homeInspections(data,home).find(row=>row.status==='draft')?.id||startInspection(data,home,new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'}),null);
 let point=data.inspectionPoints.find(row=>row.inspectionId===draftId&&row.spaceId===spaceId);
 if(!point){point={id:id('BEP'),inspectionId:draftId,spaceId,assessment:'unchecked'};data.inspectionPoints.push(point);}
 updatePoint(data,point.id,values);return draftId;
}
export function finishInspection(data,inspectionId){
 const row=data.inspections.find(row=>row.id===inspectionId);if(!row||row.status!=='draft')throw Error('Besiktningen är redan avslutad.');
 if(!row.inspectedOn||!row.inspectorId)throw Error('Ange datum och besiktningsperson.');
 const points=inspectionPoints(data,row.id);
 if(!points.length||points.some(point=>point.assessment==='unchecked'))throw Error('Kontrollera alla bedömningar innan besiktningen avslutas.');
 row.status='completed';
}
export function linkMaintenanceIssue(data,pointId,issueId){
 const point=data.inspectionPoints.find(row=>row.id===pointId),inspection=data.inspections.find(row=>row.id===point?.inspectionId);
 if(!point||!inspection)throw Error('Besiktningspunkten saknas.');
 if(point.issueId){if(!issueId||point.issueId===issueId)return point.issueId;throw Error('Punkten är redan kopplad till ett ärende.');}
 if(issueId){
  const issue=data.activities.find(row=>row.id===issueId),propertyId=inspection.propertyId||data.objects.find(row=>row.id===inspection.objectId)?.propertyId;
  if(!issue||(issue.objectId?issue.objectId!==inspection.objectId:issue.propertyId!==propertyId))throw Error('Välj ett ärende på samma objekt eller fastighet.');
 }else{
  const part=data.buildingParts.find(row=>row.id===point.partId),space=data.spaces.find(row=>row.id===(point.spaceId||part?.spaceId));
  issueId=id('ARE');
  data.activities.push({id:issueId,...maintenanceHome(inspection),scopeType:inspection.objectId?'object':'property',title:space.name+(part?' · '+part.name:''),description:point.comment||'',status:'Nytt',priority:'Medel',type:'Underhåll',includeInBudget:'Nej',budgetCategory:'Ej budget'});
 }
 point.issueId=issueId;return issueId;
}

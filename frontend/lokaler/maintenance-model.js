// The inspection records use the same canonical tables, validation and Excel codec
// as the rest of Lokalblick. Forecasts are source evidence, never booked costs.
const f=(key,label,type='text',extra={})=>({key,label,type,...extra});
export const maintenanceResults={excellent:'5 · Utmärkt/nyskick',good:'4 · Bra',ok:'3 · OK',defect:'2 · Brist',urgent:'1 · Akut'};
export const assessments={unchecked:'Ej bedömd',...maintenanceResults};
export const assessmentAliases={'5':'excellent','4':'good','3':'ok','2':'defect','1':'urgent',Nyskick:'excellent',Utmärkt:'excellent',Bra:'good',OK:'ok',Brist:'defect',Akut:'urgent','Ej kontrollerad':'unchecked'};
export const needsMaintenanceAction=assessment=>assessment==='defect'||assessment==='urgent';
export const maintenanceResponsibilities={owner:'Fastighetsägaren',tenant:'Hyresgästen'};
export const maintenanceTables={
 spaces:{label:'Utrymmen',singular:'Utrymme',prefix:'UTR',fields:[f('object_id','Objekt','ref',{table:'objects'}),f('property_id','Fastighet','ref',{table:'properties'}),f('name','Utrymme','text',{required:true}),f('floor','Våning eller placering')]},
 building_parts:{label:'Delar',singular:'Del',prefix:'DEL',fields:[f('space_id','Utrymme','ref',{table:'spaces',required:true}),f('name','Del','text',{required:true}),f('responsibility','Underhållsansvar','select',{values:maintenanceResponsibilities})]},
 inspections:{label:'Besiktningar',singular:'Besiktning',prefix:'BEH',fields:[f('object_id','Objekt','ref',{table:'objects'}),f('property_id','Fastighet','ref',{table:'properties'}),f('inspected_on','Besiktningsdatum','date'),f('inspector_id','Besiktningsperson','ref',{table:'people'}),f('status','Protokollstatus','select',{values:{draft:'Pågående',completed:'Avslutad'},default:'draft'}),f('notes','Noteringar','textarea'),f('sources','Källspårning','json')]},
 inspection_points:{label:'Besiktningspunkter',singular:'Besiktningspunkt',prefix:'BEP',fields:[f('inspection_id','Besiktning','ref',{table:'inspections',required:true}),f('part_id','Del','ref',{table:'building_parts'}),f('space_id','Utrymme','ref',{table:'spaces'}),f('assessment','Bedömning','select',{values:assessments,valueAliases:assessmentAliases,default:'unchecked'}),f('comment','Kommentar','textarea'),f('last_action','Senast åtgärdad enligt källa'),f('photo_reference','Foto eller dokumentreferens'),f('issue_id','Ärende','ref',{table:'issues'}),f('source_plans','Importerad planering','json'),f('sources','Källspårning','json')]}
};
export function validateMaintenance(data,before){
 const spaces=new Map(data.spaces.map(row=>[row.id,row])),parts=new Map(data.building_parts.map(row=>[row.id,row])),inspections=new Map(data.inspections.map(row=>[row.id,row])),issues=new Map(data.issues.map(row=>[row.id,row])),objects=new Map(data.objects.map(row=>[row.id,row]));
 const seen=new Set();
 const home=row=>JSON.stringify([row?.object_id||null,row?.property_id||null]);
 const drafts=new Set();for(const inspection of data.inspections)if(inspection.status==='draft'){if(drafts.has(home(inspection)))throw Error('Fastigheten eller objektet har redan en pågående besiktning.');drafts.add(home(inspection));}
 for(const point of data.inspection_points){
  const inspection=inspections.get(point.inspection_id),part=parts.get(point.part_id),space=spaces.get(point.space_id||part?.space_id);
  if(home(space)!==home(inspection))throw Error('Besiktningspunkten och delen måste tillhöra samma objekt eller fastighet.');
  const key=JSON.stringify([point.inspection_id,point.part_id||null,point.space_id||null]);if(seen.has(key))throw Error('Utrymmet eller delen finns redan i besiktningen.');seen.add(key);
  if(point.issue_id){const issue=issues.get(point.issue_id),propertyId=inspection.property_id||objects.get(inspection.object_id)?.property_id;if(issue&&(issue.object_id?issue.object_id!==inspection.object_id:issue.property_id!==propertyId))throw Error('Ärendet måste tillhöra samma objekt eller dess fastighet.');}
  for(const plan of point.source_plans||[]){
   if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(key=>!['year','amount','interval'].includes(key)))throw Error('Ogiltigt planeringsunderlag.');
   if(plan.interval){if(typeof plan.interval!=='string'||plan.year!=null||plan.amount!=null)throw Error('Tidsintervall får inte omvandlas till årsbelopp.');}
   else if(!Number.isInteger(plan.year)||plan.year<1900||plan.year>9999||typeof plan.amount!=='number'||!Number.isFinite(plan.amount)||plan.amount<0)throw Error('Planeringsbelopp kräver ett giltigt år och belopp.');
  }
 }
 // Closed observations stay intact. An issue can still be linked afterwards.
 if(!before)return;
 const clean=row=>JSON.stringify(Object.fromEntries(Object.entries(row||{}).filter(([key,value])=>key!=='issue_id'&&value!=null).sort(([a],[b])=>a.localeCompare(b))));
 for(const inspection of before.inspections||[]){
  if(inspection.status!=='completed')continue;
  if(clean(inspection)!==clean(inspections.get(inspection.id)))throw Error('Avslutade besiktningar bevaras. Starta en ny besiktning.');
  const old=(before.inspection_points||[]).filter(row=>row.inspection_id===inspection.id),current=data.inspection_points.filter(row=>row.inspection_id===inspection.id);
  const next=new Map(current.map(row=>[row.id,row]));
  if(old.length!==current.length||old.some(row=>clean(row)!==clean(next.get(row.id))))throw Error('Avslutade besiktningspunkter kan inte ändras. Starta en ny besiktning.');
 }
 for(const part of before.building_parts||[]){
  if((before.inspection_points||[]).some(point=>point.part_id===part.id&&before.inspections?.some(row=>row.id===point.inspection_id&&row.status==='completed'))&&parts.get(part.id)?.space_id!==part.space_id)throw Error('En besiktigad del kan inte flyttas från sitt utrymme.');
 }
 for(const space of before.spaces||[])if(home(spaces.get(space.id))!==home(space)&&(before.inspection_points||[]).some(point=>point.space_id===space.id||(before.building_parts||[]).some(part=>part.id===point.part_id&&part.space_id===space.id)))throw Error('Ett besiktigat utrymme kan inte flyttas till ett annat objekt eller fastighet.');
 for(const inspection of data.inspections){
  const previous=before.inspections?.find(row=>row.id===inspection.id);
  if(inspection.status==='completed'&&previous?.status==='draft'){
   if(!inspection.inspected_on||!inspection.inspector_id)throw Error('Ange datum och besiktningsperson före avslut.');
   const points=data.inspection_points.filter(row=>row.inspection_id===inspection.id);
   if(!points.length||points.some(row=>row.assessment==='unchecked'))throw Error('Kontrollera alla bedömningar innan besiktningen avslutas.');
  }
 }
}

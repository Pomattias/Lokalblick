// Approved columns per register. IDs are stable and independent of display order.
// Add a field only when its row renderer has a verified relationship and value.
export const COLUMN_CATALOG={
 properties:['propertyNumber','property','address','owner','responsible','issues','contracts','area','annualRent','propertyId','action'],
 objects:['objectNumber','propertyNumber','property','address','localType','validity','contracts','propertyId','action'],
 contracts:['property','propertyNumber','address','owner','responsible','activity','activityDescription','issues','contract','annualRent','rentSqm','addition','additionSqm','area','start','end','noticeMonths','noticeDate','propertyId','action'],
 activities:['issue','type','property','address','responsible','status','cost','notes','propertyNumber','propertyId','action'],
};
export const COLUMN_GROUP_ORDER=['Fastighet','Objekt','Avtal','Verksamhet / Hyresgäst','Personer','Parter','Budget','Ärenden'];
export const COLUMN_GROUPS={
 propertyNumber:'Fastighet',propertyId:'Fastighet',property:'Fastighet',address:'Fastighet',owner:'Parter',
 objectNumber:'Objekt',localType:'Objekt',validity:'Objekt',area:'Objekt',
 contract:'Avtal',contracts:'Avtal',start:'Avtal',end:'Avtal',noticeMonths:'Avtal',noticeDate:'Avtal',annualRent:'Avtal',rentSqm:'Avtal',addition:'Avtal',additionSqm:'Avtal',
 activity:'Verksamhet / Hyresgäst',activityDescription:'Verksamhet / Hyresgäst',responsible:'Personer',
 issue:'Ärenden',issues:'Ärenden',type:'Ärenden',status:'Ärenden',cost:'Ärenden',notes:'Ärenden',
};

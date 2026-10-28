// Approved columns per register. IDs are stable and independent of display order.
// Add a field only when its row renderer has a verified relationship and value.
export const COLUMN_CATALOG={
 properties:['propertyNumber','property','address','owner','responsible','issues','contracts','area','annualRent','propertyId','action'],
 objects:['objectNumber','propertyNumber','property','address','localType','validity','contracts','propertyId','action'],
 contracts:['property','propertyNumber','address','owner','responsible','activity','activityDescription','issues','contract','annualRent','rentSqm','addition','additionSqm','area','start','end','noticeMonths','noticeDate','propertyId','action'],
 activities:['issue','type','property','address','responsible','status','cost','notes','propertyNumber','propertyId','action'],
};
export const COLUMN_GROUPS={propertyNumber:'Fastighetsuppgifter',propertyId:'Fastighetsuppgifter',property:'Fastighetsuppgifter',address:'Fastighetsuppgifter',owner:'Organisation och ansvar',responsible:'Organisation och ansvar',activity:'Verksamhet',activityDescription:'Verksamhet',annualRent:'Ekonomi',rentSqm:'Ekonomi',addition:'Ekonomi',additionSqm:'Ekonomi',cost:'Ekonomi',area:'Ytor',start:'Datum och avtal',end:'Datum och avtal',noticeMonths:'Datum och avtal',noticeDate:'Datum och avtal',contracts:'Datum och avtal',contract:'Datum och avtal',issues:'Ärenden',notes:'Ärenden'};

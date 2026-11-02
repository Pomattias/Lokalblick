// Deterministic import profile for workbooks built around the Lokallista sheet.
// These are mapping rules, not import authorizations or a reason to invent records.
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase('sv').replace(/[^a-z0-9]/g,'');
export const workbookRole=(name,names=[])=>{
 const hasBase=names.some(n=>norm(n)==='lokallista');
 if(!hasBase)return 'ordinary';
 const sheet=norm(name);
 if(sheet==='lokallista')return 'base';
 if(['lokalbestand','fastighetslista','lokaldata'].includes(sheet))return 'enrichment';
 if(['ext','sf'].includes(sheet))return 'reference';
 return 'optional';
};
export function defaultWorkbookSheets(names,recommended=[]){
 if(!names.some(n=>norm(n)==='lokallista'))return names.filter((_,i)=>recommended[i]);
 return names.filter(n=>['base','enrichment'].includes(workbookRole(n,names)));
}
export function workbookFieldRule(sheet,header,index=0){
 const name=norm(sheet),h=norm(header);
 if(name==='lokallista'&&index===0)return 'properties.managementObjectNumber';
 if(name==='lokalbestand'&&h==='objektsnummerforvaltningsobjekt')
  return 'properties.managementObjectNumber';
 if(name==='fastighetslista'&&h==='fastighetsagare'&&index===5)return '@ignore';
 if(name==='fastighetslista'&&h==='objektnr')
  return 'properties.managementObjectNumber';
 if(name==='lokaldata'&&['objektiekot','hyra2026','hyrakrkvm'].includes(h))
  return '@ignore';
 if(['fastighetslista','lokalbestand','lokaldata'].includes(name)&&
  ['forvaltare','forvaltarenr','emailforvaltare','emailhyresvardkontaktfelanmalan'].includes(h))
  return '@ignore';
 return null;
}
// Only supplemental facts that can be attached to known base entities are eligible.
export const enrichmentFields=new Set([
 'properties.managementObjectNumber','properties.designation','properties.popularName',
 'properties.address','properties.city','properties.ownerPartyId',
 'objects.id','objects.area','objects.apartmentCount','objects.apartmentArea',
 'contracts.id','contracts.objectId','contracts.start','contracts.end','contracts.notice',
 'contracts.noticePeriodMonths','contracts.renewalPeriodMonths','contracts.use',
 'contracts.category','contracts.contractDocumentUrl','contracts.businessName',
 'contracts.businessDescription','contracts.tenantPartyId'
]);

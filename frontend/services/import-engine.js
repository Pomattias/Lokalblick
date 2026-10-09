// Shared, local-only preparation for unknown workbook structures.
// Uses the canonical schemas owned by source-service, never a second data model.
const copy = x => JSON.parse(JSON.stringify(x));
const norm = x => String(x ?? '').trim().toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const present = x => x != null && (typeof x!=='string'||x.trim()!=='');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const aliases = {
  'fastbet':'properties.designation', 'fastighetsbeteckning':'properties.designation',
  'adress':'properties.address', 'gatuadress':'properties.address', 'ort':'properties.city', 'postort':'properties.city',
  'avtalsnr':'contracts.number', 'avtalsnummer':'contracts.number',
  'bra':'contracts.area', 'lokalarea':'contracts.area', 'kvm':'contracts.area',
  'arshyra':'contracts.baseRent', 'manadshyra':'contracts.baseRent',
  'epost':'people.email', 'email':'people.email', 'telefon':'people.phone',
  'hyresgast':'contracts.tenantName', 'verksamhet':'contracts.businessName',
};
export function fieldCatalog(schemas) {
  const labels={sourceId:'Källans identifierare',propertyId:'Fastighet',contractId:'Avtal',activityId:'Aktivitet',organizationId:'Organisation',ownerPartyId:'Fastighetsägare',responsiblePersonId:'Ansvarig hos oss'};
  return schemas.flatMap(s => s.columns.filter(([k,,hidden]) => (!hidden || ['sourceId','propertyId','contractId','activityId','organizationId','ownerPartyId','responsiblePersonId'].includes(k)) && !/^(geo|enrichment)/.test(k))
    .map(([field,label]) => ({target:s.key+'.'+field,collection:s.key,field,aliases:s.labelAliases?.[field]||[],label:s.sheet+' → '+(label.startsWith('_')?labels[field]||label:label)})));
}
export function profileWorkbook(workbook, schemas, XLSX, saved = []) {
  const fields = fieldCatalog(schemas);
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(sheet, {header:1,defval:'',blankrows:true});
    const start = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0;
    let headerIndex = 0, best = -1;
    matrix.slice(0,50).forEach((row,i) => {
      const values = row.filter(present);
      const known = values.filter(v => aliases[norm(v)] || fields.some(f => norm(f.label.split(' → ')[1])===norm(v))).length;
      const score = known*8 + values.filter(v=>typeof v==='string').length - values.filter(v=>typeof v==='number').length;
      if(score>best){best=score;headerIndex=i;}
    });
    const headers = matrix[headerIndex] || [];
    const headerKeys=headers.filter(present).map(norm);
    const contractSignals=headerKeys.filter(h=>/avtals|hyra|hyres|uppsagning|forlangning/.test(h));
    const signature = JSON.stringify(headers.filter(present).map(norm).sort());
    const previous = saved.find(s => s.sheet===name && s.signature===signature);
    const inferred = /person|kontakt/i.test(name) ? 'people' : /avtal|hyra/i.test(name) || contractSignals.length>=2 || headerKeys.some(h=>/^avtals(?:nummer|nr)$/.test(h)) ? 'contracts' : /projekt|underhall|drift|onskemal/i.test(norm(name)) ? 'activities' : 'properties';
    const columns = headers.map((header,index) => {
      if(!present(header)) return null;
      const values=matrix.slice(headerIndex+1).map(r=>r[index]).filter(present);
      const choices=fields.filter(f=>norm(f.label.split(' → ')[1])===norm(header)||f.aliases.some(a=>norm(a)===norm(header)));
      let candidate=choices.find(f=>f.collection===inferred) || (choices.length===1?choices[0]:null);
      if(/^(tom|from)$/.test(norm(header))&&!['contracts','activities'].includes(inferred))candidate=null;
      const rule=previous?.columns?.find(c=>norm(c.header)===norm(header));
      const h=norm(header);
      let contextualTarget='';
      if(['contracts','activities'].includes(inferred)){
        const dateField=/^(?:tom|tillochmed)$/.test(h)||/(?:giltigt|giltig|avtal|hyresperiod).*tom$/.test(h)?'end':/^(?:from|franochmed)$/.test(h)||/(?:giltigt|giltig|avtal|hyresperiod).*from$/.test(h)?'start':'';
        if(dateField)contextualTarget=inferred+'.'+(inferred==='activities'?dateField+'Date':dateField);
      }
      if(inferred==='contracts'&&/^(?:forlangningstid|forlangningsperiod)(?:manader|man)?$/.test(h))contextualTarget='contracts.renewalPeriodMonths';
      if(inferred==='contracts'&&/^(?:uppsagningstid)(?:manader|man)?$/.test(h))contextualTarget='contracts.noticePeriodMonths';
      const target=rule?.target || contextualTarget || aliases[h] || candidate?.target || '@extra';
      const examples=values.slice(0,3).map(value=>{
        if(/\.(?:start|end|startDate|endDate)$/.test(target)&&typeof value==='number'&&value>0&&value<100000){const d=XLSX.SSF.parse_date_code(value);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}
        return value;
      });
      return {header:String(header),index,target,collection:rule?.collection || (target.startsWith('@')?inferred:target.split('.')[0]),
        transform:rule?.transform || (norm(header)==='manadshyra'?'monthly':'auto'),
        examples,reason:contextualTarget&&!rule?'Avtalssammanhang och kolumnens betydelse används för förslaget.':'',filled:values.length,missing:matrix.slice(headerIndex+1).length-values.length,
        approved:Boolean(rule),identity:rule?.identity || /^(avtalsnummer|avtalsnr|fastighetsbeteckning|fastbet|epost|email)$/.test(norm(header))};
    }).filter(Boolean);
    return {name,signature,headerIndex,headerRow:start+headerIndex+1,startColumn:sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']).s.c:0,columns,rowCount:matrix.slice(headerIndex+1).filter(r=>r.some(present)).length,inferred};
  });
}
function convert(cell, column, XLSX) {
  let value=cell?.v ?? '';
  const field=column.target.split('.')[1] || '';
  if(/DocumentUrl$/.test(field)) value=cell?.l?.Target || value;
  if(column.transform==='text')return String(value);
  if(/^(area|baseRent|baseAdditions|annual|employees|users|rooms|commonArea|apartmentArea|latitude|longitude|estimatedCost|orderedCost|finalCost|planningYear|noticePeriod|renewalPeriod|rentBase|additionBase|rentIndexPercent|additionIndexPercent)/.test(field)){
    const numeric=String(value).replace(/[\s\u00a0]/g,'').replace(/(?:kr|sek|%)$/i,'').replace(/(?:mån|månader|man|manader)$/i,/Months$/.test(field)?'':'$&');
    const n=typeof value==='number'?value:Number(numeric.includes(',')?numeric.replace(/\./g,'').replace(',','.'):numeric);
    if(!Number.isFinite(n))throw Error('Ogiltigt tal');
    if(/Percent$/.test(field)&&typeof value==='number'&&cell.z?.includes('%'))return n*100;
    if(column.transform==='thousands')return n*1000;
    return column.transform==='monthly'?n*12:n;
  }
  if(/^(start|end|.*Date|orderedAt|paidAt|completedAt)$/.test(field)&&typeof value==='number'){
    const date=XLSX.SSF.parse_date_code(value);
    if(!date)throw Error('Ogiltigt datum');
    return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  return value;
}
function identify(records, values, collection, identity) {
  const keys=identity.length?identity:({properties:['designation'],contracts:['number'],people:['email'],organizations:['name'],orders:['orderReference'],activities:['sourceId']}[collection]||[]);
  const usable=keys.filter(k=>present(values[k]));
  const hits=usable.length?records.filter(r=>usable.every(k=>norm(r[k])===norm(values[k]))):[];
  if(hits.length===1){
    if(collection==='properties'&&present(values.city)&&present(hits[0].city)&&norm(values.city)!==norm(hits[0].city))return {kind:'B',candidates:hits,reason:'Identitet överensstämmer men ort skiljer sig'};
    return {kind:'A',record:hits[0],reason:'Unik identitet: '+usable.join(', ')};
  }
  if(hits.length>1)return {kind:'B',candidates:hits,reason:'Flera poster har samma identitet'};
  if(collection==='properties' && present(values.address)){
    const candidates=records.filter(r=>norm(r.address)===norm(values.address));
    const safe=candidates.filter(r=>present(values.city)&&norm(r.city)===norm(values.city)&&(!present(values.designation)||!present(r.designation)||norm(r.designation)===norm(values.designation)));
    if(safe.length===1&&candidates.length===1)return {kind:'A',record:safe[0],reason:'Unik adress och samma ort'};
    if(candidates.length)return {kind:'B',candidates,reason:'Adress finns, identiteten behöver granskas'};
  }
  const enough = collection==='properties' ? present(values.designation)||(present(values.address)&&present(values.city)) : usable.length>0;
  return {kind:enough?'C':'D',reason:enough?'Ingen befintlig identitet hittades':'Tillräcklig identitet saknas'};
}
export async function fingerprint(buffer) {
  const hash=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function prepareMappedImport(workbook, profiles, base, context, XLSX) {
  const data=copy(base), changes=[], decisions=[];
  const at=context.at || new Date().toISOString();
  const sourceId='source:'+context.fingerprint;
  data.sourceRegistry ||= []; data.auditLog ||= []; data.importReview ||= []; data.importMappings ||= [];
  const counts={propertiesBefore:(base.properties||[]).length,contractsBefore:(base.contracts||[]).length,matched:0,created:0,fields:0,conflicts:0,preserved:0,unresolved:0};
  const source={id:sourceId,name:context.fileName,fingerprint:context.fingerprint,importedAt:at,kind:'mapped-excel',sheets:profiles.map(p=>p.name)};
  if(!data.sourceRegistry.some(s=>s.id===sourceId))data.sourceRegistry.push(source);
  for(const profile of profiles){
    const ruleId=profile.name+'|'+profile.signature;
    const old=data.importMappings.find(r=>r.id===ruleId);
    const rule={id:ruleId,sheet:profile.name,signature:profile.signature,columns:profile.columns.map(c=>({header:c.header,target:c.target,collection:c.collection,transform:c.transform,identity:c.identity})),version:old?.version||1,approvedBy:context.actor,actorVerified:false,approvedAt:at};
    if(old&&!equal(old.columns,rule.columns))rule.version++;
    if(!old)data.importMappings.push(rule);else if(!equal(old.columns,rule.columns))Object.assign(old,rule);
    const sheet=workbook.Sheets[profile.name];
    const range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):null;
    if(!range)continue;
    for(let r=profile.headerRow;r<=range.e.r;r++){
      const groups=new Map();
      for(const column of profile.columns){
        if(column.target==='@ignore')continue;
        const address=XLSX.utils.encode_cell({r,c:column.index+profile.startColumn});
        const cell=sheet[address];if(!present(cell?.v)&&!cell?.l&&!cell?.f)continue;
        const collection=column.target==='@extra'?column.collection:column.target.split('.')[0];
        if(!groups.has(collection))groups.set(collection,{values:{},origins:{},extras:[],identity:[],errors:[]});
        const group=groups.get(collection);
        const origin={source:context.fileName,sourceId,sheet:profile.name,column:column.header,row:r+1,cell:address,originalValue:cell?.v??'',originalFormula:cell?.f||'',hyperlink:cell?.l?.Target||'',at,mappingRule:ruleId,mappingVersion:rule.version,decision:'manual-mapping',confirmedBy:context.actor,actorVerified:false,normalization:column.transform};
        if(column.target==='@extra') {group.extras.push({label:column.header,value:cell.v??cell.f,provenance:origin});continue;}
        const field=column.target.split('.')[1];
        if(cell.f&&!present(cell.v)){group.origins[field]=origin;group.errors.push(column.header+': formeln saknar beräknat värde');continue;}
        if(!fieldCatalog(context.schemas).some(f=>f.target===column.target)){group.errors.push('Ogiltigt målfält');continue;}
        if(Object.hasOwn(group.values,field)){group.errors.push('Flera kolumner kopplas till '+field);continue;}
        try{group.values[field]=convert(cell,column,XLSX);group.origins[field]=origin;}catch(e){group.errors.push(column.header+': '+e.message);}
        if(column.identity)group.identity.push(field);
      }
      const rowRecords={};
      for(const [collection,group] of [...groups].sort(([a],[b])=>['properties','organizations','people','contracts','activities','orders'].indexOf(a)-['properties','organizations','people','contracts','activities','orders'].indexOf(b))){
        data[collection] ||= [];
        const key=profile.name+'|'+(r+1)+'|'+collection;
        const override=context.decisions?.[key];
        if(override==='ignore'){decisions.push({sheet:profile.name,row:r+1,collection,classification:'D',reason:'Ignorerad av användaren',values:group.values});continue;}
        if(collection==='contracts'&&rowRecords.properties)group.values.propertyId=rowRecords.properties;
        const parents={propertyId:'properties',contractId:'contracts',activityId:'activities',organizationId:'organizations',ownerPartyId:'organizations',responsiblePersonId:'people'};
        for(const [field,parent] of Object.entries(parents)){
          if(!present(group.values[field]))continue;
          const values=data[parent]||[], value=group.values[field];
          const candidates=values.filter(x=>x.id===value || [x.designation,x.address,x.number,x.name,x.title].filter(present).some(v=>norm(v)===norm(value)));
          if(candidates.length===1)group.values[field]=candidates[0].id;else group.errors.push('Relationen '+field+' är inte entydig');
        }
        let match=group.errors.length?{kind:'D',reason:group.errors.join('; ')}:identify(data[collection],group.values,collection,group.identity);
        if(override?.recordId&&!group.errors.length){const chosen=data[collection].find(x=>x.id===override.recordId);if(chosen)match={kind:'A',record:chosen,reason:'Manuellt vald koppling'};}
        if(override?.parentId){group.values[collection==='orders'?'activityId':'propertyId']=override.parentId;}
        const entry={sheet:profile.name,row:r+1,collection,classification:match.kind,reason:match.reason,values:group.values,candidates:(match.candidates||[]).map(copy),extras:group.extras,origins:group.origins};
        decisions.push(entry);
        if(['B','D'].includes(match.kind)){
          const id=sourceId+'|'+profile.name+'|'+(r+1)+'|'+collection;
          if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'mapped-identity',source:context.fileName,status:'pending',...entry});
          counts.unresolved++;continue;
        }
        let record=match.record;
        if(!record){record={id:crypto.randomUUID(),provenance:{}};data[collection].push(record);counts.created++;}
        else counts.matched++;
        rowRecords[collection]=record.id;
        entry.recordId=record.id;
        record.provenance ||= {};
        for(const [field,value] of Object.entries(group.values)){
          group.origins[field] ||= {source:context.fileName,sourceId,sheet:profile.name,row:r+1,at,value,decision:'derived-relation',inputs:Object.values(group.origins).map(o=>o.cell).filter(Boolean),confirmedBy:context.actor,actorVerified:false};
          const current=record[field];
          if(equal(current,value)||(!present(value)))continue;
          const previous=record.provenance[field];
          const protectedValue=previous?.source==='manual'||previous?.manual===true||(['latitude','longitude'].includes(field)&&(record.geoSource==='manual'||Boolean(record.geoConfirmedAt)));
          const preference=data.importFieldPreferences?.[[collection,field,context.fileName].map(x=>x.toLocaleLowerCase('sv')).join('|')];
          if((present(current)||protectedValue)&&(protectedValue||preference!=='accept')){
            if(preference==='reject'&&!protectedValue)continue;
            const id=sourceId+'|'+record.id+'|'+field+'|'+JSON.stringify(value);
            if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'operational-conflict',status:'pending',source:context.fileName,collection,recordId:record.id,field,current,proposed:value,sheet:profile.name,row:r+1,provenance:group.origins[field],currentSource:previous?.source||'Lokalblick-data',recordLabel:record.address||record.number||record.name||record.title||record.id,protectedValue});
            counts.conflicts++;continue;
          }
          changes.push({collection,recordId:record.id,field,from:current??'',to:value,provenance:group.origins[field]});
          record[field]=value;record.provenance[field]={...group.origins[field],value,matchReason:match.reason,identityDecision:override?.recordId?'manual':'automatic'};counts.fields++;
        }
        record.supplemental ||= [];
        for(const extra of group.extras){
          if(!record.supplemental.some(x=>x.label===extra.label&&equal(x.value,extra.value)&&x.provenance?.sourceId===sourceId)){record.supplemental.push(extra);counts.preserved++;}
        }
      }
    }
  }
  // Contracts and orders without their required parent remain staged for review.
  for(const entry of decisions.filter(d=>d.classification==='C'&&['contracts','orders'].includes(d.collection))){
    const list=data[entry.collection], record=list.find(x=>x.id===entry.recordId);
    const parent=entry.collection==='contracts'?'propertyId':'activityId';
    if(!record?.[parent]){
      list.splice(list.indexOf(record),1);counts.created--;counts.unresolved++;
      changes.splice(0,changes.length,...changes.filter(c=>c.recordId!==entry.recordId));
      entry.classification='B';entry.reason='Hemvist saknas: välj rätt '+(parent==='propertyId'?'fastighet':'aktivitet');
      const id=sourceId+'|'+entry.sheet+'|'+entry.row+'|'+entry.collection;
      if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'mapped-identity',source:context.fileName,status:'pending',...entry});
    }
  }
  counts.fields=changes.length;
  counts.propertiesAfter=(data.properties||[]).length;counts.contractsAfter=(data.contracts||[]).length;
  const registered=data.sourceRegistry.find(s=>s.id===sourceId);
  if(!registered.rows)Object.assign(registered,{rows:profiles.reduce((n,p)=>n+p.rowCount,0),matched:counts.matched,created:counts.created,review:counts.unresolved+counts.conflicts});
  for(const change of changes)data.auditLog.push({id:crypto.randomUUID(),at,by:context.actor,actorVerified:false,collection:change.collection,recordId:change.recordId,action:'Importerad',fields:[{field:change.field,from:change.from,to:change.to,provenance:change.provenance}]});
  data.isDemo=false;
  return {data,report:{profile:'Mappad Excelimport',fileName:context.fileName,counts,decisions,changes}};
}

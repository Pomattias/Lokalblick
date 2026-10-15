/* Shared import decisions. Adapters interpret columns; these rules decide writes. */
(function(root){
  const copy=x=>JSON.parse(JSON.stringify(x));
  const present=x=>x!=null&&(typeof x!=='string'||x.trim()!=='');
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const key=x=>String(x??'').trim().toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
  const exactKey=x=>String(x??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
  const entities=['organizations','people','properties','objects','contracts','activities','orders','businesses','contractBusinesses','assignments','operations','maintenanceStatus'];
  const protectedField=field=>['id','sourceId','objectId','propertyId','contractId','activityId'].includes(field);
  // A fresh index belongs to one import run. Buckets retain all candidates so
  // duplicate identities are still reviewed rather than arbitrarily selected.
  function createIndex(records){
    const indexes=new Map(), snapshots=new WeakMap();
    function add(field,record){
      const value=key(record[field]), map=indexes.get(field);
      if(!map.has(value))map.set(value,new Set());map.get(value).add(record);
      let saved=snapshots.get(record);if(!saved){saved=new Map();snapshots.set(record,saved);}saved.set(field,value);
    }
    function lookup(field,value){
      if(!indexes.has(field)){indexes.set(field,new Map());for(const record of records)add(field,record);}
      return [...(indexes.get(field).get(key(value))||[])];
    }
    function update(record){
      for(const [field,map] of indexes){
        const previous=snapshots.get(record)?.get(field);if(previous!==undefined)map.get(previous)?.delete(record);
        add(field,record);
      }
    }
    return {lookup,update};
  }
  function identify(records,values,collection,identity=[],index){
    const businessIdentity=collection==='businesses'?(present(values.id)?['id']:present(values.sourceId)?['sourceId']:present(values.organizationId)&&present(values.name)&&(present(values.unitId)||present(values.type))?['name','organizationId',...(present(values.unitId)?['unitId']:[]),...(present(values.type)?['type']:[])]:[]):null;
    if(collection==='businesses'&&!identity.length&&!businessIdentity.length){const candidates=records.filter(r=>exactKey(r.name)===exactKey(values.name));if(candidates.length)return {kind:'B',candidates,reason:'Verksamhetsnamn kräver säker organisations- eller källidentitet'};return {kind:present(values.name)?'C':'D',reason:present(values.name)?'Ny verksamhet, ingen namnmatchning':'Verksamhetsidentitet saknas'};}
    const keys=identity.length?identity:businessIdentity||({properties:present(values.sourceId)?['sourceId']:['designation'],objects:['number','propertyId'],contracts:['number'],people:['email'],organizations:['name'],orders:['orderReference'],activities:['sourceId'],contractBusinesses:['contractId','businessId','fromDate'],assignments:['personId','targetType','targetId','role','fromDate']}[collection]||[]);
    const usable=keys.filter(k=>present(values[k]));
    const objectIdentified=collection!=='objects'||identity.some(k=>k!=='propertyId'&&present(values[k]))||present(values.number)||present(values.id)||present(values.sourceId);
    const hits=usable.length&&objectIdentified?(index?index.lookup(usable[0],values[usable[0]]):records).filter(r=>(collection!=='objects'||r.propertyId===values.propertyId)&&usable.every(k=>['businesses','organizations'].includes(collection)&&k==='name'?exactKey(r[k])===exactKey(values[k]):collection==='businesses'&&k==='sourceId'?String(r[k]||'').trim()===String(values[k]||'').trim():key(r[k])===key(values[k]))):[];
    if(hits.length===1){
      if(collection==='businesses'&&present(values.organizationId)&&present(hits[0].organizationId)&&values.organizationId!==hits[0].organizationId)return {kind:'B',candidates:hits,reason:'Verksamhetens käll-ID pekar på olika organisationer'};
      if(collection==='properties'&&present(values.city)&&present(hits[0].city)&&key(values.city)!==key(hits[0].city))return {kind:'B',candidates:hits,reason:'Identitet överensstämmer men ort skiljer sig'};
      return {kind:'A',record:hits[0],reason:'Unik identitet: '+usable.join(', ')};
    }
    if(hits.length>1)return {kind:'B',candidates:hits,reason:'Flera poster har samma identitet'};
    if(collection==='properties'&&present(values.address)){
      const candidates=(index?index.lookup('address',values.address):records).filter(r=>key(r.address)===key(values.address)&&(!present(values.sourceId)||!present(r.sourceId)||key(r.sourceId)===key(values.sourceId)));
      const safe=candidates.filter(r=>present(values.city)&&key(r.city)===key(values.city)&&(!present(values.designation)||!present(r.designation)||key(values.designation)===key(r.designation)));
      if(safe.length===1&&candidates.length===1)return {kind:'A',record:safe[0],reason:'Unik adress och samma ort'};
      if(candidates.length)return {kind:'B',candidates,reason:'Adress finns, identiteten behöver granskas'};
    }
    const enough=collection==='objects'?objectIdentified:collection==='properties'?present(values.id)||present(values.sourceId)||present(values.designation)||(present(values.address)&&present(values.city)):usable.length>0;
    return {kind:enough?'C':'D',reason:enough?'Ingen befintlig identitet hittades':'Tillräcklig identitet saknas'};
  }
  function decideField(data,collection,record,field,value,origin){
    const previous=record.provenance?.[field],current=record[field];
    if(equal(current,value)||!present(value))return {action:'keep'};
    const approved=(data.importReview||[]).some(r=>r.kind==='operational-conflict'&&r.status==='accepted'&&r.collection===collection&&r.recordId===record.id&&r.field===field&&r.resolvedBy&&r.resolvedAt&&equal(r.current,current)&&equal(r.proposed,value));
    if(approved)return {action:'write'};
    const model=root.LokalblickResponsibility,role=model?.fields[field],type=role&&Object.keys(model.types).find(t=>model.types[t]===collection);
    if(type&&model.history(data,type,record.id,role).length)return {action:'review',protectedValue:true,current,proposed:value,reason:'Ansvarbyte behöver ett giltighetsdatum'};
    const protectedValue=previous?.source==='manual'||previous?.manual===true||(['latitude','longitude'].includes(field)&&(record.geoSource==='manual'||Boolean(record.geoConfirmedAt)));
    const preference=data.importFieldPreferences?.[[collection,field,origin.source||''].map(x=>String(x).trim().toLocaleLowerCase('sv')).join('|')];
    if(protectedValue||(present(current)&&preference!=='accept')||(protectedField(field)&&present(current))){
      if(preference==='reject'&&!protectedValue)return {action:'keep'};
      return {action:'review',protectedValue,current,proposed:value};
    }
    return {action:'write'};
  }
  function applyField(data,collection,record,field,value,origin){
    const decision=decideField(data,collection,record,field,value,origin);
    if(decision.action==='write'){record[field]=copy(value);record.provenance ||= {};record.provenance[field]={...copy(origin),value:copy(value)};}
    if(decision.action==='review'){
      data.importReview ||= [];
      const id=[origin.sourceId||origin.source,collection,record.id,field,JSON.stringify(value)].join('|');
      if(!data.importReview.some(r=>r.id===id))data.importReview.push({id,kind:'operational-conflict',status:'pending',source:origin.source,collection,recordId:record.id,field,current:copy(decision.current),proposed:copy(value),sheet:origin.sheet,row:origin.row,provenance:copy(origin),currentSource:record.provenance?.[field]?.source||'Lokalblick-data',protectedValue:decision.protectedValue});
    }
    return decision;
  }
  const aliases={name:['Namn','Benämning','Part','Objektnamn'],moveInDate:['Inflyttningsdatum','Inflyttning'],moveOutDate:['Utflyttningsdatum','Utflyttning'],number:['Avtalsnummer','Avtalsnr','Objektnummer'],address:['Adress','Gatuadress','Postadress'],designation:['Fast.bet','Fastighetsbeteckning'],baseRent:['Bashyra','Grundhyra','Årshyra'],area:['BRA','Area','kvm','Lokalyta (kvm)'],estimatedCost:['Bedömd kostnad','Uppskattat pris investering exkl moms, tkr','Uppskattat pris drift exkl moms, tkr'],orderedCost:['Pris investering','Pris drift & underhåll'],orderReference:['Reqs','Diarienr'],title:['Vad ska göras','Produktnamn/beskrivning','Aktivitet'],start:['From','Fr.o.m.'],end:['Tom','T.o.m.']};
  function provenance(workbook,record,field,source,schemas=[],cache){
    const known=record.provenance?.[field];
    const origin={...(known&&known.source!=='manual'?copy(known):{}),source:!workbook&&known?.source&&known.source!=='manual'?known.source:source,sourceId:workbook?.__importSources?.find(s=>s.fileName===source)?.fingerprint?'source:'+workbook.__importSources.find(s=>s.fileName===source).fingerprint:known?.sourceId||'source:'+source};
    origin.at ||= new Date().toISOString();origin.actorVerified=false;
    origin.sheet ||= record.sourceSheet||'';origin.row ||= record.enrichmentSourceRow||record.sourceRow||0;
    const sheet=workbook?.Sheets?.[origin.sheet],XLSX=root.XLSX||root.window?.XLSX;
    if(!sheet||!XLSX||!Number(origin.row))return origin;
    const r=Number(origin.row)-1,range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):null;if(!range)return origin;
    let sheetCache=cache?.get(sheet);
    if(cache&&!sheetCache){sheetCache=new Map();cache.set(sheet,sheetCache);}
    let scan=sheetCache?.get(field);
    if(!scan){
      const labels=new Set([field,...(aliases[field]||[]),...schemas.flatMap(s=>s.columns.filter(c=>c[0]===field).flatMap(c=>[c[1],...(s.labelAliases?.[field]||[])]))].map(key));
      const headerRows=[];
      for(let h=range.s.r;h<Math.min(range.e.r+1,range.s.r+50);h++){
        const columns=[];for(let c=range.s.c;c<=range.e.c;c++)if(labels.has(key(sheet[XLSX.utils.encode_cell({r:h,c})]?.v)))columns.push(c);
        headerRows.push({row:h,columns});
      }
      scan={headerRows};sheetCache?.set(field,scan);
    }
    let header=-1,best=0,matchedColumns=[];
    for(const candidate of scan.headerRows){if(candidate.row>=r)break;if(candidate.columns.length>best){best=candidate.columns.length;header=candidate.row;matchedColumns=candidate.columns;}}
    const matches=[];origin.inputs=[];
    for(let c=range.s.c;c<=range.e.c;c++){
      const address=XLSX.utils.encode_cell({r,c}),cell=sheet[address];if(!cell||!present(cell.v)&&!cell.f)continue;
      const input={cell:address,originalValue:cell.v??'',originalFormula:cell.f||'',originalFormat:cell.z||'',hyperlink:cell.l?.Target||''};origin.inputs.push(input);
      if(header>=0&&matchedColumns.includes(c))matches.push({...input,column:String(sheet[XLSX.utils.encode_cell({r:header,c})].v)});
    }
    if(matches.length===1){Object.assign(origin,matches[0]);delete origin.inputs;}
    return origin;
  }
  function reconcile(base,result,workbook,source,schemas=[]){
    const candidate=result.data,data=copy(candidate),changes=[],remap=new Map(),provenanceCache=new WeakMap();data.importReview ||= [];
    data.importFieldPreferences=copy(candidate.importFieldPreferences||base.importFieldPreferences||{});
    for(const collection of entities){
      const rows=copy(base[collection]||[]);data[collection]=rows;const index=createIndex(rows);
      for(const incoming of candidate[collection]||[]){
        const proposed=copy(incoming);
        for(const field of ['propertyId','objectId','contractId','activityId','businessId','ownerPartyId','organizationId','responsiblePersonId','orderedByPersonId'])if(remap.has(proposed[field]))proposed[field]=remap.get(proposed[field]);
        const existing=index.lookup('id',proposed.id).find(r=>r.id===proposed.id);
        let match=existing?{kind:'A',record:existing}:identify(rows,proposed,collection,[],index);
        // Parser-generated IDs anchor legacy rows lacking a human identifier.
        if(match.kind==='D'&&present(proposed.id))match={kind:'C'};
        if(['B','D'].includes(match.kind)){
          const id=['identity',source,collection,proposed.id].join('|');if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,status:'pending',kind:'mapped-identity',source,collection,values:proposed,reason:match.reason,candidates:(match.candidates||[]).map(copy)});continue;
        }
        const record=match.record||{id:proposed.id,provenance:{}};if(!match.record)rows.push(record);remap.set(proposed.id,record.id);
        for(const [field,proposedValue] of Object.entries(proposed)){
          let value=proposedValue;
          if(['id','provenance'].includes(field)||equal(record[field],value))continue;
          const origin=provenance(workbook,proposed,field,source,schemas,provenanceCache),from=copy(record[field]??'');
          const formats=root.LokalblickImportFormats||root.window?.LokalblickImportFormats;
          if(formats&&workbook?.Sheets&&origin.cell&&!protectedField(field)&&!field.endsWith('Id')&&(formats.dateField(field)||formats.numberField(field))){
            try{value=formats.interpretCell({v:origin.originalValue,z:origin.originalFormat},{target:collection+'.'+field,header:origin.column,date1904:Boolean(workbook?.Workbook?.WBProps?.date1904||workbook?.__importSources?.find(s=>s.sheetName===origin.sheet)?.date1904)},root.XLSX||root.window?.XLSX);
              if(/IndexPercent$/.test(field)&&Number(proposedValue)<=1&&Number(value)>1)value/=100;
            }catch(error){const id=['invalid',source,collection,record.id,field].join('|');if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'invalid-import-field',status:'pending',source,collection,recordId:record.id,field,reason:error.message,provenance:origin});continue;}
          }
          if(applyField(data,collection,record,field,value,origin).action==='write')changes.push({collection,recordId:record.id,field,from,to:copy(value),provenance:origin});
        }
        index.update(record);
        record.provenance ||= {};
        for(const [field,origin] of Object.entries(proposed.provenance||{}))if(!record.provenance[field]&&equal(record[field],proposed[field]))record.provenance[field]=copy(origin);
      }
    }
    data.auditLog=copy(base.auditLog||[]);
    for(const change of changes)data.auditLog.push({id:root.crypto?.randomUUID?.()||'import|'+Date.now()+'|'+data.auditLog.length,at:new Date().toISOString(),by:change.provenance.confirmedBy||'Excelimport',actorVerified:false,collection:change.collection,recordId:change.recordId,action:'Importerad',fields:[{field:change.field,from:change.from,to:change.to,provenance:change.provenance}]});
    for(const review of data.importReview){
      if(remap.has(review.recordId))review.recordId=remap.get(review.recordId);
      if(review.kind==='operational-conflict'){
        const collection=review.collection||(review.entity==='Avtal'?'contracts':review.entity==='Fastighet'?'properties':''),record=(base[collection]||[]).find(r=>r.id===review.recordId),previous=record?.provenance?.[review.field];
        if(previous?.source==='manual'||previous?.manual===true)review.protectedValue=true;
        if(!review.provenance&&review.field)review.provenance=provenance(workbook,{sourceSheet:review.sheet,sourceRow:review.row},review.field,review.source||source,schemas,provenanceCache);
      }
    }
    root.LokalblickObjectModel?.normalize(data);
    root.LokalblickBusinessModel?.normalize(data);
    root.LokalblickResponsibility?.normalize(data);
    return {...result,data,report:{...result.report,commonRules:true,changes,counts:{...result.report?.counts,conflicts:data.importReview.filter(x=>x.kind==='operational-conflict'&&x.status==='pending').length}}};
  }
  const api={createIndex,identify,decideField,applyField,provenance,reconcile};root.LokalblickImportRules=api;if(root.window)root.window.LokalblickImportRules=api;
})(globalThis);

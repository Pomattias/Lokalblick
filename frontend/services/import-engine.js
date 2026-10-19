import '../domain/import-rules.js';
import '../domain/responsibility-model.js';
import '../domain/business-model.js';
import {interpretCell,profileFormat,parseDate,dateField,numberField} from './import-formats.js';
// Shared, local-only preparation for unknown workbook structures.
// Uses the canonical schemas owned by source-service, never a second data model.
const copy = x => JSON.parse(JSON.stringify(x));
const norm = x => String(x ?? '').trim().toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const present = x => x != null && (typeof x!=='string'||x.trim()!=='');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fieldName=x=>norm(String(x).replace(/(?:[, ]+|\()(?:m²|m2|kvm|tkr|mkr|kr|kronor|sek|%)(?:\s*\/\s*(?:år|ar|mån|man))?\)?$/i,''));
const aliases = {
  'fastbet':'properties.designation', 'fastighetsbeteckning':'properties.designation',
  'adress':'properties.address', 'gatuadress':'properties.address', 'ort':'properties.city', 'postort':'properties.city',
  'forvaltningsobjekt':'properties.sourceId',
  'verksamhetsid':'businesses.sourceId','verksamhetsnamn':'businesses.name','avtalverksamhet':'contractBusinesses.contractId','nyttjadarea':'contractBusinesses.usedArea','kostnadsandel':'contractBusinesses.costSharePercent',
  'aktivitetsid':'activities.sourceId', 'projektid':'activities.sourceId',
  'objektnr':'objects.number', 'objektnummer':'objects.number', 'objektsnummer':'objects.number',
  'avtalsnr':'contracts.number', 'avtalsnummer':'contracts.number',
  'bra':'contracts.area', 'lokalarea':'contracts.area', 'kvm':'contracts.area',
  'arshyra':'contracts.baseRent', 'manadshyra':'contracts.baseRent',
  'epost':'people.email', 'email':'people.email', 'telefon':'people.phone',
  'hyresgast':'contracts.tenantName', 'verksamhet':'contracts.businessName',
};
export function fieldCatalog(schemas,reviewed=false) {
  const labels={businessId:'Verksamhet',personId:'Person',targetType:'Måltyp',targetId:'Mål',roleKey:'Rollnyckel',tenantPartyId:'Hyresgäst',tenantResponsiblePersonId:'Hyresgästens kontaktperson',businessPartyId:'Verksamhetens part',businessResponsiblePersonId:'Verksamhetsansvarig',ownerResponsiblePersonId:'Fastighetsägarens kontaktperson',orderedByPersonId:'Beställd av',sourceId:'Källans identifierare',objectId:'Objekt',propertyId:'Fastighet',contractId:'Avtal',activityId:'Aktivitet',organizationId:'Organisation',ownerPartyId:'Fastighetsägare',responsiblePersonId:'Ansvarig hos oss'};
  const legacyRelations=['sourceId','objectId','propertyId','contractId','activityId','organizationId','ownerPartyId','responsiblePersonId','personId','targetType','targetId','tenantPartyId','tenantResponsiblePersonId','businessId'];
  const reviewedLabels={costCenterPremises:'Kostnadsställe lokaler',costCenterOperations:'Kostnadsställe drift'};
  return schemas.flatMap(s => s.columns.filter(([k,,hidden]) => (!hidden || legacyRelations.includes(k) || reviewed&&Object.hasOwn(labels,k)) && !/^(geo|enrichment)/.test(k))
    .map(([field,label]) => ({target:s.key+'.'+field,collection:s.key,field,aliases:[...(s.labelAliases?.[field]||[]),...(reviewed&&reviewedLabels[field]?[label]:[])],label:s.sheet+' → '+(reviewed&&reviewedLabels[field]|| (label.startsWith('_')?labels[field]||label:label))})));
}
export function profileWorkbook(workbook, schemas, XLSX, saved = [], options={}) {
  const fields = fieldCatalog(schemas,options.reviewed);
  const knownLabels=new Set(fields.map(f=>norm(f.label.split(' → ')[1])));
  return workbook.SheetNames.map(sheetKey => {
    const source=workbook.__importSources?.find(s=>s.sheetKey===sheetKey);
    const name=source?.sheetName||sheetKey;
    const sheet = workbook.Sheets[sheetKey];
    const matrix = XLSX.utils.sheet_to_json(sheet, {header:1,defval:'',blankrows:true});
    const start = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0;
    let headerIndex = 0, best = -1;
    matrix.slice(0,50).forEach((row,i) => {
      const values = row.filter(present);
      const known = values.filter(v => aliases[norm(v)] || knownLabels.has(norm(v))).length;
      const score = known*8 + values.filter(v=>typeof v==='string').length - values.filter(v=>typeof v==='number').length;
      if(score>best){best=score;headerIndex=i;}
    });
    const headers = matrix[headerIndex] || [];
    const headerKeys=headers.filter(present).map(norm);
    const contractSignals=headerKeys.filter(h=>/avtals|hyra|hyres|uppsagning|forlangning/.test(h));
    const signature = JSON.stringify(headers.filter(present).map(norm).sort());
    const previous = saved.find(s => s.sheet===name && (!source?.fileName||!s.fileName||s.fileName===source.fileName) && s.signature===signature);
    const inferred = /lopandekostnad/.test(norm(name))?'recurringCosts':/avtalverksamhet/i.test(name)?'contractBusinesses':/verksamheter|verksamhetsregister/i.test(name)?'businesses':/ansvar|tilldelning/i.test(name)?'assignments':/part|organisation/i.test(name)?'organizations':/best[aä]llning|order/i.test(name)?'orders':/aktivitet/i.test(name)?'activities': /^objekt/i.test(name)?'objects': /person|kontakt/i.test(name) ? 'people' : /avtal|hyra/i.test(name) || contractSignals.length>=2 || headerKeys.some(h=>/^avtals(?:nummer|nr)$/.test(h)) ? 'contracts' : /projekt|underhall|drift|onskemal/i.test(norm(name)) ? 'activities' : 'properties';
    const columns = headers.map((header,index) => {
      if(!present(header)) return null;
      const values=matrix.slice(headerIndex+1).map(r=>r[index]).filter(present);
      const choices=fields.filter(f=>fieldName(f.label.split(' → ')[1])===fieldName(header)||f.aliases.some(a=>fieldName(a)===fieldName(header)));
      let candidate=choices.find(f=>f.collection===inferred) || (choices.length===1?choices[0]:null);
      if(/^(tom|from)$/.test(norm(header))&&!['objects','contracts','activities'].includes(inferred))candidate=null;
      const rule=previous?.columns?.find(c=>norm(c.header)===norm(header));
      const h=norm(header);
      let contextualTarget='';
      if(['objects','contracts','activities'].includes(inferred)){
        const dateField=/^(?:tom|tillochmed)$/.test(h)||/(?:giltigt|giltig|avtal|hyresperiod).*tom$/.test(h)?'end':/^(?:from|franochmed)$/.test(h)||/(?:giltigt|giltig|avtal|hyresperiod).*from$/.test(h)?'start':'';
        if(dateField)contextualTarget=inferred+'.'+(inferred==='activities'?dateField+'Date':dateField);
      }
      if(inferred==='contracts'&&/^(?:forlangningstid|forlangningsperiod)(?:manader|man)?$/.test(h))contextualTarget='contracts.renewalPeriodMonths';
      if(inferred==='contracts'&&/^(?:uppsagningstid)(?:manader|man)?$/.test(h))contextualTarget='contracts.noticePeriodMonths';
      if(inferred==='businesses'){contextualTarget=({namn:'businesses.name',verksamhet:'businesses.name',organisation:'businesses.organizationId',part:'businesses.organizationId',verksamhetsid:'businesses.sourceId'})[h]||contextualTarget;}
      if(inferred==='contractBusinesses'){contextualTarget=({avtalsnummer:'contractBusinesses.contractId',avtal:'contractBusinesses.contractId',verksamhet:'contractBusinesses.businessId'})[h]||contextualTarget;}
      if(inferred==='assignments'){contextualTarget=({person:'assignments.personId',mal:'assignments.targetId',maltyp:'assignments.targetType',fran:'assignments.fromDate',till:'assignments.toDate'})[h]||contextualTarget;}
      if(/^(?:id|identifierare|kallansidentifierare)$/.test(h)&&fields.some(f=>f.target===inferred+'.sourceId'))contextualTarget=inferred+'.sourceId';
      // Recognized source captions are still only suggestions: every column
      // goes through the same reviewed mapping, including explicit exclusions.
      const sourceTarget=options.reviewed?({objektsnummerforvaltningsobjekt:'properties.sourceId',postadress:'properties.address',lokalytakvm:'contracts.area',avtalsid:'contracts.number'})[h]:'';
      const target=rule?.target || sourceTarget || contextualTarget || aliases[h] || aliases[fieldName(header)] || candidate?.target || (options.reviewed?'@unmapped':'@extra');
      const date1904=Boolean(workbook.Workbook?.WBProps?.date1904||source?.date1904);
      const format=profileFormat(matrix.slice(headerIndex+1).map((r,ri)=>sheet[XLSX.utils.encode_cell({r:start+headerIndex+1+ri,c:index+(sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']).s.c:0)})]).filter(Boolean),{target,header:String(header),date1904},XLSX);
      const formatSample=(value,cell)=>{
        if(format.type==='text'&&typeof value==='number'&&/^0{2,}$/.test(cell?.z||''))return XLSX.utils.format_cell(cell);
        if(format.type==='date'&&value!==''){try{return parseDate(value,XLSX,date1904);}catch{}}
        return value;
      };
      const samples=matrix.slice(headerIndex+1,headerIndex+4).map((r,ri)=>formatSample(r[index]??'',sheet[XLSX.utils.encode_cell({r:start+headerIndex+1+ri,c:index+(sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']).s.c:0)})]));
      const examples=values.slice(0,3).map(value=>formatSample(value));
      return {header:String(header),index,target,collection:rule?.collection || (target.startsWith('@')?inferred:target.split('.')[0]),
        transform:(rule?.transform==='text'?'auto':rule?.transform) || (norm(header)==='manadshyra'?'monthly':'auto'),
        examples,samples,format,date1904,reason:contextualTarget&&!rule?'Avtalssammanhang och kolumnens betydelse används för förslaget.':'',filled:values.length,missing:matrix.slice(headerIndex+1).length-values.length,
        approved:Boolean(rule),identity:!dateField(target.split('.')[1]||'')&&!numberField(target.split('.')[1]||'')&&(rule?.identity ?? /\.(?:id|sourceId|number|designation|email|orderReference)$/.test(target))};
    }).filter(Boolean);
    return {name,sheetKey,fileName:source?.fileName,fingerprint:source?.fingerprint,signature,headerIndex,headerRow:start+headerIndex+1,startColumn:sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']).s.c:0,columns,rowCount:matrix.slice(headerIndex+1).filter(r=>r.some(present)).length,inferred};
  });
}
const convert=(cell,column,XLSX)=>interpretCell(cell,column,XLSX);
export function retargetColumn(workbook,profile,column,target,XLSX) {
  if(column.target===target)return;
  column.target=target;
  column.identity=/\.(?:id|sourceId|number|designation|email|orderReference)$/.test(target);
  column.transform='auto';
  const sheet=workbook.Sheets[profile.sheetKey||profile.name],range=sheet?.['!ref']?XLSX.utils.decode_range(sheet['!ref']):null,cells=[];
  if(range)for(let r=profile.headerRow;r<=range.e.r;r++)cells.push(sheet[XLSX.utils.encode_cell({r,c:column.index+profile.startColumn})]);
  column.format=profileFormat(cells,column,XLSX);
}
const identify=(...args)=>globalThis.LokalblickImportRules.identify(...args);
export function splitContractReferences(value){return Array.isArray(value)?value.flatMap(splitContractReferences):String(value??'').split(/[;,\n|]+|\s+\/\s+/).map(v=>v.trim()).filter(Boolean);}
export async function fingerprint(buffer) {
  const hash=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
// Internal sheet keys keep identically named sheets from separate files apart.
// Original names and each workbook's date system travel with the source metadata.
const parsedSources=new WeakMap();
export function readImportSource(file,selectedSheets,XLSX){
  const key=JSON.stringify([...selectedSheets].sort());
  let cached=parsedSources.get(file);if(!cached){cached=new Map();parsedSources.set(file,cached);}
  if(cached.has(key))return cached.get(key);
  const original=XLSX.read(file.buffer,{type:'array',cellDates:false,cellNF:true,sheets:selectedSheets});
  original.SheetNames=original.SheetNames.filter(name=>selectedSheets.includes(name));
  for(const name of original.SheetNames){
    const sheet=original.Sheets[name],extent={s:{r:Infinity,c:Infinity},e:{r:-1,c:-1}};
    for(const a of Object.keys(sheet)){if(a[0]==='!'||(!sheet[a]?.f&&!present(sheet[a]?.v)))continue;const p=XLSX.utils.decode_cell(a);extent.s.r=Math.min(extent.s.r,p.r);extent.s.c=Math.min(extent.s.c,p.c);extent.e.r=Math.max(extent.e.r,p.r);extent.e.c=Math.max(extent.e.c,p.c);}
    if(extent.e.r<0)delete sheet['!ref'];else sheet['!ref']=XLSX.utils.encode_range(extent);
  }
  cached.set(key,original);return original;
}
export async function combineImportSources(files, selected, XLSX) {
  const workbook={SheetNames:[],Sheets:{},__importSources:[]},wanted=new Set(selected),hashes=[];
  for(const file of files){
    const chosen=file.sheets.filter(s=>wanted.has(s.name));if(!chosen.length)continue;
    const hash=await fingerprint(file.buffer);hashes.push(hash);
    const original=readImportSource(file,chosen.map(s=>s.sheetName||s.name),XLSX);
    for(const info of chosen){
      const name=info.sheetName||info.name,sheet=original.Sheets[name];if(!sheet)continue;
      workbook.SheetNames.push(info.name);workbook.Sheets[info.name]=sheet;
      workbook.__importSources.push({sheetKey:info.name,sheetName:name,fileName:file.fileName,fingerprint:hash,date1904:Boolean(original.Workbook?.WBProps?.date1904)});
    }
  }
  if(!workbook.SheetNames.length)throw Error('Välj minst en flik att läsa.');
  return {workbook,fingerprint:hashes.length===1?hashes[0]:await fingerprint(new TextEncoder().encode(hashes.sort().join('|')))};
}
export function prepareMappedImport(workbook, profiles, base, context, XLSX) {
  if(context.strictColumns){
    const targets=new Set(fieldCatalog(context.schemas,true).map(field=>field.target));
    if(profiles.some(profile=>profile.columns.some(column=>column.target!=='@ignore'&&!targets.has(column.target))))throw Error('Välj ett befintligt fält eller Importera inte för varje kolumn.');
  }
  const started=Date.now(),data=copy(base), changes=[], decisions=[];
  const at=context.at || new Date().toISOString();
  data.sourceRegistry ||= []; data.auditLog ||= []; data.importReview ||= []; data.importMappings ||= [];
  const counts={objectsBefore:(base.objects||[]).length,propertiesBefore:(base.properties||[]).length,contractsBefore:(base.contracts||[]).length,matched:0,created:0,fields:0,conflicts:0,preserved:0,unresolved:0};
  const rows=[], targets=new Set(fieldCatalog(context.schemas,context.strictColumns).map(f=>f.target)), indexes=new Map();
  const indexFor=collection=>{if(!indexes.has(collection)){data[collection] ||= [];indexes.set(collection,globalThis.LokalblickImportRules.createIndex(data[collection]));}return indexes.get(collection);};
  const byId=(collection,id)=>indexFor(collection).lookup('id',id).find(r=>r.id===id);

  for(const profile of profiles){
    const fileName=profile.fileName||context.fileName,sourceId='source:'+(profile.fingerprint||context.fingerprint);
    if(!data.sourceRegistry.some(s=>s.id===sourceId))data.sourceRegistry.push({id:sourceId,name:fileName,fingerprint:profile.fingerprint||context.fingerprint,importedAt:at,kind:'mapped-excel',sheets:profiles.filter(p=>(p.fileName||context.fileName)===fileName).map(p=>p.name)});
    const ruleId=(profile.fileName?fileName+'|':'')+profile.name+'|'+profile.signature;
    const old=data.importMappings.find(r=>r.id===ruleId);
    const rule={id:ruleId,fileName,sheet:profile.name,signature:profile.signature,columns:profile.columns.map(c=>({header:c.header,target:c.target,collection:c.collection,transform:c.transform,identity:c.identity})),version:old?.version||1,approvedBy:context.actor,actorVerified:false,approvedAt:at};
    if(old&&!equal(old.columns,rule.columns))rule.version++;
    if(!old)data.importMappings.push(rule);else if(!equal(old.columns,rule.columns))Object.assign(old,rule);
    const sheet=workbook.Sheets[profile.sheetKey||profile.name];
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
        const origin={source:fileName,sourceId,sheet:profile.name,column:column.header,row:r+1,cell:address,originalValue:cell?.v??'',originalFormula:cell?.f||'',hyperlink:cell?.l?.Target||'',at,mappingRule:ruleId,mappingVersion:rule.version,decision:'manual-mapping',confirmedBy:context.actor,actorVerified:false,normalization:column.transform};
        if(column.target==='@extra') {
          let value=cell.v??cell.f;try{if(present(cell.v))value=convert(cell,column,XLSX);}catch(e){group.errors.push(column.header+': '+e.message);}
          group.extras.push({label:column.header,value,type:column.format?.type||'text',provenance:origin});continue;
        }
        const field=column.target.split('.')[1];
        if(cell.f&&!present(cell.v)){group.origins[field]=origin;group.errors.push(column.header+': formeln saknar beräknat värde');continue;}
        if(!targets.has(column.target)){group.errors.push('Ogiltigt målfält');continue;}
        if(Object.hasOwn(group.values,field)){group.errors.push('Flera kolumner kopplas till '+field);continue;}
        try{group.values[field]=convert(cell,column,XLSX);group.origins[field]=origin;}catch(e){group.origins[field]=origin;group.errors.push(column.header+': '+e.message);}
        if(column.identity)group.identity.push(field);
      }
      if(groups.has('businesses')&&groups.has('contracts')&&!groups.has('contractBusinesses'))groups.set('contractBusinesses',{values:{},origins:{contractId:copy(groups.get('contracts').origins.number||{}),businessId:copy(groups.get('businesses').origins.sourceId||groups.get('businesses').origins.name||{})},extras:[],identity:[],errors:[]});
      const contractGroup=groups.get('contracts'),linkGroup=groups.get('contractBusinesses');
      const reference=contractGroup?.values.number||linkGroup?.values.contractId;
      const references=splitContractReferences(reference);
      if(references.length>1){
        for(const number of references){const expanded=new Map([...groups].map(([key,value])=>[key,copy(value)]));
          if(contractGroup){expanded.get('contracts').values.number=number;
            for(const field of Object.keys(expanded.get('contracts').values))if(!['number','propertyId','objectId','tenantName','tenantPartyId','businessName','businessPartyId','unitId'].includes(field)){
              const origin=expanded.get('contracts').origins[field],id=sourceId+'|'+profile.name+'|'+(r+1)+'|multiple|'+field;
              if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'multi-contract-value',status:'pending',source:fileName,sheet:profile.name,row:r+1,collection:'contracts',field,proposed:copy(expanded.get('contracts').values[field]),provenance:origin,reason:'Värdet avser flera avtalsreferenser och får inte kopieras till varje avtal'});
              delete expanded.get('contracts').values[field];
            }
if(!(data.contracts||[]).some(c=>norm(c.number)===norm(number)))expanded.get('contracts').errors.push('Flera avtalsreferenser: avtalet måste identifieras säkert före berikning');}
          if(linkGroup)expanded.get('contractBusinesses').values.contractId=number;
          rows.push({profile,r,groups:expanded,rowRecords:{},fileName,sourceId,ruleId,rule});
        }
      }else rows.push({profile,r,groups,rowRecords:{},fileName,sourceId,ruleId,rule});
    }
  }
  const preparedAt=Date.now();
  // Resolve every parent table across all files before applying dependent records.
  for(const collection of new Set(['organizations','people','properties','objects','contracts','businesses','activities','orders','contractBusinesses','assignments',...context.schemas.map(s=>s.key)])){
    for(const task of rows){
      const {profile,r,groups,rowRecords,fileName,sourceId,ruleId,rule}=task;
      const group=groups.get(collection);if(!group)continue;
        data[collection] ||= [];
        const key=(profile.fileName?fileName+'|':'')+profile.name+'|'+(r+1)+'|'+collection;
        const override=context.decisions?.[key];
        if(override==='ignore'){decisions.push({sheet:profile.name,row:r+1,collection,classification:'D',reason:'Ignorerad av användaren',values:group.values});continue;}
        // An already identified agreement can anchor enrichment at its property
        // or object even when the source repeats only a partial address.
        const agreementValues=groups.get('contracts')?.values;
        const agreement=agreementValues?.number?indexFor('contracts').lookup('number',agreementValues.number):[];
        if(agreement.length===1&&['properties','objects'].includes(collection)){
          const known=collection==='properties'?byId('properties',agreement[0].propertyId):byId('objects',agreement[0].objectId);
          if(known){
            const field=collection==='properties'?'designation':'number';
            if(!present(group.values[field])||norm(group.values[field])===norm(known[field])){group.values.id=known.id;group.identity=['id'];if(collection==='objects')group.values.propertyId=known.propertyId;}
          }
        }
        if(collection==='businesses'&&!group.identity.length&&!group.values.sourceId){const old=(data.businesses||[]).filter(b=>b.provenance?.name?.sourceId===sourceId&&b.provenance.name.cell===group.origins.name?.cell&&b.name===group.values.name);if(old.length===1){group.values.id=old[0].id;group.identity=['id'];}}
        if(collection==='contractBusinesses'){group.values.contractId ||= rowRecords.contracts;group.values.businessId ||= rowRecords.businesses;}
        if(collection==='recurringCosts'){
          group.values.contractId ||= rowRecords.contracts || "";
          if(!group.values.contractId)group.values.propertyId ||= rowRecords.properties || "";
          const hasContract=Boolean(group.values.contractId),hasProperty=Boolean(group.values.propertyId);
          if(hasContract===hasProperty)group.errors.push("Kostnaden behöver exakt en koppling till fastighet eller avtal");
          if(!String(group.values.name||"").trim())group.errors.push("Kostnadens namn saknas");
          if(!Number.isFinite(Number(group.values.annualAmount))||Number(group.values.annualAmount)<0||group.values.annualAmount==null||group.values.annualAmount==="")group.errors.push("Årsbelopp saknas eller är ogiltigt");
        }
        if(collection==='objects'&&rowRecords.properties&&!present(group.values.propertyId))group.values.propertyId=rowRecords.properties;
        if(collection==='contracts'&&rowRecords.objects&&!present(group.values.objectId))group.values.objectId=rowRecords.objects;
        if(collection==='contracts'&&rowRecords.properties&&!present(group.values.propertyId))group.values.propertyId=rowRecords.properties;
        const parents={businessId:'businesses',personId:'people',tenantPartyId:'organizations',propertyId:'properties',objectId:'objects',contractId:'contracts',activityId:'activities',organizationId:'organizations',ownerPartyId:'organizations',responsiblePersonId:'people',...(context.strictColumns?{businessPartyId:'organizations',tenantResponsiblePersonId:'people',businessResponsiblePersonId:'people',ownerResponsiblePersonId:'people',orderedByPersonId:'people'}:{})};
        for(const [field,parent] of Object.entries(parents)){
          if(!present(group.values[field]))continue;
          const value=group.values[field];
          const parentFields=['id','sourceId','designation','address','number','name','title',...(context.strictColumns&&parent==='people'?['email']:[])];
          const values=[...new Set(parentFields.flatMap(k=>indexFor(parent).lookup(k,value)))];
          const candidates=values.filter(x=>(parent!=='objects'||!group.values.propertyId||x.propertyId===group.values.propertyId)&&(x.id===value || parentFields.filter(k=>k!=='id').some(k=>present(x[k])&&(context.strictColumns&&k==='email'?String(x[k]).trim().toLowerCase()===String(value).trim().toLowerCase():['businesses','organizations'].includes(parent)?globalThis.LokalblickBusinessModel.key(x[k])===globalThis.LokalblickBusinessModel.key(value):norm(x[k])===norm(value)))));
          if(candidates.length===1)group.values[field]=candidates[0].id;else group.errors.push('Relationen '+field+' är inte entydig');
        }
        if(collection==='contractBusinesses'&&(!group.values.contractId||!group.values.businessId))group.errors.push('Avtalsverksamheten saknar säker koppling');
        if(collection==='assignments'){
          const names={Fastighet:'property',Objekt:'object',Avtal:'contract',Aktivitet:'activity',Verksamhet:'business',Part:'organization'};
          group.values.targetType=names[group.values.targetType]||group.values.targetType;
          const parent=globalThis.LokalblickResponsibility.types[group.values.targetType];
          if(!parent||!group.values.targetId)group.errors.push('Ansvarsrelationen saknar hemvist');
          else {const value=group.values.targetId,candidates=[...new Set(['id','sourceId','number','designation','title','name'].flatMap(f=>indexFor(parent).lookup(f,value)))].filter(x=>parent!=='businesses'||x.id===value||x.sourceId===value||globalThis.LokalblickBusinessModel.key(x.name)===globalThis.LokalblickBusinessModel.key(value));if(candidates.length===1)group.values.targetId=candidates[0].id;else group.errors.push('Ansvarsrelationens hemvist är inte entydig');}
        }
        if(collection==='objects'&&!group.values.propertyId)group.errors.push('Objektet saknar fastighetskoppling');
        if(collection==='contracts'&&group.values.objectId){const obj=byId('objects',group.values.objectId);if(obj){if(group.values.propertyId&&group.values.propertyId!==obj.propertyId)group.errors.push('Objektet och avtalet pekar på olika fastigheter');else group.values.propertyId=obj.propertyId;}}
        let match=group.errors.length?{kind:'D',reason:group.errors.join('; ')}:identify(data[collection],group.values,collection,group.identity,indexFor(collection));
        if(context.strictColumns&&collection==='people'&&present(group.values.email)&&!group.errors.length){
          const email=String(group.values.email).trim().toLowerCase(),hits=indexFor(collection).lookup('email',email).filter(person=>String(person.email||'').trim().toLowerCase()===email);
          match=hits.length===1?{kind:'A',record:hits[0],reason:'Unik e-postadress'}:hits.length?{kind:'B',candidates:hits,reason:'Flera personer har samma e-postadress'}:{kind:'C',reason:'Ny e-postadress'};
        }
        if(override?.recordId&&!group.errors.length){const chosen=byId(collection,override.recordId);if(chosen)match={kind:'A',record:chosen,reason:'Manuellt vald koppling'};}
        if(override?.parentId){group.values[collection==='orders'?'activityId':'propertyId']=override.parentId;}
        if(match.kind==='C'&&['contracts','orders'].includes(collection)&&!group.values[collection==='contracts'?'propertyId':'activityId'])match={kind:'B',reason:'Hemvist saknas: välj rätt '+(collection==='contracts'?'fastighet':'aktivitet')};
        const entry={source:fileName,sourceId,sheet:profile.name,row:r+1,collection,classification:match.kind,reason:match.reason,values:group.values,candidates:(match.candidates||[]).map(copy),extras:group.extras,origins:group.origins};
        decisions.push(entry);
        if(['B','D'].includes(match.kind)){
          const id=sourceId+'|'+profile.name+'|'+(r+1)+'|'+collection;
          if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'mapped-identity',source:fileName,status:'pending',...entry});
          counts.unresolved++;continue;
        }
        let record=match.record;
        const beforeAssignment=['assignments','contractBusinesses'].includes(collection)&&record?copy(record):null;
        if(!record){record={id:crypto.randomUUID(),provenance:{}};data[collection].push(record);counts.created++;}
        else counts.matched++;
        rowRecords[collection]=record.id;
        entry.recordId=record.id;
        record.provenance ||= {};
        for(const [field,value] of Object.entries(group.values)){
          group.origins[field] ||= {source:fileName,sourceId,sheet:profile.name,row:r+1,at,value,decision:'derived-relation',inputs:Object.values(group.origins).map(o=>o.cell).filter(Boolean),confirmedBy:context.actor,actorVerified:false};
          const current=record[field];
          if(equal(current,value)||(!present(value)))continue;
          const decision=globalThis.LokalblickImportRules.decideField(data,collection,record,field,value,group.origins[field]);
          if(decision.action==='keep')continue;
          if(decision.action==='review'){
            globalThis.LokalblickImportRules.applyField(data,collection,record,field,value,group.origins[field]);counts.conflicts++;continue;
          }
          changes.push({collection,recordId:record.id,field,from:current??'',to:value,provenance:group.origins[field]});
          record[field]=value;record.provenance[field]={...group.origins[field],value,matchReason:match.reason,identityDecision:override?.recordId?'manual':'automatic'};counts.fields++;
        }
        if(collection==='contractBusinesses'&&(!group.values.contractId||!group.values.businessId))group.errors.push('Avtalsverksamheten saknar säker koppling');
        if(collection==='contractBusinesses'){
          const problem=globalThis.LokalblickBusinessModel.issues(data).find(e=>e.id===record.id||e.id===record.contractId);
          if(problem){if(!match.record){data[collection].splice(data[collection].indexOf(record),1);counts.created--;}else{Object.keys(record).forEach(k=>delete record[k]);Object.assign(record,beforeAssignment);}
            changes.splice(0,changes.length,...changes.filter(c=>c.recordId!==record.id));entry.classification='D';entry.reason=problem.message;counts.unresolved++;
            const id=sourceId+'|'+profile.name+'|'+(r+1)+'|'+collection;if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'mapped-identity',source:fileName,status:'pending',...entry});continue;}
        }
        if(collection==='assignments'){
          globalThis.LokalblickResponsibility.normalize(data);
          const problem=globalThis.LokalblickResponsibility.issues(data).find(e=>e.ids?.includes(record.id));
          if(problem){
            if(!match.record){data[collection].splice(data[collection].indexOf(record),1);counts.created--;}else {Object.keys(record).forEach(k=>delete record[k]);Object.assign(record,beforeAssignment);}
            changes.splice(0,changes.length,...changes.filter(c=>c.recordId!==record.id));
            entry.classification='D';entry.reason=problem.message;counts.unresolved++;
            const id=sourceId+'|'+profile.name+'|'+(r+1)+'|'+collection;
            if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'mapped-identity',source:fileName,status:'pending',...entry});
            continue;
          }
        }
        indexFor(collection).update(record);
        record.supplemental ||= [];
        for(const extra of group.extras){
          if(!record.supplemental.some(x=>x.label===extra.label&&equal(x.value,extra.value)&&x.provenance?.sourceId===sourceId)){record.supplemental.push(extra);counts.preserved++;}
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
      const id=entry.sourceId+'|'+entry.sheet+'|'+entry.row+'|'+entry.collection;
      if(!data.importReview.some(x=>x.id===id))data.importReview.push({id,kind:'mapped-identity',source:entry.source,status:'pending',...entry});
    }
  }
  counts.fields=changes.length;
  counts.propertiesAfter=(data.properties||[]).length;counts.contractsAfter=(data.contracts||[]).length;
  for(const registered of data.sourceRegistry.filter(s=>profiles.some(p=>'source:'+(p.fingerprint||context.fingerprint)===s.id))) {
    if(!registered.rows){const own=decisions.filter(d=>d.sourceId===registered.id);Object.assign(registered,{rows:profiles.filter(p=>'source:'+(p.fingerprint||context.fingerprint)===registered.id).reduce((n,p)=>n+p.rowCount,0),matched:own.filter(d=>d.classification==='A').length,created:own.filter(d=>d.classification==='C').length,review:own.filter(d=>['B','D'].includes(d.classification)).length});}
  }
  const identified=decisions.filter(d=>d.recordId&&!['B','D'].includes(d.classification));
  const uniqueRecords=new Set(identified.map(d=>d.collection+'|'+d.recordId)).size;
  const consolidation={sourceRows:rows.length,uniqueRecords,mergedOccurrences:identified.length-uniqueRecords,files:new Set(profiles.map(p=>p.fileName||context.fileName)).size,sheets:profiles.length};
  for(const change of changes)data.auditLog.push({id:crypto.randomUUID(),at,by:context.actor,actorVerified:false,collection:change.collection,recordId:change.recordId,action:'Importerad',fields:[{field:change.field,from:change.from,to:change.to,provenance:change.provenance}]});
  globalThis.LokalblickObjectModel?.normalize(data);
  globalThis.LokalblickBusinessModel.normalize(data);
  globalThis.LokalblickResponsibility.normalize(data);
  counts.objectsAfter=(data.objects||[]).length;
  const tables=context.schemas.map(schema=>{
    const oldIds=new Set((base[schema.key]||[]).map(r=>r.id));
    const updatedIds=new Set(changes.filter(c=>c.collection===schema.key&&oldIds.has(c.recordId)).map(c=>c.recordId));
    return {collection:schema.key,label:schema.sheet,created:(data[schema.key]||[]).filter(r=>!oldIds.has(r.id)).length,
      updated:new Set(changes.filter(c=>c.collection===schema.key&&oldIds.has(c.recordId)).map(c=>c.recordId)).size,
      unchanged:new Set(decisions.filter(d=>d.collection===schema.key&&d.recordId&&oldIds.has(d.recordId)&&!updatedIds.has(d.recordId)&&!['B','D'].includes(d.classification)).map(d=>d.recordId)).size,
      review:new Set(data.importReview.filter(d=>d.collection===schema.key&&d.status==='pending'&&profiles.some(p=>(p.fileName||context.fileName)===d.source)).map(d=>d.source+'|'+d.sheet+'|'+(d.row||d.recordId))).size};
  }).filter(t=>t.created||t.updated||t.review||t.unchanged);
  data.isDemo=false;
  return {data,report:{profile:'Mappad Excelimport',fileName:context.fileName,counts,decisions,changes,consolidation,tables,timing:{prepareMs:preparedAt-started,matchMs:Date.now()-preparedAt,totalMs:Date.now()-started}}};
}

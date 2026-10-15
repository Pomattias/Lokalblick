/* Business register and agreement usage; rental masters stay on agreements. */
(function(root){
 const copy=x=>JSON.parse(JSON.stringify(x)),key=x=>String(x??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
 const present=x=>x!==''&&x!==null&&x!==undefined;
 const groups={VARDBO:'Vårdbo',ORDBO:'Ordbo',MYND_STAB:'Myndighet / Stab',HOF:'Hälsa & Förebyggande'};
 const active=(link,at)=>!link.cancelled&&(!at||(!link.fromDate||link.fromDate<=at)&&(!link.toDate||link.toDate>=at));
 function review(data,id,reason,collection,values){data.importReview ||= [];if(!data.importReview.some(r=>r.id===id))data.importReview.push({id,kind:'business-identity',status:'pending',collection,reason,values:copy(values),source:values.provenance?.name?.source||values.sourceName||'Äldre uppgift'});}
 function normalize(data){
  data.businesses ||= [];data.contractBusinesses ||= [];data.organizations ||= [];data.contracts ||= [];
  for(const c of data.contracts){
   if(!c.tenantPartyId&&c.tenantName){
    const matches=data.organizations.filter(o=>key(o.name)===key(c.tenantName));
    if(matches.length===1)c.tenantPartyId=matches[0].id;
    else if(!matches.length){const party={id:'TENANT|'+encodeURIComponent(key(c.tenantName)),name:c.tenantName,type:'tenant',provenance:{name:copy(c.provenance?.tenantName||{source:'contract-tenant'})}};data.organizations.push(party);c.tenantPartyId=party.id;}
    else review(data,'tenant-identity|'+c.id,'Flera parter har samma hyresgästnamn','contracts',{id:c.id,tenantName:c.tenantName,provenance:c.provenance});
    if(c.tenantPartyId){c.provenance ||= {};c.provenance.tenantPartyId ||= {...copy(c.provenance.tenantName||{source:'contract-tenant'}),decision:'exact-party-name',value:c.tenantPartyId};}
   }
   // Once explicit links exist (even closed ones), source fields cannot re-open usage.
   if(c.businessLinksManaged)continue;
   const existing=data.contractBusinesses.filter(l=>l.contractId===c.id);
   const placeholder=existing.length===1&&existing[0].id===('CB|'+c.id+'|'+existing[0].businessId)&&c.businessName&&data.businesses.find(b=>b.id===existing[0].businessId)?.name===(groups[c.unitId]||c.unitId)?existing[0]:null;
   if(existing.length&&!placeholder)continue;
   const name=String(c.businessName||'').trim(),unit=c.unitId||'',organizationId=c.businessPartyId||'';
   if(!name&&!unit)continue;
   const knownId=c.businessId||'',sourceId=c.businessSourceId||'';
   const identity=sourceId?'source|'+sourceId:name&&organizationId&&(unit||c.use)?[organizationId,key(name),unit,key(c.use)].join('|'):name?'contract|'+c.id:'unit|'+unit;
   const id=knownId||'BUS|'+encodeURIComponent(identity);
   let business=data.businesses.find(b=>b.id===id);
   if(!business&&sourceId){const matches=data.businesses.filter(b=>b.sourceId===sourceId);if(matches.length===1)business=matches[0];else if(matches.length>1){review(data,'business-identity|'+c.id,'Verksamhetens käll-ID är inte entydigt','businesses',{name,sourceId,organizationId,unitId:unit,contractId:c.id});continue;}}
   if(!business&&name&&organizationId&&(unit||c.use)){
    const matches=data.businesses.filter(b=>key(b.name)===key(name)&&b.organizationId===organizationId&&String(b.unitId||'')===unit&&key(b.type)===key(c.use));
    if(matches.length===1)business=matches[0];else if(matches.length>1){review(data,'business-identity|'+c.id,'Flera verksamheter har samma namn och organisation','businesses',{name,organizationId,unitId:unit,contractId:c.id});continue;}
   }
   if(!business&&name&&!organizationId&&data.businesses.some(b=>key(b.name)===key(name))){review(data,'business-identity|'+c.id,'Verksamhetsnamnet saknar säker organisations- eller källidentitet','businesses',{name,contractId:c.id});continue;}
   if(!business){business={id,name:name||groups[unit]||unit,type:c.use||'',unitId:unit,organizationId,status:'Aktiv',sourceId,provenance:{name:copy(c.provenance?.businessName||c.provenance?.unitId||{source:'contract-field',contractId:c.id})}};data.businesses.push(business);}
   if(placeholder){placeholder.businessId=business.id;placeholder.provenance=copy(c.provenance?.businessName||placeholder.provenance);}
   else data.contractBusinesses.push({id:'CB|'+c.id+'|'+business.id,contractId:c.id,businessId:business.id,fromDate:'',toDate:'',usedArea:null,costSharePercent:null,provenance:copy(c.provenance?.businessName||c.provenance?.unitId||{source:'contract-field',contractId:c.id})});
  }
  return data;
 }
 function date(value){if(!value)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw TypeError('Ogiltigt datum för avtalsverksamhet');}
 function issues(data){
  const errors=[],seen=new Set(),fail=(row,message)=>errors.push({id:row.id,message,signature:JSON.stringify([message,row])});
  for(const b of data.businesses||[]){if(!b.id||seen.has(b.id))fail(b,'Verksamhets-ID måste vara unikt');seen.add(b.id);if(!String(b.name||'').trim())fail(b,'Verksamheten behöver ett namn');if(b.organizationId&&!data.organizations.some(o=>o.id===b.organizationId))fail(b,'Verksamhetens organisation saknas');}
  seen.clear();
  for(const c of data.contracts||[])if(c.tenantPartyId&&!data.organizations.some(o=>o.id===c.tenantPartyId))fail(c,'Hyresgästens part saknas');
  for(const l of data.contractBusinesses||[]){
   if(!l.id||seen.has(l.id))fail(l,'Avtalskopplingens ID måste vara unikt');seen.add(l.id);
   const contract=data.contracts.find(c=>c.id===l.contractId);
   if(!contract)fail(l,'Verksamhetens avtal saknas');if(!data.businesses.some(b=>b.id===l.businessId))fail(l,'Avtalets verksamhet saknas');
   try{date(l.fromDate);date(l.toDate);if(l.fromDate&&l.toDate&&l.fromDate>l.toDate)fail(l,'Kopplingens till-datum föregår från-datum');}catch(e){fail(l,e.message);}
   for(const f of ['usedArea','costSharePercent'])if(present(l[f])&&(typeof l[f]!=='number'||!Number.isFinite(l[f])||l[f]<0||(f==='costSharePercent'&&l[f]>100)))fail(l,'Ogiltig '+(f==='usedArea'?'nyttjad area':'kostnadsandel'));
   if(present(l.usedArea)&&contract?.area>0&&l.usedArea>contract.area)fail(l,'Nyttjad area överstiger avtalsarean');
  }
  for(const c of data.contracts||[]){const links=(data.contractBusinesses||[]).filter(l=>l.contractId===c.id),points=new Set(['0001-01-01']);
   for(const l of links){if(l.fromDate)points.add(l.fromDate);if(l.toDate&&Number.isFinite(Date.parse(l.toDate)))points.add(new Date(Date.parse(l.toDate)+86400000).toISOString().slice(0,10));}
   for(const at of points){const rows=links.filter(l=>active(l,at)),biz=new Set();for(const l of rows){if(biz.has(l.businessId))fail(l,'Samma verksamhet har överlappande avtalskopplingar');biz.add(l.businessId);}
    if(rows.reduce((s,l)=>s+(present(l.costSharePercent)?Number(l.costSharePercent)||0:0),0)>100.000001)fail(c,'Kostnadsandelarna överstiger 100 %');
    if(c.area>0&&rows.reduce((s,l)=>s+(present(l.usedArea)?Number(l.usedArea)||0:0),0)>c.area+0.000001)fail(c,'Verksamheternas nyttjade area överstiger avtalsarean');
   }
  }
  return errors;
 }
 function validate(data,baseline){if(baseline)for(const l of baseline.contractBusinesses||[])if(!(data.contractBusinesses||[]).some(x=>x.id===l.id))throw TypeError('Avtalsverksamhetens historik får inte raderas');const old=new Set(baseline?issues(baseline).map(i=>i.signature):[]),error=issues(data).find(i=>!old.has(i.signature));if(error)throw TypeError(error.message);return data;}
 function links(data,businessId,at){return (data.contractBusinesses||[]).filter(l=>(!businessId||l.businessId===businessId)&&active(l,at));}
 function cost(data,businessId,year,calc){validate(data);let amount=0,allocated=false;const details=[];
  for(const l of links(data,businessId)){
   if(!present(l.costSharePercent))continue;
   const c=data.contracts.find(c=>c.id===l.contractId);if(!c)continue;
   const period=calc.budgetPeriod(c,year);if(!period.days)continue;
   const start=[year+'-01-01',period.from||year+'-01-01',l.fromDate||year+'-01-01'].sort().at(-1),end=[year+'-12-31',period.to||year+'-12-31',l.toDate||year+'-12-31'].sort()[0];
   if(start>end)continue;const fraction=(Date.parse(end)-Date.parse(start)+86400000)/(period.daysInYear*86400000),values=calc.annualValues(c,year,0,data.indexSeries),part=values.total*l.costSharePercent/100*fraction;
   amount+=part;allocated=true;details.push({contractId:c.id,amount:part});
  }
  return {amount,allocated,details};
 }
 function applyLinks(data,contractId,businessIds,values={},at=root.LokalblickResponsibility.today(),actor=''){
  date(at);if(!at)throw TypeError('Ange datum för verksamhetskopplingen');
  const before=copy(data);const contract=data.contracts.find(c=>c.id===contractId);if(!contract)throw TypeError('Avtalet saknas');
  const selected=new Set(businessIds),existing=(data.contractBusinesses||[]).filter(l=>l.contractId===contractId);
  for(const id of selected)if(!data.businesses.some(b=>b.id===id))throw TypeError('Vald verksamhet saknas');
  const current=existing.filter(l=>active(l,at));
  if(existing.length&&current.length===selected.size&&current.every(l=>selected.has(l.businessId)&&Object.entries(values[l.businessId]||{}).every(([field,value])=>JSON.stringify(l[field]??null)===JSON.stringify(value))))return data;
  contract.businessLinksManaged=true;
  if(existing.some(l=>l.fromDate&&l.fromDate>at))throw TypeError('Framtida verksamhetskoppling finns. Granska perioderna innan bytet');
  for(const l of existing.filter(l=>active(l,at)))if(!selected.has(l.businessId)){if(l.fromDate===at)l.cancelled=true;else l.toDate=new Date(Date.parse(at)-86400000).toISOString().slice(0,10);}
  for(const id of selected){
   if(!data.businesses.some(b=>b.id===id))throw TypeError('Vald verksamhet saknas');
   let link=existing.find(l=>l.businessId===id&&active(l,at));
   if(link&&link.fromDate!==at&&Object.entries(values[id]||{}).some(([field,value])=>JSON.stringify(link[field]??null)!==JSON.stringify(value))){const previous=link;const end=link.toDate;previous.toDate=new Date(Date.parse(at)-86400000).toISOString().slice(0,10);link={...copy(previous),id:root.crypto?.randomUUID?.()||'CB|'+Date.now()+'|'+id,fromDate:at,toDate:end};data.contractBusinesses.push(link);}
   if(!link){link={id:root.crypto?.randomUUID?.()||'CB|'+Date.now()+'|'+id,contractId,businessId:id,fromDate:at,toDate:'',usedArea:null,costSharePercent:null};data.contractBusinesses.push(link);}
   for(const field of ['usedArea','costSharePercent'])if(Object.hasOwn(values[id]||{},field)&&JSON.stringify(link[field])!==JSON.stringify(values[id][field])){link[field]=values[id][field];link.provenance ||= {};link.provenance[field]={source:'manual',at:new Date().toISOString(),confirmedBy:actor,value:link[field]};}
  }
  try{validate(data,before);}catch(e){Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,before);throw e;}
  const previous=new Map(before.contractBusinesses.map(l=>[l.id,l]));data.auditLog ||= [];
  for(const l of data.contractBusinesses)if(JSON.stringify(l)!==JSON.stringify(previous.get(l.id))){data.auditLog.push({id:root.crypto?.randomUUID?.()||'business-change|'+Date.now(),collection:'contractBusinesses',recordId:l.id,action:'Verksamhetskoppling ändrad',by:actor,at:new Date().toISOString(),fields:[{field:'usage',from:previous.get(l.id)||null,to:copy(l)}]});}
  return data;
 }
 const api={applyLinks,normalize,validate,issues,links,cost,active,groups,key};root.LokalblickBusinessModel=api;if(root.window)root.window.LokalblickBusinessModel=api;
})(globalThis);

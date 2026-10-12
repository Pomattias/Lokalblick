/* One responsibility model for both frontends, Excel and the local backend. */
(function(root){
  const copy=x=>JSON.parse(JSON.stringify(x)),today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'});
  const types={property:'properties',object:'objects',contract:'contracts',activity:'activities',organization:'organizations',business:'businesses'};
  const legacyTypes={project:'activity',maintenance:'activity',driftIssue:'activity',wish:'activity',investigation:'activity'};
  const roles={our:'Vår ansvarige',owner:'Fastighetsägarens kontaktperson',business:'Verksamhetsansvarig',tenant:'Hyresgästens kontaktperson'};
  const fields={responsiblePersonId:'our',ownerResponsiblePersonId:'owner',businessResponsiblePersonId:'business',tenantResponsiblePersonId:'tenant'};
  const uid=()=>root.crypto?.randomUUID?.()||'A|'+Date.now()+'|'+Math.random().toString(36).slice(2);
  function date(value){if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw TypeError('Ogiltigt datum för ansvar: '+value);return value;}
  const previousDay=d=>new Date(Date.parse(date(d)+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const roleKey=a=>a.roleKey||(/fastighetsäg|hyresvärd/i.test(a.role)?'owner':/verksamhet/i.test(a.role)?'business':/hyresgäst/i.test(a.role)?'tenant':/ansvar|projektledare/i.test(a.role)?'our':a.role||'Kontakt');
  const slot=a=>a.targetType+'|'+a.targetId+'|'+roleKey(a);
  function target(data,type,id){if(type==='business')return ((data.businesses||[]).some(x=>x.id===id)||(data.contracts||[]).some(x=>x.unitId===id))?{id}:null;return (data[types[type]]||[]).find(x=>x.id===id);}
  const active=(a,at=today())=>(!a.fromDate||a.fromDate<=at)&&(!a.toDate||a.toDate>=at)&&a.cancelled!==true;
  function history(data,type,id,role){return (data.assignments||[]).filter(a=>a.targetType===type&&a.targetId===id&&(!role||roleKey(a)===role));}
  function current(data,type,id,role,at=today()){return history(data,type,id,role).filter(a=>active(a,at));}
  function organizationFor(data,row,type,role,personId){return role==='owner'?(type==='property'?row.ownerPartyId:(data.properties||[]).find(p=>p.id===row.propertyId)?.ownerPartyId)||'':role==='business'?row.businessPartyId||'':role==='tenant'?row.tenantPartyId||'':(data.people||[]).find(p=>p.id===personId)?.organizationId||'';}
  function legacyRole(data,a){
    if(a.roleKey)return a.roleKey;
    const person=data.people.find(p=>p.id===a.personId),org=data.organizations.find(o=>o.id===person?.organizationId),home=target(data,a.targetType,a.targetId);
    if(org?.type==='owner'&&a.targetType==='property')return 'owner';
    if(a.targetType==='contract'&&person?.organizationId&&home?.tenantPartyId===person.organizationId)return 'tenant';
    if(a.targetType==='contract'&&org?.type!=='our'&&person?.organizationId&&home?.businessPartyId===person.organizationId)return 'business';
    return roleKey(a);
  }
  function normalize(data){
    data.assignments ||= [];data.people ||= [];data.organizations ||= [];
    // Preserve IDs, original roles and unknown dates. Remap only established legacy activity homes.
    for(const a of data.assignments){
      if(a.targetType==='maintenanceStatus'){a.targetType='activity';a.targetId='STATUS-ACT|'+a.targetId;}
      else if(legacyTypes[a.targetType])a.targetType=legacyTypes[a.targetType];
      if(a.targetType==='object'&&!(data.objects||[]).some(o=>o.id===a.targetId)&&(data.contracts||[]).some(c=>c.id===a.targetId))a.targetType='contract';
      a.roleKey=legacyRole(data,a);a.organizationId ??= (data.people||[]).find(p=>p.id===a.personId)?.organizationId||'';
      a.fromDate ??= '';a.toDate ??= '';a.shared=a.shared===true||a.shared==='Ja'||a.shared==='true';
    }
    // Migrate old contacts into the same table instead of losing them on conversion.
    for(const c of data.contacts||[]){
      if(!c.personId||!c.targetId)continue;
      const a={...copy(c),id:c.id||'CONTACT|'+c.targetType+'|'+c.targetId+'|'+c.personId,roleKey:legacyRole(data,c),fromDate:c.fromDate||'',toDate:c.toDate||''};
      a.organizationId ??= data.people.find(p=>p.id===a.personId)?.organizationId||'';a.shared=Boolean(a.shared);
      if(!data.assignments.some(x=>x.id===a.id||slot(x)===slot(a)&&x.personId===a.personId&&x.fromDate===a.fromDate&&x.toDate===a.toDate))data.assignments.push(a);
    }
    for(const [type,collection] of Object.entries(types))for(const row of data[collection]||[])for(const [field,role] of Object.entries(fields)){
      const existing=history(data,type,row.id,role),personId=row[field];
      if(!existing.length&&personId){
        data.assignments.push({id:'MIG|'+type+'|'+row.id+'|'+role+'|'+personId,personId,organizationId:organizationFor(data,row,type,role,personId),targetType:type,targetId:row.id,role:roles[role],roleKey:role,fromDate:'',toDate:'',shared:false,provenance:copy(row.provenance?.[field]||{source:'legacy-field',field})});
      }
    }
    // Existing relation history has precedence even when the role is now unassigned.
    for(const [type,collection] of Object.entries(types))for(const row of data[collection]||[])for(const [field,role] of Object.entries(fields)){
      if(!history(data,type,row.id,role).length)continue;
      const selected=current(data,type,row.id,role);
      row[field]=selected.length===1?selected[0].personId:'';
    }
    return data;
  }
  function issues(data){
    const errors=[];const seen=new Set();
    for(const person of data.people||[])if(person.organizationId&&!data.organizations.some(o=>o.id===person.organizationId))errors.push({id:person.id,message:'Personens part saknas',signature:JSON.stringify(['person-party',person])});
    for(const a of data.assignments||[]){
      const fail=message=>errors.push({id:a.id,ids:[a.id],message,signature:JSON.stringify([message,a])});
      if(!a.role&&!a.roleKey)fail('Ansvarsrelationen saknar roll');
      if(!a.id||seen.has(a.id))fail('Ansvarsrelationen har saknat eller dubbelt ID');seen.add(a.id);
      if(!(data.people||[]).some(p=>p.id===a.personId))fail('Personen saknas i personregistret');
      if(a.organizationId&&!(data.organizations||[]).some(o=>o.id===a.organizationId))fail('Parten saknas i partsregistret');
      if(roleKey(a)==='our'&&a.organizationId&&data.organizations.find(o=>o.id===a.organizationId)?.type!=='our')fail('Vår ansvarige måste företräda vår organisation');
      if(!target(data,a.targetType,a.targetId))fail('Ansvarsrelationens hemvist saknas');
      try{date(a.fromDate);date(a.toDate);if(a.fromDate&&a.toDate&&a.fromDate>a.toDate&&!a.cancelled)fail('Till-datum föregår från-datum');}catch(e){fail(e.message);}
    }
    const groups=new Map();for(const a of data.assignments||[]){if(a.cancelled)continue;const k=slot(a);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a);}
    for(const group of groups.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
      const a=group[i],b=group[j];
      if((!a.toDate||!b.fromDate||a.toDate>=b.fromDate)&&(!b.toDate||!a.fromDate||b.toDate>=a.fromDate)&&!(a.shared&&b.shared))errors.push({id:a.id,ids:[a.id,b.id],message:'Överlappande ansvar kräver uttryckligt delat ansvar',signature:JSON.stringify(['overlap',a,b])});
    }
    return errors;
  }
  function validate(data,baseline){if(baseline)for(const a of baseline.assignments||[])if(!(data.assignments||[]).some(x=>x.id===a.id))throw TypeError('Ansvarshistorik får inte raderas');const old=new Set(baseline?issues(baseline).map(x=>x.signature):[]);const invalid=issues(data).filter(x=>!old.has(x.signature));if(invalid.length)throw TypeError(invalid[0].message);return data;}
  function change(data,{targetType,targetId,role='our',personId='',organizationId,fromDate=today(),shared=false,actor='',source='manual'}){
    date(fromDate);if(!fromDate)throw TypeError('Ange datum för ansvarbytet');normalize(data);
    if(!target(data,targetType,targetId))throw TypeError('Välj en befintlig hemvist för ansvaret');
    if(personId&&!(data.people||[]).some(p=>p.id===personId))throw TypeError('Vald person saknas i personregistret');
    const rows=history(data,targetType,targetId,role),present=current(data,targetType,targetId,role,fromDate);
    if(present.length===1&&present[0].personId===personId&&(organizationId===undefined||present[0].organizationId===organizationId)&&present[0].shared===shared)return data;
    if(rows.some(a=>a.fromDate&&a.fromDate>fromDate))throw TypeError('Framtida ansvar finns. Granska historiken innan bytet');
    const before=copy(data);
    for(const a of present){if(shared){if(!a.shared)throw TypeError('Befintligt ansvar måste uttryckligen vara delat');continue;}if(a.fromDate===fromDate)a.cancelled=true;else a.toDate=previousDay(fromDate);}
    const row=target(data,targetType,targetId),org=organizationId??organizationFor(data,row,targetType,role,personId);
    if(personId)data.assignments.push({id:uid(),personId,organizationId:org,targetType,targetId,role:roles[role]||role,roleKey:role,fromDate,toDate:'',shared:Boolean(shared),createdAt:new Date().toISOString(),createdBy:actor,provenance:{source,at:new Date().toISOString(),confirmedBy:actor}});
    normalize(data);
    try{validate(data,before);}catch(e){Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,before);throw e;}
    data.auditLog ||= [];data.auditLog.push({id:uid(),at:new Date().toISOString(),by:actor,collection:'assignments',recordId:targetId,action:'Ansvar ändrat',fields:[{field:role,from:present.map(a=>a.personId),to:personId,fromDate}]});
    return data;
  }
  function applyChanges(before,data,{actor='',fromDate=today()}={}){
    const old=normalize(copy(before));
    // Take form values before deriving the compatibility fields.
    const requests=[];
    for(const [type,collection] of Object.entries(types))for(const row of data[collection]||[]){const previous=(old[collection]||[]).find(x=>x.id===row.id)||{};
      for(const [field,role] of Object.entries(fields))if(Object.hasOwn(row,field)&&String(row[field]||'')!==String(previous[field]||'')){requests.push({targetType:type,targetId:row.id,role,personId:row[field]||'',organizationId:organizationFor(data,row,type,role,row[field]),fromDate,actor});row[field]=previous[field]||'';}}
    data.assignments ||= copy(old.assignments);normalize(data);
    for(const r of requests)change(data,r);
    return validate(normalize(data),old);
  }
  const api={normalize,validate,issues,change,applyChanges,current,history,roleKey,roles,fields,types,today};root.LokalblickResponsibility=api;if(root.window)root.window.LokalblickResponsibility=api;
})(globalThis);

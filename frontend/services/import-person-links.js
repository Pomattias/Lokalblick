import '../domain/responsibility-model.js';

const model=()=>globalThis.LokalblickResponsibility;
const copy=value=>structuredClone(value);
const key=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
export function personRole(target){
  const [collection,field]=String(target).split('.'),role=model().fields[field];
  const type=Object.keys(model().types).find(type=>model().types[type]===collection);
  return role&&type?{collection,field,role,type}:null;
}
export function contactPart(target){
  const match=/^contact\.(\d+)\.(email|phone|sourceId|fromDate|toDate)$/.exec(target);
  return match?{index:Number(match[1]),field:match[2]}:null;
}
export const contactSemanticTarget=target=>{
  const part=contactPart(target);
  return part?(part.field.endsWith('Date')?'assignments.':'people.')+part.field:target;
};
export function contactFields(profile){
  return profile.columns.filter(column=>personRole(column.target)).flatMap(column=>
    [['email','E-post'],['phone','Telefon'],['sourceId','Person-ID'],['fromDate','Kontakt fr.o.m.'],['toDate','Kontakt t.o.m.']].map(([field,label])=>({
      target:`contact.${column.index}.${field}`,label:`Personkoppling → ${column.header} → ${label}`,aliases:[column.header,label],
    })));
}

// A name column produces a person and a link together, after its home has been
// identified. The existing responsibility model owns date/overlap validation.
export function importPersonLinks(data,rows,{at,actor,changes,decisions,counts}){
  const api=model();api.normalize(data);
  for(const task of rows)for(const contact of task.contacts||[]){
    const {column,values,origin,errors}=contact,role=personRole(column.target);
    if(!role||!key(values.name)&&!errors.length)continue;
    const entry={source:task.fileName,sourceId:task.sourceId,sheet:task.profile.name,row:task.r+1,column:column.header,collection:'assignments',values:{...values,targetType:role.type,roleKey:role.role}};
    try{
      if(errors.length)throw Error(errors.join('; '));
      const homeId=task.rowRecords[role.collection],home=(data[role.collection]||[]).find(row=>row.id===homeId);
      if(!home)throw Error('Personkopplingen saknar en säkert identifierad hemvist');
      let hits=[];
      const email=key(values.email),sourceId=String(values.sourceId||'').trim();
      if(email){
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Ogiltig e-postadress för personkopplingen');
        hits=data.people.filter(person=>key(person.email)===email);
      }else if(sourceId)hits=data.people.filter(person=>person.id===sourceId||String(person.sourceId||'').trim()===sourceId);
      else {
        hits=data.people.filter(person=>person.id===values.name||key(person.email)&&key(person.email)===key(values.name));
        if(!hits.length){
          if(column.personIdentity!=='name')throw Error('Koppla e-post eller person-ID, eller bekräfta att namnet är unikt');
          hits=data.people.filter(person=>key(person.name)===key(values.name));
        }
      }
      if(hits.length>1)throw Error('Flera personer har samma identitet. Välj en säker personidentifierare');
      if(email&&sourceId&&data.people.some(person=>(person.id===sourceId||person.sourceId===sourceId)&&person.id!==hits[0]?.id))throw Error('E-post och person-ID pekar på olika personer');
      const person=hits[0]?copy(hits[0]):{id:crypto.randomUUID(),provenance:{}};
      if(sourceId&&person.sourceId&&person.sourceId!==sourceId)throw Error('Personens identifierare skiljer sig från befintlig uppgift');
      const history=api.history(data,role.type,home.id,role.role);
      const same=history.find(link=>!link.cancelled&&link.personId===person.id&&(!values.fromDate&&!values.toDate||link.fromDate===(values.fromDate||'')&&link.toDate===(values.toDate||'')));
      const working={people:[person],organizations:copy(data.organizations),assignments:copy(history),[role.collection]:[copy(home)]};
      // Only this role is being changed; unrelated compatibility fields must
      // not generate new links while validating the small working set.
      for(const field of Object.keys(api.fields))delete working[role.collection][0][field];
      for(const old of history)if(!working.people.some(p=>p.id===old.personId))working.people.push(copy(data.people.find(p=>p.id===old.personId)));
      const organizationId=role.role==='our'?(data.organizations.filter(org=>org.type==='our').length===1?data.organizations.find(org=>org.type==='our').id:''):
        role.role==='tenant'?home.tenantPartyId||'':home.ownerPartyId||data.properties?.find(p=>p.id===home.propertyId)?.ownerPartyId||'';
      person.organizationId ||= organizationId;
      if(!same){
        const sharedAddition=column.shared===true&&history.every(link=>link.cancelled||link.shared);
        if(history.length&&!values.fromDate&&!sharedAddition)throw Error('Ange kontaktens fr.o.m. för att bevara ansvarshistoriken vid byte');
        if(history.length&&api.current(data,role.type,home.id,role.role,values.fromDate).some(link=>link.personId===person.id))throw Error('Personen är redan kopplad under perioden. Granska giltighetsdatumen');
        if(history.length&&values.fromDate)api.change(working,{targetType:role.type,targetId:home.id,role:role.role,personId:person.id,organizationId,fromDate:values.fromDate,shared:column.shared===true,actor,source:task.fileName});
        else working.assignments.push({id:crypto.randomUUID(),targetType:role.type,targetId:home.id,roleKey:role.role,role:api.roles[role.role],personId:person.id,organizationId,fromDate:values.fromDate||'',toDate:values.toDate||'',shared:column.shared===true});
        const added=working.assignments.find(link=>!history.some(old=>old.id===link.id));
        if(added){added.toDate=values.toDate||'';added.provenance={...origin,personColumn:column.header};}
        api.validate(working);
      }
      // No people are committed until the person and temporal link both pass.
      const newPerson=!hits.length;
      if(newPerson){data.people.push(person);counts.created++;}
      for(const [field,value] of Object.entries({name:values.name,email:values.email,phone:values.phone,sourceId:values.sourceId})){
        if(!key(value))continue;
        const decision=globalThis.LokalblickImportRules.decideField(data,'people',person,field,value,origin);
        if(decision.action==='review'){globalThis.LokalblickImportRules.applyField(data,'people',person,field,value,origin);counts.conflicts++;}
        if(decision.action!=='write')continue;
        changes.push({collection:'people',recordId:person.id,field,from:person[field]??'',to:value,provenance:origin});
        person[field]=value;person.provenance ||= {};person.provenance[field]={...origin,value};
      }
      if(!newPerson)Object.assign(hits[0],person);
      decisions.push({...entry,collection:'people',recordId:person.id,classification:newPerson?'C':'A',reason:'Person identifierad för vald kontaktroll'});
      for(const link of working.assignments){
        const old=data.assignments.find(row=>row.id===link.id);
        if(JSON.stringify(old)===JSON.stringify(link))continue;
        for(const [field,value] of Object.entries(link))if(JSON.stringify(old?.[field])!==JSON.stringify(value))changes.push({collection:'assignments',recordId:link.id,field,from:old?.[field]??'',to:value,provenance:origin});
        if(old)Object.assign(old,link);else{data.assignments.push(link);counts.created++;}
      }
      const link=same||working.assignments.find(row=>row.personId===person.id&&!history.some(old=>old.id===row.id));
      decisions.push({...entry,recordId:link?.id,classification:same?'A':'C',reason:'Person kopplad till vald roll och hemvist'});
      const previousReview=data.importReview.find(review=>review.id===[task.sourceId,task.profile.name,task.r+1,'contact',column.index].join('|'));
      if(previousReview){previousReview.status='resolved';previousReview.resolvedAt=at;previousReview.resolvedBy=actor;}
    }catch(error){
      const id=[task.sourceId,task.profile.name,task.r+1,'contact',column.index].join('|');
      decisions.push({...entry,classification:'D',reason:error.message});counts.unresolved++;
      if(!data.importReview.some(review=>review.id===id))data.importReview.push({id,kind:'person-link',status:'pending',...entry,reason:error.message,provenance:origin});
    }
  }
  api.normalize(data);
}

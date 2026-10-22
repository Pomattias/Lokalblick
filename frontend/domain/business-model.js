/* One business registry and dated contract-to-business relations.
   Legal tenant identity remains a separate organization on the contract. */
(function(root){
 const key=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
 const present=value=>String(value??'').trim().length>0;
 const datesOverlap=(a,b)=>(!a.toDate||!b.fromDate||a.toDate>=b.fromDate)&&(!b.toDate||!a.fromDate||b.toDate>=a.fromDate);
 function currentLinks(data,contractId,at=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'})){
  return (data.contractBusinesses||[]).filter(l=>l.contractId===contractId&&!l.cancelled&&(!l.fromDate||l.fromDate<=at)&&(!l.toDate||l.toDate>=at));
 }
 function normalize(data){
  data.organizations ||= [];data.contracts ||= [];data.businesses ||= [];data.contractBusinesses ||= [];data.importReview ||= [];
  for(const c of data.contracts){
   if(!c.tenantPartyId&&c.tenantName){
    const matches=data.organizations.filter(o=>key(o.name)===key(c.tenantName));
    if(matches.length===1)c.tenantPartyId=matches[0].id;
    else if(!matches.length){
     const party={id:'TENANT|'+encodeURIComponent(key(c.tenantName)),name:c.tenantName,type:'tenant',provenance:{name:structuredClone(c.provenance?.tenantName||{source:'contract-tenant'})}};
     data.organizations.push(party);c.tenantPartyId=party.id;
    }else if(!data.importReview.some(r=>r.id==='tenant-identity|'+c.id))
     data.importReview.push({id:'tenant-identity|'+c.id,kind:'tenant-identity',status:'pending',collection:'contracts',reason:'Flera parter har samma hyresgästnamn',values:{id:c.id,tenantName:c.tenantName}});
   }
   // Legacy source fields are accepted only at the import boundary. They are
   // represented by the business and relation records in canonical storage.
   const legacyName=String(c.businessName||c.business||'').trim();
   const linked=(data.contractBusinesses||[]).some(l=>l.contractId===c.id);
   if(!linked&&legacyName){
    const organizationId=c.businessPartyId||'';
    const candidates=data.businesses.filter(b=>key(b.name)===key(legacyName)&&String(b.organizationId||'')===organizationId);
    if(candidates.length>1){
     const id='business-identity|'+c.id;
     if(!data.importReview.some(r=>r.id===id))data.importReview.push({id,kind:'business-identity',status:'pending',collection:'contracts',recordId:c.id,reason:'Verksamheten kan inte kopplas entydigt'});
    }else{
     let business=candidates[0];
     if(!business){
      business={id:'BUS|'+c.id,name:legacyName,type:c.use||'',description:String(c.businessComment||'').trim(),organizationId,unitId:c.unitId||'',status:'active'};
      data.businesses.push(business);
     }else if(!business.description&&present(c.businessComment))business.description=String(c.businessComment).trim();
     data.contractBusinesses.push({id:'CB|'+c.id,contractId:c.id,businessId:business.id,fromDate:'',toDate:''});
    }
   }
   const first=currentLinks(data,c.id)[0];
   const activeBusiness=data.businesses.find(b=>b.id===first?.businessId);
   if(activeBusiness)c.businessName=activeBusiness.name; // read-only view projection
  }
  return data;
 }
 function strip(data){
  for(const c of data.contracts||[]){
   if((data.contractBusinesses||[]).some(l=>l.contractId===c.id)){
    delete c.businessName;delete c.business;delete c.businessComment;
   }
  }
  return data;
 }
 function issues(data){
  const errors=[];
  for(const c of data.contracts||[])if(c.tenantPartyId&&!(data.organizations||[]).some(o=>o.id===c.tenantPartyId))errors.push({id:c.id,message:'Hyresgästens part saknas',signature:JSON.stringify(c)});
  const ids=new Set();
  for(const b of data.businesses||[]){
   if(!b.id||ids.has(b.id)||!present(b.name))errors.push({id:b.id,message:'Verksamheten behöver unikt ID och namn',signature:JSON.stringify(b)});
   ids.add(b.id);
  }
  const relationIds=new Set();
  const links=data.contractBusinesses||[];
  for(const l of links){
   if(!l.id||relationIds.has(l.id))errors.push({id:l.id,message:'AvtalVerksamhet har dubbelt eller saknat ID',signature:JSON.stringify(l)});
   relationIds.add(l.id);
   if(!(data.contracts||[]).some(c=>c.id===l.contractId)||!(data.businesses||[]).some(b=>b.id===l.businessId))errors.push({id:l.id,message:'AvtalVerksamhet saknar giltig koppling',signature:JSON.stringify(l)});
   if(l.fromDate&&l.toDate&&l.toDate<l.fromDate)errors.push({id:l.id,message:'Verksamhetskopplingens datum är felaktiga',signature:JSON.stringify(l)});
  }
  for(let i=0;i<links.length;i++)for(let j=i+1;j<links.length;j++)if(!links[i].cancelled&&!links[j].cancelled&&links[i].contractId===links[j].contractId&&links[i].businessId===links[j].businessId&&datesOverlap(links[i],links[j]))errors.push({id:links[i].id,message:'Verksamheten är kopplad till samma avtal två gånger under samma period',signature:JSON.stringify([links[i],links[j]])});
  return errors;
 }
 function validate(data,baseline){
  const old=new Set(baseline?issues(baseline).map(i=>i.signature):[]);
  const error=issues(data).find(i=>!old.has(i.signature));
  if(error)throw TypeError(error.message);
  return data;
 }
 root.LokalblickBusinessModel={normalize,strip,validate,issues,key,currentLinks};
 if(root.window)root.window.LokalblickBusinessModel=root.LokalblickBusinessModel;
})(globalThis);

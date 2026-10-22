/* Legal tenant is a party. Verksamhet and its description are ordinary
   properties of the agreement, never an extra register or join table. */
(function(root){
 const key=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
 function normalize(data){
  data.organizations ||= [];data.contracts ||= [];data.importReview ||= [];
  // Adopt data from the short-lived join model once, before retiring it.
  const retiredBusinesses=new Map((data.businesses||[]).map(row=>[row.id,row]));
  for(const contract of data.contracts){
   const links=(data.contractBusinesses||[]).filter(link=>link.contractId===contract.id&&!link.cancelled&&retiredBusinesses.has(link.businessId));
   const unique=[...new Map(links.map(link=>[link.businessId,retiredBusinesses.get(link.businessId)])).values()];
   if(unique.length>1)throw TypeError('Avtal '+contract.id+' har flera verksamheter i den tidigare modellen. Granska dessa före förenkling.');
   const previous=unique[0];
   if(previous){
    if(!contract.businessName)contract.businessName=previous.name||'';
    if(!contract.businessDescription)contract.businessDescription=previous.description||'';
   }
  }
  for(const c of data.contracts){
   // Source aliases are resolved at the boundary, one canonical field per fact.
   if(!c.businessName&&c.business)c.businessName=c.business;
   if(!c.businessDescription&&c.businessComment)c.businessDescription=c.businessComment;
   delete c.business;delete c.businessComment;
   if(!c.tenantPartyId&&c.tenantName){
    const matches=data.organizations.filter(o=>key(o.name)===key(c.tenantName));
    if(matches.length===1)c.tenantPartyId=matches[0].id;
    else if(!matches.length){
     const party={id:'TENANT|'+encodeURIComponent(key(c.tenantName)),name:c.tenantName,type:'tenant',provenance:{name:structuredClone(c.provenance?.tenantName||{source:'contract-tenant'})}};
     data.organizations.push(party);c.tenantPartyId=party.id;
    }else if(!data.importReview.some(r=>r.id==='tenant-identity|'+c.id))
     data.importReview.push({id:'tenant-identity|'+c.id,kind:'tenant-identity',status:'pending',collection:'contracts',reason:'Flera parter har samma hyresgästnamn',values:{id:c.id,tenantName:c.tenantName}});
   }
  }
  // Discard the redundant tables introduced during development; do not
  // persist both a relationship record and the agreement's business fields.
  delete data.businesses;delete data.contractBusinesses;
  return data;
 }
 function issues(data){return(data.contracts||[]).filter(c=>c.tenantPartyId&&!(data.organizations||[]).some(o=>o.id===c.tenantPartyId)).map(c=>({id:c.id,message:'Hyresgästens part saknas',signature:JSON.stringify(c)}));}
 function validate(data,baseline){const old=new Set(baseline?issues(baseline).map(i=>i.signature):[]),error=issues(data).find(i=>!old.has(i.signature));if(error)throw TypeError(error.message);return data;}
 root.LokalblickBusinessModel={normalize,validate,issues,key};
 if(root.window)root.window.LokalblickBusinessModel=root.LokalblickBusinessModel;
})(globalThis);

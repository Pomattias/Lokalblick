/* Legal tenant is a party. Verksamhet and its description are ordinary
   properties of the agreement, never an extra register or join table. */
(function(root){
 const key=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
 function normalize(data){
  data.organizations ||= [];data.contracts ||= [];data.importReview ||= [];
  for(const c of data.contracts){
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
  // The app has no separate business register.
  delete data.businesses;delete data.contractBusinesses;
  return data;
 }
 function issues(data){return(data.contracts||[]).filter(c=>c.tenantPartyId&&!(data.organizations||[]).some(o=>o.id===c.tenantPartyId)).map(c=>({id:c.id,message:'Hyresgästens part saknas',signature:JSON.stringify(c)}));}
 function validate(data,baseline){const old=new Set(baseline?issues(baseline).map(i=>i.signature):[]),error=issues(data).find(i=>!old.has(i.signature));if(error)throw TypeError(error.message);return data;}
 root.LokalblickBusinessModel={normalize,validate,issues,key};
 if(root.window)root.window.LokalblickBusinessModel=root.LokalblickBusinessModel;
})(globalThis);

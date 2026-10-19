/* Tenant identity at the source boundary. Verksamhet is descriptive agreement
   text, never an organization or a parallel relation register. */
(function(root){
 const key=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
 function normalize(data){
  data.organizations ||= [];data.contracts ||= [];
  for(const c of data.contracts){
   if(!c.tenantPartyId&&c.tenantName){
    const matches=data.organizations.filter(o=>key(o.name)===key(c.tenantName));
    if(matches.length===1)c.tenantPartyId=matches[0].id;
    else if(!matches.length){
     const party={id:'TENANT|'+encodeURIComponent(key(c.tenantName)),name:c.tenantName,type:'tenant',provenance:{name:structuredClone(c.provenance?.tenantName||{source:'contract-tenant'})}};
     data.organizations.push(party);c.tenantPartyId=party.id;
    }else{
     data.importReview ||= [];
     if(!data.importReview.some(r=>r.id==='tenant-identity|'+c.id))data.importReview.push({id:'tenant-identity|'+c.id,kind:'tenant-identity',status:'pending',collection:'contracts',reason:'Flera parter har samma hyresgästnamn',values:{id:c.id,tenantName:c.tenantName}});
    }
   }
  }
  return data;
 }
 function issues(data){return(data.contracts||[]).filter(c=>c.tenantPartyId&&!(data.organizations||[]).some(o=>o.id===c.tenantPartyId)).map(c=>({id:c.id,message:'Hyresgästens part saknas',signature:JSON.stringify(c)}));}
 function validate(data,baseline){const old=new Set(baseline?issues(baseline).map(i=>i.signature):[]),error=issues(data).find(i=>!old.has(i.signature));if(error)throw TypeError(error.message);return data;}
 const api={normalize,validate,issues,key};root.LokalblickBusinessModel=api;if(root.window)root.window.LokalblickBusinessModel=api;
})(globalThis);

/* Shared canonical object identity and lifecycle. Runs locally in browser/backend. */
(function(root){
  const meaningful=value=>value!==undefined&&value!==null&&value!=='';
  function normalize(data){
    data.objects ||= [];data.contracts ||= [];data.activities ||= [];
    for(const o of data.objects){if(!Array.isArray(o.predecessorIds)){const raw=String(o.predecessorIds||'');try{o.predecessorIds=raw?JSON.parse(raw):[];}catch{o.predecessorIds=raw.split(/[;,]/).map(x=>x.trim()).filter(Boolean);}if(!Array.isArray(o.predecessorIds))o.predecessorIds=[];}}
    for(const contract of data.contracts){
      let object=data.objects.find(o=>o.id===contract.objectId||(!contract.objectId&&(o.id==='OBJ|'+contract.id)));
      if(!object&&contract.objectId)continue; // Broken explicit relations must be reviewed, never silently replaced.
      if(!object){
        if(!(data.properties||[]).some(p=>p.id===contract.propertyId))continue;
        const number=String(contract.objectNumber||'').trim();
        const same=number?data.objects.filter(o=>String(o.number??'')===number&&o.propertyId===contract.propertyId):[];
        if(same.length===1)object=same[0];
        else {
          object={id:'OBJ|'+contract.id,propertyId:contract.propertyId||'',number:number||'',name:contract.businessName||contract.number||'Objekt',start:'',end:'',predecessorIds:[]};
          for(const field of ['area','category','use','businessName','unitId','employees','users','rooms','commonArea','apartmentArea'])if(meaningful(contract[field]))object[field]=contract[field];
          if(contract.provenance)object.provenance=Object.fromEntries(Object.entries(contract.provenance).filter(([field])=>Object.hasOwn(object,field)).map(([field,value])=>[field,{...value,derived:'object-from-imported-contract'}]));
          data.objects.push(object);
        }
        contract.objectId=object.id;
      }
      // Property identity is derived from the linked object.
      contract.objectId=object.id;
      contract.propertyId=object.propertyId;
    }
    for(const activity of data.activities){if(activity.objectId&&!activity.contractId){const o=data.objects.find(o=>o.id===activity.objectId);if(o)activity.propertyId=o.propertyId;}}
    return data;
  }
  function validate(data){
    const objects=data.objects||[],byId=new Map(objects.map(o=>[o.id,o]));
    if(byId.size!==objects.length)throw TypeError('Objekt-ID måste vara unika');
    for(const o of objects){
      if(!(data.properties||[]).some(p=>p.id===o.propertyId))throw TypeError('Objektet måste tillhöra en fastighet');
      for(const field of ['start','end'])if(o[field]&&(!/^\d{4}-\d{2}-\d{2}$/.test(o[field])||!Number.isFinite(Date.parse(o[field]))||new Date(o[field]).toISOString().slice(0,10)!==o[field]))throw TypeError('Ogiltigt objektdatum');
      if(o.start&&o.end&&o.end<o.start)throw TypeError('Objektets t.o.m. måste vara efter fr.o.m.');
      for(const id of o.predecessorIds||[]){if(id===o.id||!byId.has(id))throw TypeError('Ogiltig föregående objektkoppling');const prev=byId.get(id);if(!prev.end||!o.start)throw TypeError('Avsluta föregående objekt och ange det nya objektets fr.o.m.');if(prev.propertyId!==o.propertyId)throw TypeError('Föregående objekt måste tillhöra samma fastighet');if(prev.end&&o.start&&prev.end>=o.start)throw TypeError('Föregående objekt måste avslutas före det nya objektet');}
    }
    const visiting=new Set(),done=new Set();
    function visit(id){if(visiting.has(id))throw TypeError('Objekthistoriken får inte innehålla cirklar');if(done.has(id))return;visiting.add(id);for(const prev of byId.get(id)?.predecessorIds||[])visit(prev);visiting.delete(id);done.add(id);}
    for(const o of objects)visit(o.id);
    for(const c of data.contracts||[])if(c.objectId&&!byId.has(c.objectId))throw TypeError('Avtalet har ogiltig objektkoppling');
    for(const a of data.activities||[])if(a.objectId&&!byId.has(a.objectId))throw TypeError('Aktiviteten har ogiltig objektkoppling');
    return data;
  }
  const propertyId=(data,record)=>record.objectId?(data.objects||[]).find(o=>o.id===record.objectId)?.propertyId||record.propertyId||'':record.propertyId||'';
  root.LokalblickObjectModel={normalize,validate,propertyId};
})(typeof window==='undefined'?globalThis:window);

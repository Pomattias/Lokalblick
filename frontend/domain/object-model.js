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
          object={id:'OBJ|'+contract.id,propertyId:contract.propertyId||'',number:number||'',name:contract.number||'Objekt',start:'',end:'',predecessorIds:[]};
          for(const field of ['area','category','use','unitId','employees','users','rooms','commonArea','apartmentArea'])if(meaningful(contract[field]))object[field]=contract[field];
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
    // External agreement files sometimes carry the only known object area.
    // Adopt an unambiguous area once into the object, never keep a second copy.
    for(const object of data.objects){
      if(meaningful(object.area))continue;
      const values=[...new Set(data.contracts.filter(c=>c.objectId===object.id&&meaningful(c.area)).map(c=>Number(c.area)))];
      if(values.length===1&&Number.isFinite(values[0])&&values[0]>=0)object.area=values[0];
      if(values.length>1){
        data.importReview ||= [];
        const id='object-area-conflict|'+object.id;
        if(!data.importReview.some(row=>row.id===id))data.importReview.push({id,kind:'object-area-conflict',status:'pending',collection:'objects',recordId:object.id,reason:'Olika avtalsytor för samma objekt kräver granskning',values});
      }
    }
    return projectAreas(data);
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
  // The OBJECT is the only persistent owner of area. Contracts may receive
  // an ephemeral projection for older budget/list consumers, never a stored copy.
  function projectAreas(data){
    for(const c of data.contracts||[]){
      const o=(data.objects||[]).find(o=>o.id===c.objectId);
      if(o&&meaningful(o.area))c.area=o.area;else delete c.area;
    }
    return data;
  }
  function stripAreas(data){
    for(const c of data.contracts||[]){
      delete c.area;
      delete c.apartmentArea;
      delete c.commonArea;
      delete c.objectAreaManaged;
    }
    return data;
  }
  function applyAreaChanges(before,data){
    // Editing a contract must never alter an object, including during bulk save.
    // Only the object editor may change an object's area.
    for(const c of data.contracts||[]){
      const previous=(before?.contracts||[]).find(old=>old.id===c.id);
      if(!previous||!Object.hasOwn(c,'area'))continue;
      const o=(data.objects||[]).find(o=>o.id===c.objectId);
      if(o&&meaningful(o.area)&&Number(c.area)!==Number(o.area)&&Number(c.area)!==Number(previous.area))
        throw TypeError('Yta ändras på objektet, aldrig på avtalet');
    }
    return new Set();
  }
  // A historical contract may point at the latest object version. Resolve
  // dated predecessors for an as-of lookup; ambiguous splits require review.
  function objectAt(data,objectId,at){
    const objects=data.objects||[];
    let candidates=[objects.find(o=>o.id===objectId)].filter(Boolean),visited=new Set();
    while(candidates.length){
      const matching=candidates.filter(o=>(!o.start||o.start<=at)&&(!o.end||o.end>=at));
      if(matching.length===1)return matching[0];
      if(matching.length>1)throw TypeError('Flera historiska objekt gäller samma datum');
      const next=candidates.flatMap(o=>(o.predecessorIds||[]).map(id=>objects.find(p=>p.id===id)).filter(Boolean)).filter(o=>!visited.has(o.id));
      candidates.forEach(o=>visited.add(o.id));candidates=next;
    }
    return null;
  }
  function adoptAreas(data){
    normalize(data);
    for(const o of data.objects||[]){
      const contracts=(data.contracts||[]).filter(c=>c.objectId===o.id),values=[...new Set(contracts.filter(c=>c.objectAreaManaged!==true&&meaningful(c.area)).map(c=>Number(c.area)))];
      if(!meaningful(o.area)&&values.length===1){o.area=values[0];o.provenance ||= {};o.provenance.area ||= {...contracts.find(c=>meaningful(c.area))?.provenance?.area,derived:'legacy-contract-area'};}
      for(const c of contracts)if(c.objectAreaManaged===true||!meaningful(c.area)||meaningful(o.area)&&Number(c.area)===Number(o.area)){c.objectAreaManaged=true;delete c.area;}
    }
    return data;
  }
  root.LokalblickObjectModel={normalize,validate,propertyId,projectAreas,stripAreas,adoptAreas,applyAreaChanges,objectAt};
})(typeof window==='undefined'?globalThis:window);

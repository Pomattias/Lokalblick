// Conservative Swedish address matching shared by both import adapters and the review UI.
(function(root) {
  const norm=v=>String(v??"").replace(/\u00a0/g," ").toLocaleLowerCase("sv").trim()
    .replace(/[.,;]/g," ").replace(/(\d)\s+([a-zåäö])(?=$|\s)/gi,"$1$2").replace(/\s+/g," ");
  const compact=v=>norm(v).replace(/\s+/g,"");
  const parts=v=>{const m=norm(v).match(/^(.*?)(?:\s+(\d+)([a-zåäö])?)?$/i);
    return {street:m?.[1]?.trim()||"",number:m?.[2]||"",suffix:m?.[3]||"",full:norm(v)};};
  function addressScore(a,b){
    const x=parts(a),y=parts(b);
    if(!x.street||!y.street||compact(x.street)!==compact(y.street))return 0;
    if(x.number&&y.number&&x.number!==y.number)return 0;
    if(x.suffix&&y.suffix&&x.suffix!==y.suffix)return 0;
    if(compact(x.full)===compact(y.full))return 110;
    return x.number&&y.number?85:65;
  }
  function rankProperties(properties,query,limit=6){
    const ref=compact(query.objectNo||query.sourceId),designation=compact(query.designation);
    return (properties||[]).map(p=>{
      if(query.city&&p.city&&norm(query.city)!==norm(p.city))return null;
      const location=query.address&&p.address?addressScore(query.address,p.address):0;
      if(query.address&&p.address&&!location)return null;
      let score=0,reason="";
      if(ref&&(compact(p.id)===ref||compact(p.sourceId)===ref)){score=125;reason="Objektsnummer";}
      else if(designation&&compact(p.designation)===designation){score=115;reason="Fastighetsbeteckning";}
      else if(location){score=location;reason=location===110?"Exakt adress":location===85?"Kontrollera husbokstav":"Kontrollera husnummer";}
      else if(!query.address&&query.name&&norm(query.name)===norm(p.name)){score=40;reason="Samma namn";}
      return score?{id:p.id,property:p,score,reason}:null;
    }).filter(Boolean).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id),"sv")).slice(0,limit);
  }
  function matchProperty(properties,query){
    const candidates=rankProperties(properties,query,7),top=candidates[0],unique=top&&(!candidates[1]||top.score>candidates[1].score);
    return {property:unique&&top.score>=105?top.property:null,method:top?.reason||"",
      score:top?.score||0,candidates};
  }
  function rankContracts(data,query,limit=6){
    const pm=matchProperty(data.properties||[],query),no=compact(query.number);
    const candidateIds=new Set(pm.candidates.filter(x=>x.score>=85).map(x=>x.id));
    return (data.contracts||[]).filter(c=>(no&&compact(c.number||c.sourceId)===no)||candidateIds.has(c.propertyId)).map(c=>{
      const property=(data.properties||[]).find(p=>p.id===c.propertyId),location=pm.candidates.find(x=>x.id===c.propertyId);
      let score=0;const reasons=[];
      if(no&&compact(c.number||c.sourceId)===no){score+=140;reasons.push("Avtalsnummer");}
      if(location){score+=Math.round(location.score/2);reasons.push(location.reason);}
      if(query.area&&c.area&&Math.abs(Number(query.area)-Number(c.area))<=1){score+=20;reasons.push("Area");}
      if(query.start&&c.start&&query.start===c.start){score+=25;reasons.push("Startdatum");}
      if(query.end&&c.end&&query.end===c.end){score+=10;reasons.push("Giltigt t.o.m.");}
      if(query.use&&c.use&&norm(query.use)===norm(c.use)){score+=8;reasons.push("Verksamhet");}
      return {id:c.id,contract:c,property,score,reason:reasons.join(" · ")};
    }).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id),"sv")).slice(0,limit);
  }
  function matchContract(data,query){
    const candidates=rankContracts(data,query,8),best=candidates[0],next=candidates[1];
    if(!best)return {contract:null,candidates:[],score:0,method:"Ingen säker träff"};
    const no=compact(query.number),exact=Boolean(no&&compact(best.contract.number||best.contract.sourceId)===no);
    const badAddress=Boolean(query.address&&best.property?.address&&!addressScore(query.address,best.property.address));
    if(exact&&!badAddress&&(!next||best.score>next.score))return {contract:best.contract,candidates:candidates.map(x=>x.id),score:best.score,method:"Avtalsnummer"};
    const pm=matchProperty(data.properties||[],query);
    const same=pm.property?.id===best.contract.propertyId&&pm.score>=105;
    const siblings=(data.contracts||[]).filter(c=>c.propertyId===best.contract.propertyId);
    const area=Boolean(query.area&&best.contract.area&&Math.abs(Number(query.area)-Number(best.contract.area))<=1);
    const start=Boolean(query.start&&best.contract.start&&query.start===best.contract.start);
    const badArea=Boolean(query.area&&best.contract.area&&Math.abs(Number(query.area)-Number(best.contract.area))>Math.max(5,Number(best.contract.area)*.05));
    const badStart=Boolean(query.start&&best.contract.start&&query.start!==best.contract.start);
    const badNumber=Boolean(no&&best.contract.number&&compact(best.contract.number)!==no);
    const safe=same&&!badArea&&!badStart&&(!badNumber||area&&start)&&(siblings.length===1||area&&start)&&(!next||best.score>next.score);
    return {contract:safe?best.contract:null,candidates:candidates.map(x=>x.id),score:best.score,
      method:safe?"Entydig adress och avtal":"Kontrollera matchning"};
  }
  const api={norm,parts,addressScore,rankProperties,matchProperty,rankContracts,matchContract};
  root.LokalblickAddressMatch=api;
  if(root.window)root.window.LokalblickAddressMatch=api;
})(globalThis);

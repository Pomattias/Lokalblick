// One canonical list for case types, status and categories.
// Legacy values stay on cases; display options never rewrite source data.
export const OPTION_KINDS=["type","status","category"];
export const DEFAULT_ACTIVITY_OPTIONS={
  type:["Projekt","Underhåll","Drift","Önskemål","Utredning"],
  status:["Nytt","Identifierad","Inkommen","Utredning","Planerad","Förstudie","Projektering","Upphandling","Beställd","Pågår","Genomförande","Besiktning","Utförd","Klar","Avslutad","Avslaget"],
  category:["Ytskikt","Inredning","Installationer","Ventilation","Ombyggnad","Nya lokaler","Tillgänglighet","Brand och säkerhet","Utemiljö","Energi","Övrigt"]
};
const clean=x=>String(x??"").trim().replace(/\s+/g," ");
const comparable=x=>clean(x).toLocaleLowerCase("sv");
export function normalizeActivityOptions(raw,activities=[]){
  const out=Object.fromEntries(OPTION_KINDS.map(kind=>[kind,DEFAULT_ACTIVITY_OPTIONS[kind].map((name,order)=>({
    name,active:true,order,types:[]
  }))]));
  for(const kind of OPTION_KINDS){
    if(!Array.isArray(raw?.[kind]))continue;
    const seen=new Set(),rows=[];
    for(const input of raw[kind].slice(0,300)){
      const name=clean(typeof input==="string"?input:input?.name);
      if(!name||name.length>90||seen.has(comparable(name)))continue;
      seen.add(comparable(name));
      rows.push({name,active:input?.active!==false&&input?.active!=="false",order:rows.length,
        types:kind==="category"&&Array.isArray(input?.types)?[...new Set(input.types.map(clean).filter(Boolean))]:[]});
    }
    out[kind]=rows;
  }
  // Imported/legacy values are visible to administrators but inactive until
  // explicitly approved. Never add unreviewed spelling variants to new pickers.
  for(const kind of OPTION_KINDS){
    const list=out[kind],found=new Set(list.map(x=>comparable(x.name)));
    for(const row of activities||[]){
      const name=clean(row[kind]);
      if(!name||name.length>90||found.has(comparable(name)))continue;
      found.add(comparable(name));
      list.push({name,active:false,order:list.length,types:[]});
    }
  }
  return out;
}
export function activityChoices(data,kind,{type="",current=""}={}){
  if(!OPTION_KINDS.includes(kind))throw Error("Ogiltigt register");
  const rows=normalizeActivityOptions(data?.activityOptions)[kind];
  const values=rows.filter(x=>x.active&&(kind!=="category"||!type||!x.types.length||x.types.includes(type)))
    .map(x=>({value:x.name,label:x.name}));
  const previous=clean(current);
  if(previous&&!values.some(x=>comparable(x.value)===comparable(previous)))
    values.push({value:previous,label:previous+(kind==="category"?" (tidigare kategori)":" (tidigare värde)")});
  return values;
}
export function optionUsage(data,kind,name){
  if(!OPTION_KINDS.includes(kind))throw Error("Ogiltigt register");
  return (data?.activities||[]).filter(x=>comparable(x[kind])===comparable(name)).length;
}
export function changeActivityOption(data,{kind,action,name,newName,type,active,direction}){
  if(!OPTION_KINDS.includes(kind))throw Error("Ogiltigt register");
  const setting=normalizeActivityOptions(data.activityOptions),rows=setting[kind];
  const index=rows.findIndex(x=>comparable(x.name)===comparable(name));
  if(action==="add"){
    const value=clean(newName);
    if(!value||value.length>90||/[<>{}]/.test(value))throw Error("Ange ett giltigt namn (högst 90 tecken)");
    if(rows.some(x=>comparable(x.name)===comparable(value)))throw Error("Alternativet finns redan");
    if(kind==="category"&&type&&!setting.type.some(x=>x.name===type))throw Error("Ärendetypen finns inte");
    rows.push({name:value,active:true,order:rows.length,types:kind==="category"&&type?[type]:[]});
  }else{
    if(index<0)throw Error("Alternativet finns inte");
    const row=rows[index];
    if(action==="toggle")row.active=Boolean(active);
    else if(action==="move"){
      const dest=index+(Number(direction)<0?-1:1);
      if(dest>=0&&dest<rows.length)[rows[index],rows[dest]]=[rows[dest],rows[index]];
    }else if(action==="scope"){
      if(kind!=="category")throw Error("Endast kategorier kan kopplas till en typ");
      if(type&&!setting.type.some(x=>x.name===type))throw Error("Ärendetypen finns inte");
      row.types=type?[type]:[];
    }else if(action==="delete"){
      if(optionUsage(data,kind,row.name))throw Error("Alternativet används av ärenden. Inaktivera det i stället.");
      if(kind==="type"&&setting.category.some(x=>x.types.includes(row.name)))
        throw Error("Ärendetypen används i kategorier. Ändra kopplingarna först.");
      rows.splice(index,1);
    }else throw Error("Okänd inställningsåtgärd");
  }
  for(const itemKind of OPTION_KINDS)setting[itemKind].forEach((x,idx)=>x.order=idx);
  data.activityOptions=setting;
  return data;
}

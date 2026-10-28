import { scope, responsible } from "./model.js";

/* Read-only dashboard projections; canonical records and calculations remain the source of truth. */
export const PORTFOLIO_LENSES = Object.freeze({person:"Ansvarig",unit:"Verksamhet",owner:"Fastighetsägare"});
const UNIT_NAMES = {VARDBO:"Vårdbo",ORDBO:"Ordbo",MYND_STAB:"Myndighet / Stab",HOF:"Hälsa & Förebyggande"};
const COLORS = ["var(--ui-chart-1)","var(--ui-chart-2)","var(--ui-chart-3)","var(--ui-chart-4)","var(--ui-chart-5)","var(--ui-chart-6)","var(--ui-chart-7)"];
const fmt = n => new Intl.NumberFormat("sv-SE",{maximumFractionDigits:0}).format(Number(n)||0);
const money = n => fmt(n)+" kr";
const esc = x => String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const getProperty = (data,id) => (data.properties||[]).find(p=>p.id===id)||{};
const getContract = (data,id) => (data.contracts||[]).find(c=>c.id===id)||null;
const getObject = (data,id) => (data.objects||[]).find(o=>o.id===id)||null;
function contractKey(data,c,mode) {
  const p=getProperty(data,c.propertyId);
  if(mode==="person")return String(responsible(data,"properties",p)||"");
  if(mode==="owner")return String(p.ownerPartyId||"");
  return String(getObject(data,c.objectId)?.unitId||c.unitId||p.unitId||"");
}
function activityKey(data,item,mode) {
  const r=item.record||{};
  const contract=getContract(data,r.contractId);
  const p=getProperty(data,item.propertyId||contract?.propertyId);
  if(mode==="person")return String(responsible(data,"activities",r)||"");
  if(mode==="owner")return String(p.ownerPartyId||"");
  if(r.scopeType==="unit")return String(r.unitId||"");
  const known=getObject(data,r.objectId)?.unitId||contract?.unitId||p.unitId||r.unitId;
  if(known)return String(known);
  const possible=[...new Set((data.contracts||[]).filter(x=>x.propertyId===p.id)
    .map(x=>getObject(data,x.objectId)?.unitId||x.unitId).filter(Boolean))];
  return possible.length===1?String(possible[0]):"";
}
function groupName(data,mode,id) {
  if(!id)return mode==="person"?"Utan ansvarig":mode==="unit"?"Verksamhet saknas":"Ägare saknas";
  if(mode==="unit")return UNIT_NAMES[id]||id;
  if(mode==="person")return (data.people||[]).find(p=>String(p.id)===id)?.name||"Okänd medarbetare";
  return (data.organizations||[]).find(o=>String(o.id)===id)?.name||"Okänd fastighetsägare";
}
function propertyName(data,id){
  const p=getProperty(data,id);
  return p.address||p.designation||"Fastighet saknas";
}
function rentFor(data,c,year) {
  const values=globalThis.LokalblickCalculations.annualValues(c,year,0,data.indexSeries||[]);
  return {amount:(Number(values.rent.amount)||0)+(Number(values.addition.amount)||0),
    review:values.rent.status==="Behöver kontroll"||values.addition.status==="Behöver kontroll"};
}
function add(map,key,name,record) {
  if(!map.has(key))map.set(key,{key,name,rent:0,area:0,activities:0,cost:0,contracts:0,properties:new Set()});
  const row=map.get(key);
  if(record.contract){
    row.rent+=record.rent;
    row.area+=Number(record.contract.area)||0;
    row.contracts++;
    if(record.contract.propertyId)row.properties.add(record.contract.propertyId);
  }
  if(record.activity){
    row.activities++;
    row.cost+=Number(record.activity.cost)||0;
    if(record.activity.propertyId)row.properties.add(record.activity.propertyId);
  }
}
function rank(map) {
  return [...map.values()].sort((a,b)=>b.rent-a.rent||b.activities-a.activities||a.name.localeCompare(b.name,"sv"));
}
export function buildPortfolioInsights(data, selection, year, mode="") {
  const view=scope(data,selection);
  const lens=Object.hasOwn(PORTFOLIO_LENSES,mode)?mode:"";
  const dimension=lens||"unit";
  const groupMap=new Map(), propertyMap=new Map();
  let rent=0, area=0, review=0;
  view.contracts.forEach(c=>{
    const calculated=rentFor(data,c,year);
    rent+=calculated.amount;
    area+=Number(c.area)||0;
    if(calculated.review)review++;
    add(groupMap,contractKey(data,c,dimension),groupName(data,dimension,contractKey(data,c,dimension)),{contract:c,rent:calculated.amount});
    add(propertyMap,String(c.propertyId||""),propertyName(data,c.propertyId),{contract:c,rent:calculated.amount});
  });
  view.items.forEach(item=>{
    const key=activityKey(data,item,dimension);
    add(groupMap,key,groupName(data,dimension,key),{activity:item});
    add(propertyMap,String(item.propertyId||""),propertyName(data,item.propertyId),{activity:item});
  });
  const properties=rank(propertyMap).filter(x=>x.key);
  const selected=Boolean(lens && selection[lens]);
  const groups=rank(groupMap);
  const breakdown=selected?properties:groups;
  const kinds=["Projekt","Underhåll","Drift","Önskemål"];
  const activityTypes=kinds.map(name=>{
    const rows=view.items.filter(x=>x.record.type===name);
    return {key:name,name,activities:rows.length,cost:rows.reduce((n,x)=>n+(Number(x.cost)||0),0)};
  });
  const remaining=view.items.filter(x=>!kinds.includes(x.record.type));
  if(remaining.length)activityTypes.push({key:"Övriga",name:"Övriga",activities:remaining.length,
    cost:remaining.reduce((n,x)=>n+(Number(x.cost)||0),0)});
  const activityCost=view.items.reduce((n,x)=>n+(Number(x.cost)||0),0);
  return {view,lens,dimension,selected,groups,properties,breakdown,activityTypes,rent,area,review,activityCost,
    unassigned:view.items.filter(x=>!responsible(data,"activities",x.record)).length};
}
const groupAttrs=(dimension,key)=>key
  ? (dimension==="property"?' data-dashboard-property="'+esc(key)+'"':' data-dashboard-group="'+esc(key)+'" data-dashboard-group-mode="'+esc(dimension)+'"')
  : "";
const clickable = (dimension,key) => Boolean(key);
function ring(data, rows, dimension, total) {
  if(total<=0)return '<p class="portfolio-empty">Ingen beräknad hyra i aktuellt urval.</p>';
  const colored=rows.filter(r=>r.rent>0);
  const displayed=colored.slice(0,7);
  const rest=colored.slice(7).reduce((sum,r)=>sum+r.rent,0);
  const slices=rest?displayed.concat([{key:"",name:"Övriga",rent:rest}]):displayed;
  const perimeter=2*Math.PI*54;
  let offset=0;
  const arcs=slices.map((item,index)=>{
    const portion=item.rent/total;
    const dash=portion*perimeter;
    const attr=groupAttrs(dimension,item.key);
    const isClickable=clickable(dimension,item.key);
    const title=esc(item.name+" · "+money(item.rent));
    const arc='<circle cx="80" cy="80" r="54" fill="none" stroke="'+COLORS[index%COLORS.length]+'" stroke-width="21" stroke-dasharray="'+dash+' '+perimeter+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 80 80)"></circle>';
    offset+=dash;
    return isClickable?'<g class="portfolio-ring-target" role="button" tabindex="0" aria-label="'+title+'"'+attr+'><title>'+title+'</title>'+arc+'</g>':arc;
  }).join("");
  return '<svg class="portfolio-ring" viewBox="0 0 160 160" role="img" aria-label="Hyresfördelning · '+esc(money(total))+'">'+arcs+
    '<text x="80" y="76" text-anchor="middle" class="portfolio-ring-total">'+esc(fmt(total))+'</text>'+
    '<text x="80" y="94" text-anchor="middle" class="portfolio-ring-caption">kr/år</text></svg>';
}
function legend(rows,dimension) {
  const visible=rows.filter(x=>x.rent>0).slice(0,7);
  const tail=rows.filter(x=>x.rent>0).slice(7);
  const entry=(item,index)=>'<button type="button" class="portfolio-legend-item"'+groupAttrs(dimension,item.key)+
    (!clickable(dimension,item.key)?' disabled title="Saknar koppling för fördjupning"':'')+'>'+
    '<span class="portfolio-legend-dot" style="background:'+COLORS[index%COLORS.length]+'"></span>'+
    '<span class="portfolio-legend-details"><span class="portfolio-legend-title">'+esc(item.name)+'</span>'+
    '<small>'+fmt(item.contracts)+' avtal · '+fmt(item.area)+' m²</small>'+
    '<small>'+fmt(item.activities)+(item.activities===1?' ärende':' ärenden')+' · '+money(item.cost)+'</small></span>'+
    '<strong class="portfolio-legend-money">'+money(item.rent)+'</strong></button>';
  const base=visible.map(entry).join("");
  const more=tail.length?'<details class="portfolio-more"><summary>Visa alla ('+tail.length+' till)</summary>'+
    tail.map((x,i)=>entry(x,i+visible.length)).join("")+'</details>':"";
  if(!visible.length)return '<p class="portfolio-empty">Inget att fördela.</p>';
  return '<div class="portfolio-legend">'+base+more+'</div>';
}

// Shared metric donut: SVG segments and accessible textual legend use the same values.
function metricDonut(rows,metric,total,unit,emptyMessage){
  const items=rows.filter(x=>Number(x[metric])>0);
  if(total<=0||!items.length)return '<p class="portfolio-empty">'+esc(emptyMessage)+'</p>';
  const circumference=2*Math.PI*54;
  let offset=0;
  const slices=items.map((x,i)=>{
    const amount=Number(x[metric]);
    const segment=amount/total*circumference;
    const label=esc(x.name+' · '+fmt(amount)+' '+unit);
    const circle='<circle cx="80" cy="80" r="54" fill="none" stroke="'+COLORS[i%COLORS.length]+'" stroke-width="21" stroke-dasharray="'+segment+' '+circumference+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 80 80)"><title>'+label+'</title></circle>';
    offset+=segment;
    return circle;
  }).join('');
  return '<svg class="portfolio-ring" viewBox="0 0 160 160" role="img" aria-label="'+esc('Fördelning av '+fmt(total)+' '+unit)+'">'+slices+
    '<text x="80" y="76" text-anchor="middle" class="portfolio-ring-total">'+esc(fmt(total))+'</text>'+
    '<text x="80" y="94" text-anchor="middle" class="portfolio-ring-caption">'+esc(unit)+'</text></svg>';
}
function metricLegend(rows,metric,unit,detail){
  return '<div class="portfolio-legend">'+rows.filter(x=>Number(x[metric])>0).map((x,i)=>
    '<div class="portfolio-legend-item"><span class="portfolio-legend-dot" style="background:'+COLORS[i%COLORS.length]+'"></span>'+
    '<span class="portfolio-legend-details"><span class="portfolio-legend-title">'+esc(x.name)+'</span><small>'+esc(detail(x))+'</small></span>'+
    '<strong class="portfolio-legend-money">'+esc(fmt(x[metric]))+' '+esc(unit)+'</strong></div>').join('')+'</div>';
}

function bars(rows, dimension, property=false) {
  const shown=rows.filter(x=>Number(x.activities)>0).sort((a,b)=>b.cost-a.cost||b.activities-a.activities).slice(0,8);
  const maximum=Math.max(1,...shown.map(x=>Math.max(0,Number(x.cost)||0)));
  if(!shown.length)return '<p class="portfolio-empty">Inga ärenden i urvalet.</p>';
  return shown.map(x=>{
    const attrs=property?groupAttrs("property",x.key):dimension?groupAttrs(dimension,x.key):"";
    const content='<span class="portfolio-bar-name">'+esc(x.name)+'</span>'+
      '<div class="dashboard-bar-track"><span style="width:'+Math.round(Math.max(0,Number(x.cost)||0)/maximum*100)+'%"></span></div>'+
      '<span class="portfolio-bar-values"><strong>'+money(x.cost)+'</strong><small>'+fmt(x.activities)+' st</small></span>';
    return attrs?'<button type="button" class="dashboard-bar-row portfolio-bar-action"'+attrs+'>'+content+'</button>':
      '<div class="dashboard-bar-row">'+content+'</div>';
  }).join("");
}
function propertyCosts(rows,dimension="property") {
  const shown=rows.filter(x=>x.contracts>0).sort((a,b)=>b.area-a.area||b.contracts-a.contracts).slice(0,7);
  const max=Math.max(1,...shown.map(x=>x.area));
  if(!shown.length)return '<p class="portfolio-empty">Inga avtal i aktuellt urval.</p>';
  return shown.map(x=>'<button type="button" class="portfolio-cost-row portfolio-area-row"'+
    (dimension==="property"?' data-property="'+esc(x.key)+'"':groupAttrs(dimension,x.key))+'>'+
    '<span class="portfolio-area-name">'+esc(x.name)+'<small>'+fmt(x.contracts)+' avtal · '+money(x.rent)+'/år</small></span>'+
    '<span class="portfolio-cost-track"><span style="width:'+Math.round(x.area/max*100)+'%"></span></span>'+
    '<strong>'+fmt(x.area)+' m²</strong></button>').join("");
}
export function portfolioDashboard(data,selection,year,mode=""){
  const a=buildPortfolioInsights(data,selection,year,mode);
  const selectedLabel=a.selected?groupName(data,a.dimension,selection[a.dimension]):"";
  const title=a.lens?"Fördelning per "+({person:"medarbetare",unit:"verksamhet",owner:"fastighetsägare"}[a.lens]):"Hela lokalbeståndet";
  const ringTitle=a.selected?"Årshyra per fastighet":"Årshyra per "+({person:"medarbetare",unit:"verksamhet",owner:"fastighetsägare"}[a.dimension]);
  const chartDimension=a.selected?"property":a.dimension;
  const barTitle=(a.selected?"Ärenden per typ":a.lens?"Ärenden per "+({person:"medarbetare",unit:"verksamhet",owner:"fastighetsägare"}[a.lens]):"Ärenden per typ")+" · kr och antal";
  const barRows=a.selected||!a.lens?a.activityTypes:a.groups;
  const ownerRows=buildPortfolioInsights(data,selection,year,'owner').groups;
  const shortcuts=[["properties","Fastigheter",a.view.properties.length],["contracts","Avtal totalt",a.view.contracts.length],["activities","Ärenden",a.view.items.length],["plan","Planera","›"]]
    .map(([view,label,value])=>'<button type="button" class="portfolio-shortcut ui-button ui-button--compact" data-view="'+view+'">'+label+' <strong>'+(typeof value==="number"?fmt(value):value)+'</strong></button>').join("");
  return '<div class="dashboard-intro portfolio-heading"><div><h2>Portföljöversikt</h2><p>'+esc(title)+'</p></div><span class="dashboard-year ui-label">År '+esc(year)+'</span></div>'+
    (a.selected?'<div class="portfolio-breadcrumb"><strong>'+esc(selectedLabel)+'</strong><button type="button" data-dashboard-clear>Visa hela fördelningen ×</button></div>':'')+
    '<div class="portfolio-panels">'+
      '<section class="dashboard-panel ui-card portfolio-rent-panel"><h3>'+esc(ringTitle)+'</h3>'+
      '<div class="portfolio-rent-layout">'+ring(data,a.breakdown,chartDimension,a.rent)+legend(a.breakdown,chartDimension)+'</div></section>'+
      '<section class="dashboard-panel ui-card"><div class="portfolio-panel-heading"><h3>'+esc(barTitle)+'</h3><span class="portfolio-metric-note">Aktuell prognos för '+esc(year)+'</span></div>'+
      '<div class="portfolio-rent-layout">'+metricDonut(barRows,'cost',barRows.reduce((n,x)=>n+Math.max(0,Number(x.cost)||0),0),'kr','Inga ärendekostnader i urvalet.')+
      metricLegend(barRows,'cost','kr',x=>fmt(x.activities)+' ärenden')+'</div>'+
      '<button type="button" data-view="activities" class="dashboard-text-link ui-button ui-button--quiet ui-button--compact">Visa ärenden ›</button></section>'+
      '<section class="dashboard-panel ui-card"><h3>'+('Avtal och ytor per fastighetsägare')+'</h3>'+
      '<div class="portfolio-rent-layout">'+metricDonut(ownerRows,'area',a.area,'m²','Ingen avtalad yta i urvalet.')+
      metricLegend(ownerRows,'area','m²',x=>fmt(x.contracts)+' avtal · '+money(x.rent)+'/år')+'</div>'+
      '<button type="button" data-view="contracts" class="dashboard-text-link ui-button ui-button--quiet ui-button--compact">Visa avtal ›</button></section>'+
      '<section class="dashboard-panel ui-card"><h3>Att bevaka</h3>'+
      '<div class="dashboard-fact"><span>Ärenden utan ansvarig</span><strong>'+fmt(a.unassigned)+'</strong></div>'+
      '<div class="dashboard-fact"><span>Avtal att kontrollera · samtliga perioder</span><strong>'+fmt(a.review)+'</strong></div>'+
      '<div class="dashboard-fact"><span>Fastigheter / avtal totalt</span><strong>'+fmt(a.view.properties.length)+' / '+fmt(a.view.contracts.length)+'</strong></div>'+
      '<button type="button" data-view="plan" class="dashboard-text-link ui-button ui-button--quiet ui-button--compact">Öppna Planera ›</button></section>'+
      '</div><div class="portfolio-shortcuts" aria-label="Gå till detaljerna">'+shortcuts+'</div>';
}

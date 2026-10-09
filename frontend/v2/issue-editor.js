import { esc, options, propertyReference, units, calc, money } from "./views.js";
import { planningMonthHeader, planningMonthButtons } from "./planning-visual.js";
import { fieldCaption } from "./field-labels.js";

// Exactly one editor for every activity type. Source columns and data semantics
// remain in the canonical activities model; they do not dictate UI fields.
export const ISSUE_TYPES=["Projekt","Underhåll","Drift","Önskemål"];
const activityKindOptions = [
  {value:"",label:"Ej bedömd"},
  {value:"value_enhancing",label:"Värdehöjande"},
  {value:"like_for_like",label:"Utbyte 1:1"},
];
const budgetTypes=["Ja","Nej"];
// Begränsad kodlista: påverkar enbart formulärets alternativ, inte lagrad data.
export const ISSUE_CATEGORIES=[
  "Ytskikt","Inredning","Installationer","Ventilation","Ombyggnad",
  "Nya lokaler","Tillgänglighet","Brand och säkerhet","Utemiljö","Energi","Övrigt"
];
export function issueCategoryChoices(current) {
  const categories=ISSUE_CATEGORIES.map(value=>({value,label:value}));
  const legacy=String(current||"").trim();
  if(legacy && !categories.some(item=>item.value===legacy))
    categories.push({value:legacy,label:legacy+" (tidigare kategori – välj om vid behov)"});
  return categories;
}
const field=(label,html,help="")=>'<label class="issue-field">'+esc(fieldCaption('activities',html,label))+html+(help?'<small>'+esc(help)+'</small>':"")+'</label>';
const input=(item,key,type="text",attrs="")=>'<input name="'+key+'" type="'+type+'" value="'+esc(item[key]??"")+'" '+attrs+'>';
const choice=(name,list,selected,placeholder="Välj")=>'<select name="'+name+'">'+options(list,x=>x.value,x=>x.label,selected,placeholder)+'</select>';
const currency=n=>money(Number(n)||0);
function issueHome(activity) {
  if(activity.contractId) return "contract:"+activity.contractId;
  if(activity.propertyId) return "property:"+activity.propertyId;
  if(activity.scopeType==="unit"&&activity.unitId)return "unit:"+activity.unitId;
  if(activity.scopeType==="general")return "general";
  return "";
}
function homeChoices(data,current) {
  const list=[
    ...(data.properties||[]).map(p=>({value:"property:"+p.id,label:"Fastighet · "+propertyReference(p)})),
    ...(data.contracts||[]).map(c=>{
      const p=(data.properties||[]).find(p=>p.id===c.propertyId);
      return {value:"contract:"+c.id,label:"Avtal · "+(c.number||c.id)+" · "+propertyReference(p)};
    }),
    ...Object.entries(units).map(([id,label])=>({value:"unit:"+id,label:"Verksamhet · "+label})),
    {value:"general",label:"Generellt ärende"}
  ];
  if(current&&!list.some(x=>x.value===current))
    list.push({value:current,label:"Tidigare hemvist · kontrollera koppling"});
  return list;
}
function humanAssessment(economics) {
  if(economics.kind==="investment")return "Investering";
  if(economics.kind==="operating")return "Drift";
  if(economics.kind==="missing_base_amount")return "Prisbasbelopp saknas";
  return "Ej bedömd";
}
export function applyIssueHome(activity,home) {
  const value=String(home||"");
  if(value.startsWith("contract:")) {
    activity.contractId=value.slice(9);
    activity.propertyId="";
    activity.unitId="";
    activity.scopeType="contract";
  } else if(value.startsWith("property:")) {
    activity.propertyId=value.slice(9);
    activity.contractId="";
    activity.unitId="";
    activity.scopeType="property";
  } else if(value.startsWith("unit:")) {
    activity.unitId=value.slice(5);
    activity.propertyId="";
    activity.contractId="";
    activity.scopeType="unit";
  } else if(value==="general"||value==="") {
    activity.propertyId="";
    activity.contractId="";
    activity.unitId="";
    activity.scopeType=value==="general"?"general":"";
  } else throw Error("Ogiltig hemvist för ärendet");
  return activity;
}
export function renderIssueEditor(data,issue,id,company=false) {
  const kinds=ISSUE_TYPES.includes(issue.type)||!issue.type
    ? ISSUE_TYPES : [...ISSUE_TYPES,issue.type];
  const years=Array.isArray(issue.yearAllocations)?issue.yearAllocations.filter(x=>Number.isFinite(Number(x.year))):[];
  const orderList=(data.orders||[]).filter(x=>x.activityId===issue.id);
  const year=Number(issue.planningYear)||new Date().getFullYear();
  const assessment=calc().activityEconomics(data,issue,year);
  const typeSelect=choice("type",kinds.map(value=>({value,label:value})),issue.type,"Välj ärendetyp");
  const statuses=[...new Set(["Nytt","Utreds","Planerad","Pågår","Beställd","Utförd","Klar","Avslutad","Avslaget",...
    (data.activities||[]).map(a=>a.status).filter(Boolean),issue.status].filter(Boolean))];
  const priorities=[...new Set(["Låg","Normal","Hög","Akut",...
    (data.activities||[]).map(a=>a.priority).filter(Boolean),issue.priority].filter(Boolean))];
  const internal=(data.people||[]).filter(p=>!p.organizationId||(data.organizations||[])
    .some(o=>o.id===p.organizationId && o.type==="our"));
  if(issue.responsiblePersonId&&!internal.some(p=>p.id===issue.responsiblePersonId)) {
    const p=(data.people||[]).find(x=>x.id===issue.responsiblePersonId);
    if(p)internal.push(p);
  }
  const orderSummary=orderList.length
    ? '<div class="issue-order-rows">'+orderList.map(o=>'<div><span>'+esc(o.supplier||o.orderReference||"Beställning")+
      ' · '+esc(o.paymentStatus||o.status||"Registrerad")+'</span><strong>'+currency(o.finalCost||o.orderedCost)+'</strong></div>').join("")+'</div>'
    : '<p class="issue-note">Ingen beställning registrerad.</p>';
  const allocations=years.length
    ? '<p class="issue-note">Årsfördelning: '+years.map(x=>esc(x.year)+" · "+esc(currency(x.amount))).join(" / ")+'</p>'
    : '<p class="issue-note">Ingen årsvis kostnadsfördelning registrerad. Fördela i Planera.</p>';

  return '<div class="editor-backdrop"></div>'+
    '<aside class="editor issue-editor" aria-labelledby="editor-title"><form id="edit-form" data-collection="activities" data-record-id="'+esc(id||"")+'">'+
    '<div class="section-title"><div><small>'+(id?"ÄNDRA ÄRENDE":"NYTT ÄRENDE")+'</small>'+
    '<h2 id="editor-title" class="issue-title-heading">'+esc(issue.title||"Nytt ärende")+'</h2><small>'+esc(issue.type||"Projekt · Underhåll · Drift · Önskemål")+'</small>'+
    '</div><button type="button" data-editor-close>Stäng</button></div>'+
    '<section class="issue-section"><h3>Ärende</h3><div class="issue-grid">'+
      '<div class="issue-title-field">'+field("Ärendenamn",input(issue,"title","text",'required maxlength="250"'))+'</div>'+
      field("Typ",typeSelect)+
      field("Status",choice("status",statuses.map(value=>({value,label:value})),issue.status,"Välj status"))+
      field("Kategori",choice("category",issueCategoryChoices(issue.category),issue.category,"Välj kategori"))+
      field("Prioritet",choice("priority",priorities.map(value=>({value,label:value})),issue.priority,"Ej prioriterad"))+
    '</div>'+
    '<label class="issue-field issue-description">Beskrivning<textarea name="description" rows="3">'+esc(issue.description||"")+'</textarea></label>'+
    '<div class="issue-grid">'+
      field("Kopplat till",choice("issueHome",homeChoices(data,issueHome(issue)),issueHome(issue),"Ej kopplat"))+
      field("Ansvarig",choice("responsiblePersonId",internal.map(p=>({value:p.id,label:p.name})),issue.responsiblePersonId,"Ej fördelad"))+
    '</div></section>'+
    '<section class="issue-section"><h3>Tid och planering</h3><div class="issue-grid">'+
      field("Fr.o.m.",input(issue,"startDate","date"))+
      field("T.o.m.",input(issue,"endDate","date"))+
      field("Planeringsår",input(issue,"planningYear","number",'min="2000" max="2200" step="1"'))+
      field("Fas",input(issue,"phase","text"))+
    '</div>'+
    '<div class="issue-visual-planner" data-issue-planner data-plan-span="1">'+
      '<div class="issue-visual-heading"><strong>Grafisk planering</strong>'+
      '<div class="actions"><button type="button" data-issue-plan-span="1" class="active" aria-pressed="true">1 år</button>'+
      '<button type="button" data-issue-plan-span="3" aria-pressed="false">3 år</button></div></div>'+
      '<p class="issue-note" data-plan-hint>Välj startmånad och sedan slutmånad. Samma period visas i Planera.</p>'+
      '<div class="issue-planner-scroll"><div class="issue-plan-content" style="--timeline-columns:12">'+
      '<div class="timeline-track timeline-plan-header">'+planningMonthHeader(year,1)+'</div>'+
      '<div class="timeline-track timeline-plan-months">'+planningMonthButtons(issue,year,1,"form")+'</div>'+
      '</div></div></div>'+
    allocations+'</section>'+
    '<section class="issue-section"><h3>Kostnad och budget</h3><div class="issue-grid">'+
      field("Bedömd kostnad, kr",input(issue,"estimatedCost","number",'min="0" step="any"'))+
      field("Åtgärdens karaktär",choice("actionKind",activityKindOptions,issue.actionKind||
        (issue.standardEnhancing===true?"value_enhancing":issue.standardEnhancing===false?"like_for_like":""),"Ej bedömd"))+
      field("Ta med i budget",choice("includeInBudget",budgetTypes.map(value=>({value,label:value})),issue.includeInBudget||(issue.budgetIncluded===false?"Nej":"Ja"),"Välj"))+
      field("Hyrespåslag från",input(issue,"rentSurchargeStartDate","date"),"Endast aktuellt vid hyresfinansierad investering")+
    '</div>'+
    '<div class="issue-assessment"><span>Beräknad ekonomisk bedömning '+esc(year)+'</span><strong>'+esc(humanAssessment(assessment))+'</strong>'+
      '<small>Gräns: '+esc(assessment.threshold==null?"saknas":currency(assessment.threshold))+
      (assessment.special?" · Stadsfastigheters regel":"")+
      (assessment.rentFinanced?" · Hyresfinansiering med beräknat påslag "+currency(assessment.annualRentAddition)+"/år":"")+
      ' · Beräknat från senast sparade uppgifter</small></div>'+
    '</section>'+
    '<section class="issue-section"><h3>Beställning och utfall</h3>'+orderSummary+
    '<p class="issue-note">Beställningar och utfall hör till samma ärende. Hanteras fortsatt i befintligt beställningsflöde.</p></section>'+
    (company?'<p class="computed">Importerade grunduppgifter och kompletteringar följer befintlig backendkoppling.</p>':"")+
    '<div class="actions editor-actions"><span>Ändringar uppdaterar samma ärende i Planera, Ärenden och Budget.</span>'+
    '<button type="submit" class="primary">Spara ärende</button></div></form></aside>';
}

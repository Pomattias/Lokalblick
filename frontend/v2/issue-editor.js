import {responsibilityHtml} from "./responsibility-editor.js";
import {activityJournalHtml} from "./activity-journal.js";
import { esc, options, propertyReference, units, calc, money } from "./views.js";
import { planningMonthHeader, planningMonthButtons } from "./planning-visual.js";
import { fieldCaption } from "./field-labels.js";
import { DEFAULT_ACTIVITY_OPTIONS,activityChoices } from "./activity-options.js";

// Exactly one editor for every activity type. Source columns and data semantics
// remain in the canonical activities model; they do not dictate UI fields.
export const ISSUE_TYPES=DEFAULT_ACTIVITY_OPTIONS.type;
export const ISSUE_CATEGORIES=DEFAULT_ACTIVITY_OPTIONS.category;
export function issueCategoryChoices(current,data={},type=""){
  return activityChoices(data,"category",{type,current});
}
const field=(label,html,display="")=>'<label class="issue-field issue-mode-field"><span class="issue-field-label">'+esc(fieldCaption('activities',html,label))+'</span><span class="issue-field-value">'+esc(display||"–")+'</span><span class="issue-field-control">'+html+'</span></label>';
const input=(item,key,type="text",attrs="")=>'<input name="'+key+'" type="'+type+'" value="'+esc(item[key]??"")+'" '+attrs+'>';
// Respect administrator's order; shared views.options deliberately sorts alphabetically.
const choice=(name,list,selected,placeholder="Välj")=>
  '<select name="'+esc(name)+'"><option value="">'+esc(placeholder)+'</option>'+
  list.map(row=>'<option value="'+esc(row.value)+'"'+(String(row.value)===String(selected)?' selected':'')+
    '>'+esc(row.label)+'</option>').join("")+'</select>';
const currency=n=>money(Number(n)||0);
function issueHome(activity) {
  if(activity.contractId) return "contract:"+activity.contractId;
  if(activity.objectId)return "object:"+activity.objectId;
  if(activity.propertyId) return "property:"+activity.propertyId;
  if(activity.scopeType==="unit"&&activity.unitId)return "unit:"+activity.unitId;
  if(activity.scopeType==="general")return "general";
  return "";
}
function homeChoices(data,current) {
  const list=[
    ...(data.properties||[]).map(p=>({value:"property:"+p.id,label:"Fastighet · "+(p.designation||p.address||p.id)})),
    ...(data.objects||[]).map(o=>({value:"object:"+o.id,label:"Objekt · "+(o.number||o.name||o.id)})),
    ...(data.contracts||[]).map(c=>{
      const p=(data.properties||[]).find(p=>p.id===c.propertyId);
      return {value:"contract:"+c.id,label:"Avtal · "+(c.number||c.id)};
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
  activity.objectId="";
  if(value.startsWith("object:")){activity.objectId=value.slice(7);activity.contractId="";activity.propertyId="";activity.unitId="";activity.scopeType="object";
  }else if(value.startsWith("contract:")) {
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
  const kinds=activityChoices(data,"type",{current:issue.type});
  const orderList=(data.orders||[]).filter(x=>x.activityId===issue.id);
  const linkedContract=(data.contracts||[]).find(x=>x.id===issue.contractId);
  const linkedObject=(data.objects||[]).find(x=>x.id===(issue.objectId||linkedContract?.objectId));
  const linkedPropertyId=linkedObject?.propertyId||linkedContract?.propertyId||issue.propertyId||"";
  const linkedProperty=(data.properties||[]).find(x=>x.id===linkedPropertyId);
  const propertyName=linkedProperty?([linkedProperty.designation,linkedProperty.address].filter(Boolean).join(" · ")||linkedProperty.id):"Ingen fastighet kopplad";

  const year=Number(issue.planningYear)||new Date().getFullYear();
  const assessment=calc().activityEconomics(data,issue,year);
  const typeSelect=choice("type",kinds,issue.type,"Välj ärendetyp");
  const statuses=activityChoices(data,"status",{current:issue.status});
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

  return '<div class="editor-backdrop"></div>'+
    '<aside class="editor issue-editor" aria-labelledby="editor-title"><form id="edit-form" class="'+(id?"editor-readonly":"editor-editing")+'" data-collection="activities" data-record-id="'+esc(id||"")+'">'+
    '<div class="section-title issue-heading"><div class="issue-heading-text">'+
    '<h2 id="editor-title" class="issue-title-heading">'+esc(issue.title||"Nytt ärende")+'</h2><label class="issue-edit-title"><span class="visually-hidden">Ärendenamn</span>'+input(issue,"title","text",'required maxlength="250"')+'</label><small>'+esc(issue.type||"Projekt · Underhåll · Drift · Önskemål")+'</small>'+
    '</div><div class="issue-heading-actions">'+
    (id?'<button type="button" data-editor-activate class="editor-activate">Redigera</button><button type="button" data-editor-undo>Ångra</button>':"")+
    '<button type="submit" class="primary" data-issue-save>Spara</button><button type="button" data-editor-close>Stäng</button>'+
    '<span class="editor-save-status" role="status" data-editor-save-status></span></div></div>'+
    '<section class="issue-section issue-main-section"><div class="issue-grid">'+
      '<div class="issue-home-row"><div class="issue-property-reference"><span>Fastighet</span><strong title="'+esc(propertyName)+'">'+esc(propertyName)+'</strong></div>'+field("Objekt",choice("issueHome",homeChoices(data,issueHome(issue)),issueHome(issue),"Ej kopplat"),homeChoices(data,issueHome(issue)).find(x=>x.value===issueHome(issue))?.label||"Ej kopplat")+'</div>'+
      '<div class="issue-owner-row">'+field("Ansvarig",choice("responsiblePersonId",internal.map(p=>({value:p.id,label:p.name})),issue.responsiblePersonId,"Ej fördelad"),internal.find(p=>p.id===issue.responsiblePersonId)?.name||"Ej fördelad")+'</div>'+
      '<div class="issue-compact-meta">'+
      field("Typ",typeSelect,issue.type)+
      field("Status",choice("status",statuses,issue.status,"Välj status"),issue.status)+
      field("Kategori",choice("category",issueCategoryChoices(issue.category,data,issue.type),issue.category,"Välj kategori"),issue.category)+
      field("Prioritet",choice("priority",priorities.map(value=>({value,label:value})),issue.priority,"Ej prioriterad"),issue.priority)+
      '</div>'+
      '<div class="issue-description-row">'+field("Beskrivning",'<textarea name="description" rows="2">'+esc(issue.description||"")+'</textarea>',issue.description)+'</div>'+
    '</div></section>'+
    activityJournalHtml(data,id,{draft:issue,editable:true})+
    '<details class="issue-visual-planner" data-issue-planner data-plan-span="1">'+
      '<summary>Grafisk tidplan – visa / dölj</summary>'+
      '<div class="issue-visual-heading"><strong>Grafisk planering</strong>'+
      '<div class="actions"><button type="button" data-issue-plan-span="1" class="active" aria-pressed="true">1 år</button>'+
      '<button type="button" data-issue-plan-span="3" aria-pressed="false">3 år</button></div></div>'+
      '<p class="issue-note" data-plan-hint>Välj startmånad och sedan slutmånad. Samma period visas i Planera.</p>'+
      '<div class="issue-planner-scroll"><div class="issue-plan-content" style="--timeline-columns:12">'+
      '<div class="timeline-track timeline-plan-header">'+planningMonthHeader(year,1)+'</div>'+
      '<div class="timeline-track timeline-plan-months">'+planningMonthButtons(issue,year,1,"form")+'</div>'+
      '</div></div></details>'+    '<section class="issue-section issue-cost-section issue-economic-section">'+
    '<details class="issue-economic-details"><summary>Ekonomisk bedömning '+esc(year)+' · '+esc(humanAssessment(assessment))+'</summary>'+
      '<div class="issue-assessment"><small>Gräns: '+esc(assessment.threshold==null?"saknas":currency(assessment.threshold))+
      (assessment.special?" · Stadsfastigheters regel":"")+
      (assessment.rentFinanced?" · Hyresfinansiering med beräknat påslag "+currency(assessment.annualRentAddition)+"/år":"")+
      ' · Beräknat från senast sparade uppgifter</small></div></details>'+
    '</section>'+
    '<section class="issue-section"><h3>Beställning och utfall</h3>'+orderSummary+
    '</section>'+
    (company?'<p class="computed">Importerade grunduppgifter och kompletteringar följer befintlig backendkoppling.</p>':"")+
    responsibilityHtml(data,'activity',issue.id)+'</form></aside>';
}

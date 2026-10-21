import {linkMaintenanceIssue} from './maintenance.js';
import {needsMaintenanceAction} from './maintenance-model.js';
import {parseDate,parseNumber} from '../services/import-formats.js';

const text=value=>String(value??'').trim(),norm=value=>text(value).toLocaleLowerCase('sv').replace(/\s+/g,' ');
const marked=value=>/^x$/i.test(text(value));
const partName=value=>/^(väggar?|tak|golv|snickerier|innerdörrar?|ytterdörrar?|dörrar?|el|vvs|ventilation|belysning|kylskåp|kyl\/frys|frys|spis(?:plattor)?|micro|mikrovågsugn|skåp|luckor|bänkskiva(?:\/diskbänk)?|diskmaskin|diskbänk|fläkt|wc-stol|dusch|tvättmaskin|torktumlare|torkskåp)$/i.test(text(value));
const floorName=value=>/^(våning\b|plan\s+\d|entréplan|källarplan|källare|övervåning|bottenplan)/i.test(text(value));
const summary=value=>/^(sammanfattning|samlad bedömning|summa\b|totalt\b)/i.test(text(value));
const present=value=>value!=null&&text(value)!=='';
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
// Stable source positions distinguish repeated room names. They are not object IDs.
const sourceId=(prefix,values)=>{let a=2166136261,b=5381;for(const char of JSON.stringify(values)){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b,33)^char.charCodeAt(0);}return prefix+'-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');};

// Matrix extraction only. XLSX reading, canonical storage, validation, audit and
// export remain the application's existing pipeline. No source file is changed.
export async function profileMaintenanceWorkbook(book,XLSX,fileName){
 const profiles=[],ignored=[];
 for(const name of book.SheetNames){
  const sheet=book.Sheets[name];if(!sheet['!ref']){ignored.push(name);continue;}
  const range=XLSX.utils.decode_range(sheet['!ref']);
  if(range.e.r>50000||range.e.c>200)throw Error('Besiktningsunderlaget är för stort. Högst 50 000 rader och 201 kolumner per flik.');
  const cell=(r,c)=>sheet[XLSX.utils.encode_cell({r,c})],value=(r,c)=>cell(r,c)?.v;
  const blocks=[];
  for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c+2;c<=range.e.c;c++){
   if(/^bra skick/i.test(text(value(r,c)))&&/^dåligt skick/i.test(text(value(r,c+1)))&&/^kommentar/i.test(text(value(r,c+2))))blocks.push({r,c});
  }
  if(!blocks.length){ignored.push(name);continue;}
  const consumed=new Set(),coordinate=(r,c)=>XLSX.utils.encode_cell({r,c});
  const read=(r,c)=>{consumed.add(coordinate(r,c));return value(r,c);};
  const profile={name,fileName,blocks:[],warnings:[]};
  for(const block of blocks){
   const {r,c}=block,left=c-2,next=blocks.find(other=>other.r>r&&other.c===c),end=next?next.r-1:range.e.r;
   const right=blocks.filter(other=>other.r===r&&other.c>c).sort((a,b)=>a.c-b.c)[0];
   const endColumn=right?right.c-3:Math.min(range.e.c,c+13),plans=[];
   for(let col=c+4;col<=endColumn;col++){
    const label=text(read(r,col)),year=Number(label);
    if(/^\d{4}$/.test(label)&&year>=1900&&year<=9999)plans.push({col,year});
    else if(/^(inom\s*1\s*år|2\s*[-–]\s*5\s*år|5\s*[-–]\s*10\s*år|10\s*\+\s*år)$/i.test(label))plans.push({col,interval:label});
   }
   const result={header:coordinate(r,left),column:left,date:null,inspector:'',spaces:[],warnings:[],notes:[],source:{source:fileName,sheet:name,header:coordinate(r,left)}};
   // Modern metadata has explicit labels. Older blocks have a formatted date
   // above the matrix and the inspector directly above that date.
   for(let row=r;row>=Math.max(0,r-20)&&!result.date;row--)for(let col=left;col<=Math.min(left+2,range.e.c);col++){
    const candidate=cell(row,col);if(!candidate||candidate.f)continue;
    const embedded=typeof candidate.v==='string'&&text(candidate.v).match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})$/);
    if(embedded){try{result.date=parseDate(embedded[2],XLSX);result.inspector=embedded[1];consumed.add(coordinate(row,col));}catch{}continue;}
    const dateLike=candidate.t==='d'||XLSX.SSF.is_date(candidate.z||'')||typeof candidate.v==='string'&&/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text(candidate.v));
    if(dateLike){try{result.date=parseDate(candidate.v,XLSX,Boolean(book.Workbook?.WBProps?.date1904));consumed.add(coordinate(row,col));}catch{result.warnings.push('Besiktningsdatum behöver kontrolleras.');}
     const above=text(value(row-1,col)),below=text(value(row+1,col));if(above&&!/datum|skick/i.test(above))result.inspector=above;else if(below&&!/datum|skick|våning|plan/i.test(below))result.inspector=below;
    }
    if(/^datum utförande$/i.test(text(candidate.v))){try{result.date=parseDate(value(row+1,col),XLSX,Boolean(book.Workbook?.WBProps?.date1904));}catch{result.warnings.push('Besiktningsdatum saknas eller är ogiltigt.');}}
   }
   // An explicit inspector caption takes precedence over the date heuristic.
   for(let row=Math.max(0,r-20);row<r;row++)for(let col=left;col<=Math.min(left+3,range.e.c);col++)if(/^utförare$/i.test(text(value(row,col))))result.inspector=text(value(row+1,col));
   let floor='',space=null;const occurrences=new Map();
   const nextLabel=row=>{for(let k=row+1;k<=Math.min(end,row+4);k++)if(present(value(k,left)))return text(value(k,left));return '';};
   for(let row=r+1;row<=end;row++){
    const label=text(read(row,left));if(!label)continue;
    if(summary(label))break;
    const isFloor=floorName(label);if(isFloor){floor=label;space=null;}
    const condition=[c-1,c,c+1].filter(col=>marked(read(row,col)));
    const comment=text(read(row,c+2)),lastAction=text(read(row,c+3)),sourcePlans=[];
    for(const plan of plans){const raw=read(row,plan.col);if(!present(raw)||cell(row,plan.col)?.f)continue;
     if(plan.interval){if(marked(raw))sourcePlans.push({interval:plan.interval});else{result.warnings.push(coordinate(row,plan.col)+': okänd intervallmarkering bevaras i källuppgifterna.');consumed.delete(coordinate(row,plan.col));}}
     else try{const amount=parseNumber(raw);if(amount<0)throw Error();if(amount!==0)sourcePlans.push({year:plan.year,amount});}catch{result.warnings.push(coordinate(row,plan.col)+': beloppet behöver granskas.');consumed.delete(coordinate(row,plan.col));}
    }
    if(isFloor&&!condition.length&&!comment&&!sourcePlans.length&&!lastAction)continue;
    const following=nextLabel(row),isRoom=isFloor||!partName(label)&&(/^väggar?$/i.test(following)||!condition.length&&!comment&&!sourcePlans.length&&partName(following));
    if(isRoom){
     const signature=JSON.stringify([floor,norm(label)]),occurrence=(occurrences.get(signature)||0)+1;occurrences.set(signature,occurrence);
     space={name:isFloor?'Gemensamt':label+(occurrence>1?' ('+occurrence+')':''),floor,sourceKey:[name,left,floor,norm(label),occurrence],points:[]};result.spaces.push(space);
     if(occurrence>1)result.warnings.push('Utrymmet '+label+' förekommer flera gånger och hålls åtskilt. Kontrollera placeringen.');
     // A condition on a room/floor heading is an overall source assessment,
     // not another building part to inspect alongside its walls, roof and floor.
     // Keep the entire heading row among source annotations instead of counting
     // its totals or condition a second time.
     for(let col=left;col<=endColumn;col++)consumed.delete(coordinate(row,col));
     continue;
    }
    if(!condition.length&&!comment&&!sourcePlans.length&&!lastAction&&!partName(label)){
     result.notes.push(coordinate(row,left)+': '+label);continue;
    }
    if(!space){space={name:'Gemensamt',floor,sourceKey:[name,left,floor,'gemensamt'],points:[]};result.spaces.push(space);result.warnings.push('Några delar saknar tydligt utrymme. De visas under Gemensamt.');}
    const part=label,source={source:fileName,sheet:name,cell:coordinate(row,left),condition:condition.map(col=>text(value(r,col))||'Nyskick')};
    if(condition.length>1)result.warnings.push(source.cell+': flera skickmarkeringar. Bedömningen lämnas Ej bedömd.');
    space.points.push({name:part,assessment:condition.length!==1?'unchecked':condition[0]===c-1?'excellent':condition[0]===c?(/anmärk/i.test(text(value(r,c)))?'ok':'good'):'defect',comment,lastAction,sourcePlans,source});
   }
   if(!result.date)result.warnings.push('Besiktningsdatum saknas; inget datum antas.');
   if(!result.spaces.some(space=>space.points.length))continue;
   result.source.inspector=result.inspector;
   result.source.notes=result.notes;
   profile.blocks.push(result);profile.warnings.push(...result.warnings);
  }
  // Keep ancillary text separately from observations, including side summaries.
  const extra=[];
  for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){
   const current=cell(r,c),at=coordinate(r,c);
   if(current&&present(current.v)&&!consumed.has(at))extra.push({cell:at,value:current.v instanceof Date?current.v.toISOString():current.v,...(current.f?{formula:current.f}:{})});
  }
  if(profile.blocks.length){
   const dates=[...new Set(profile.blocks.map(block=>block.date).filter(Boolean))],inspectors=[...new Set(profile.blocks.map(block=>norm(block.inspector)).filter(Boolean))];
   // Side-by-side matrices are sections of one protocol, not additional visits.
   // Conflicting dated headers remain separate and are flagged for review.
   if(profile.blocks.length>1&&dates.length<=1&&inspectors.length<=1){
    const first=profile.blocks[0],all=[...profile.blocks];
    first.spaces=all.flatMap(block=>block.spaces);first.notes=all.flatMap(block=>block.notes);
    first.date=dates[0]||null;first.inspector=all.find(block=>block.inspector)?.inspector||'';
    first.source={...first.source,headers:all.map(block=>block.header),notes:first.notes,inspector:first.inspector};
    profile.blocks=[first];
   }else if(profile.blocks.length>1)profile.warnings.push('Olika datum eller utförare hittades. Matrisernas besiktningar hålls åtskilda.');
   profile.blocks[0].source.extra=extra;
   const signature=Object.entries(sheet).filter(([at,cell])=>!at.startsWith('!')&&present(cell?.v)).map(([at,cell])=>[at,cell.v,cell.f||null]).sort(([a],[b])=>a.localeCompare(b));
   for(const block of profile.blocks)block.fingerprint=await digest(JSON.stringify([name,block.header,signature]));
   profiles.push(profile);
  }else ignored.push(name);
 }
 return {profiles,ignored};
}

export function applyMaintenanceImport(data,profiles,mapping){
 let imported=0,unchanged=0,points=0;
 for(const profile of profiles){
  const objectId=mapping[profile.name];if(!objectId)continue;
  if(!data.objects.some(row=>row.id===objectId))throw Error('Välj ett befintligt ObjektID för '+profile.name+'.');
  for(const block of profile.blocks){
   const inspectionId=sourceId('BEH',[objectId,block.fingerprint]);
   const existing=data.inspections.find(row=>row.id===inspectionId);
   if(existing){unchanged++;continue;}
   let inspectorId=null;
   if(block.inspector){
    const matches=data.people.filter(person=>norm(person.name)===norm(block.inspector));
    if(matches.length>1)throw Error('Flera personer heter '+block.inspector+'. Gör namnet entydigt i underlaget före import.');
    inspectorId=matches[0]?.id;
    if(!inspectorId){inspectorId='PER-'+crypto.randomUUID();data.people.push({id:inspectorId,name:block.inspector});}
   }
   data.inspections.push({id:inspectionId,objectId,inspectedOn:block.date,inspectorId,status:'completed',notes:block.notes.join('\n'),sources:[block.source]});
   for(const room of block.spaces){
    const spaceId=sourceId('UTR',[objectId,...room.sourceKey]);
    const existing=data.spaces.find(row=>row.id===spaceId);
    if(existing&&(existing.objectId!==objectId||existing.name!==room.name||(existing.floor||'')!==room.floor))throw Error('Utrymmets identitet har ändrats. Kontrollera underlaget.');
    if(!existing)data.spaces.push({id:spaceId,objectId,name:room.name,floor:room.floor});
    const occurrences=new Map();
    for(const point of room.points){
     const occurrence=(occurrences.get(norm(point.name))||0)+1;occurrences.set(norm(point.name),occurrence);
     const partId=sourceId('DEL',[spaceId,norm(point.name),occurrence]);
     if(!data.buildingParts.some(row=>row.id===partId))data.buildingParts.push({id:partId,spaceId,name:point.name});
     data.inspectionPoints.push({id:sourceId('BEP',[inspectionId,point.source.cell]),inspectionId,partId,assessment:point.assessment,comment:point.comment,lastAction:point.lastAction,sourcePlans:point.sourcePlans,sources:[point.source]});
     if(needsMaintenanceAction(point.assessment))linkMaintenanceIssue(data,data.inspectionPoints.at(-1).id);
     points++;
    }
   }
   imported++;
  }
 }
 if(!imported&&!unchanged)throw Error('Välj minst en flik och dess objekt.');
 return {imported,unchanged,points};
}

// Shared visual month planning for Planera and the one-page Ärende editor.
// Dates are the canonical plan: the same fields drive both visualizations.
export const MONTH_LABELS=["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
const validISO=value=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+"T00:00:00Z"));
const monthKey=(year,month)=>String(year)+"-"+String(month).padStart(2,"0");
const monthDays=(year,month)=>new Date(Date.UTC(year,month,0)).getUTCDate();

export function plannedMonthsForDisplay(activity,year,span=1){
  const first=Number(year),years=span===3?3:1;
  const result=new Set();
  const from=validISO(activity.startDate)?activity.startDate.slice(0,7):"";
  const to=validISO(activity.endDate)?activity.endDate.slice(0,7):"";
  if(from || to){
    const low=from || to,high=to || from;
    if(low<=high){
      for(let y=first;y<first+years;y++)
        for(let m=1;m<=12;m++){
          const key=monthKey(y,m);
          if(key>=low&&key<=high)result.add(key);
        }
    }
  }else{
    const yy=Number(activity.planningYear);
    const months=Array.isArray(activity.planningMonths)&&activity.planningMonths.length
      ? activity.planningMonths : activity.planningMonth ? [activity.planningMonth] : [];
    if(yy>=first && yy<first+years){
      if(months.length){
        for(const m of months){
          const numeric=Number(m);
          if(Number.isInteger(numeric)&&numeric>=1&&numeric<=12)
            result.add(monthKey(yy,numeric));
        }
      }else if(Number(activity.planningQuarter)>=1&&Number(activity.planningQuarter)<=4){
        for(let m=(Number(activity.planningQuarter)-1)*3+1;m<=Number(activity.planningQuarter)*3;m++)
          result.add(monthKey(yy,m));
      }
    }
  }
  return result;
}

export function planActivityPeriod(activity,startMonth,endMonth=startMonth){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) ||
     !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth))
    throw Error("Välj giltiga månader i tidslinjen.");
  const [first,last]=[startMonth,endMonth].sort();
  const [y,m]=last.split("-").map(Number);
  return {
    ...activity,
    startDate:first+"-01",
    endDate:last+"-"+String(monthDays(y,m)).padStart(2,"0"),
    planningYear:Number(first.slice(0,4)),
    // Dates now own the planning; old rough month/quarter values must not
    // contradict the selected range.
    planningMonths:[],
    planningMonth:null,
    planningQuarter:null,
  };
}

export function planningMonthHeader(year,span=1){
  const years=span===3?3:1;
  return Array.from({length:12*years},(_,i)=>{
    const y=Number(year)+Math.floor(i/12),m=i%12+1;
    return '<div class="timeline-month" title="'+monthKey(y,m)+'">'+
      (years===1?MONTH_LABELS[m-1]:m===1?String(y):"")+'</div>';
  }).join("");
}

export function planningMonthButtons(activity,year,span=1,context="plan"){
  const years=span===3?3:1;
  const selected=plannedMonthsForDisplay(activity,year,span);
  const keyName=context==="form"?"data-form-plan-month":"data-plan-month";
  const status=String(activity.status||"Planerad").toLocaleLowerCase("sv");
  const kind=/klar|slutförd|avslutad/.test(status)?"done":/pågår|pagar/.test(status)?"active":/beställ/.test(status)?"ordered":"planned";
  const months=Array.from({length:12*years},(_,i)=>monthKey(Number(year)+Math.floor(i/12),i%12+1));
  const buttons=months.map((key,i)=>{
    const active=selected.has(key);
    const previous=i>0&&selected.has(months[i-1]),next=i<months.length-1&&selected.has(months[i+1]);
    const classes=["timeline-month-button",active?"is-planned "+kind:"",active&&!previous?"period-start":"",active&&!next?"period-end":""].filter(Boolean).join(" ");
    const label=active?"Planerad månad":"Ej planerad";
    return '<button type="button" class="'+classes+'" '+keyName+'="'+key+'"'+
      (context==="plan"?' data-plan-issue="'+String(activity.id).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'"':"")+
      ' aria-label="'+key+' · '+label+' · välj start-/slutmånad" aria-pressed="'+active+'" title="'+key+' · '+label+'"></button>';
  }).join("");
  return buttons+(selected.size===0?'<span class="timeline-unscheduled">Ej tidsatt</span>':"");
}

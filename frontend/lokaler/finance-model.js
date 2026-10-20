// Canonical financial registers, shared by SQLite, Excel, import and forms.
const f=(key,label,type='text',extra={})=>({key,label,type,...extra});
export const itemTypes={base:'Bashyra',addition:'Tilläggshyra',heat:'Värme',water:'VA',electricity:'El',cooling:'Kyla',waste:'Sopor',tax:'Fastighetsskatt',other:'Övrigt'};
export const costCategories=Object.fromEntries(Object.entries(itemTypes).filter(([key])=>!['base','addition','tax'].includes(key)));
export const adjustmentMethods={none:'Ingen',kpi:'KPI',fixed:'Fast årlig procent','kpi-limited':'KPI med min/max'};
export const financeTables={
 agreement_items:{label:'Avtalsposter',singular:'Avtalspost',prefix:'POST',fields:[
  f('agreement_id','Avtal','ref',{table:'agreements',required:true}),f('type','Typ','select',{values:itemTypes,required:true}),f('name','Benämning','text',{required:true}),f('base_amount','Grundbelopp, kr/år','number',{required:true}),f('valid_from','Giltigt fr.o.m.','date'),f('valid_to','Giltigt t.o.m.','date'),f('adjustment_method','Uppräkningsmetod','select',{values:adjustmentMethods,default:'none'}),f('base_year','Basår','integer'),f('base_index','Bastal KPI','number'),f('index_share','Indexandel','number'),f('annual_percent','Årlig procent','signed'),f('min_percent','Minsta procent','signed'),f('max_percent','Högsta procent','signed'),f('limit_basis','Begränsningen avser','select',{values:{rent:'Hyresökningen',index:'KPI-förändringen'}}),f('series_base','KPI-seriens bas'),f('floor','Lägst grundbelopp','boolean',{default:true}),f('reconcilable','Framtida avräkning','boolean',{default:false}),f('reported_amount','Källans rapporterade årsbelopp, kr','number'),f('sources','Källspårning','json')
 ]},
 recurring_costs:{label:'Fastighetskostnader',singular:'Fastighetskostnad',prefix:'KOST',fields:[f('property_id','Fastighet','ref',{table:'properties',required:true}),f('category','Kategori','select',{values:costCategories,required:true}),f('name','Benämning','text',{required:true}),f('annual_amount','Budgeterat årsbelopp, kr','number',{required:true}),f('valid_from','Giltigt fr.o.m.','date'),f('valid_to','Giltigt t.o.m.','date'),f('invoice_complete_years','Kompletta fakturaår','json'),f('sources','Källspårning','json')]},
 cost_evidence:{label:'Kostnadsunderlag',singular:'Kostnadsunderlag',prefix:'UNDER',fields:[f('cost_id','Fastighetskostnad','ref',{table:'recurring_costs',required:true}),f('type','Underlagstyp','select',{values:{annual:'Årsutfall',invoice:'Faktura'},required:true}),f('year','År','integer'),f('amount','Belopp, kr','signed',{required:true}),f('selected','Använd årsutfallet','boolean',{default:true}),f('invoice_reference','Fakturareferens'),f('invoice_date','Fakturadatum','date'),f('valid_from','Kostnadsperiod fr.o.m.','date'),f('valid_to','Kostnadsperiod t.o.m.','date'),f('document_url','Dokumentlänk','url'),f('sources','Källspårning','json')]}
};
export const legacyFinanceFields={annual_rent:'Årshyra, kr',annual_additions:'Bastillägg, kr/år',annual_property_tax:'Fastighetsskatt, kr/år'};
export const legacyFinanceMap={annual_rent:'baseRent',annual_additions:'baseAdditions',annual_property_tax:'annualPropertyTax'};
for(const [prefix,label] of [['rent','Hyra'],['addition','Tillägg']])for(const [suffix,name] of [['base_year','basår'],['base_index','bastal KPI'],['index_percent','indexandel, %'],['adjustment_method','justeringsregel'],['annual_percent','årlig uppräkning, %'],['min_percent','minsta uppräkning, %'],['max_percent','högsta uppräkning, %'],['limit_basis','min/max gäller']]){
 legacyFinanceFields[prefix+'_'+suffix]=label+' '+name;
 legacyFinanceMap[prefix+'_'+suffix]=prefix+suffix.split('_').map(x=>x[0].toUpperCase()+x.slice(1)).join('');
}
export function validateFinance(data){
 const overlap=(a,b)=>(a.valid_from||'')<=(b.valid_to||'9999-12-31')&&(b.valid_from||'')<=(a.valid_to||'9999-12-31');
 const bases=new Map();
 for(const row of data.agreement_items||[]){
  if(row.type==='base'){const group=bases.get(row.agreement_id)||[];if(group.some(x=>overlap(x,row)))throw Error('Endast en bashyra får vara aktiv samtidigt per avtal.');group.push(row);bases.set(row.agreement_id,group);}
  const method=row.adjustment_method||'none';
  if(row.base_year!=null&&(row.base_year<1900||row.base_year>9998))throw Error('Uppräkning kräver ett giltigt basår.');
  if(['kpi','kpi-limited'].includes(method)&&row.index_share!=null&&!(row.index_share>=0&&row.index_share<=1))throw Error('Indexandel måste vara mellan 0 och 100 %.');
  if(method==='fixed'&&row.annual_percent!=null&&!(row.annual_percent>-100&&row.annual_percent<=1000))throw Error('Ange giltig årlig procent.');
  if(row.min_percent!=null&&row.max_percent!=null&&row.min_percent>row.max_percent)throw Error('Min får inte överstiga max.');
  for(const key of ['min_percent','max_percent'])if(row[key]!=null&&(row[key]<=-100||row[key]>1000))throw Error('Ogiltig procentgräns.');
 }
 const annual=new Set(),invoices=new Set();
 const costs=new Map((data.recurring_costs||[]).map(row=>[row.id,row]));
 for(const row of data.recurring_costs||[])for(const year of row.invoice_complete_years||[])if(!Number.isInteger(year)||year<1900||year>9999)throw Error('Ogiltigt komplett fakturaår.');
 for(const row of data.cost_evidence||[]){
  const cost=costs.get(row.cost_id);
  if(cost&&((row.type==='annual'&&((cost.valid_from&&row.year<Number(cost.valid_from.slice(0,4)))||(cost.valid_to&&row.year>Number(cost.valid_to.slice(0,4)))))||(row.type==='invoice'&&((cost.valid_from&&row.valid_from<cost.valid_from)||(cost.valid_to&&row.valid_to>cost.valid_to)))))throw Error('Underlaget ligger utanför kostnadens giltighetsperiod.');
  if(row.type==='annual'){
   if(!Number.isInteger(row.year)||row.year<1900||row.year>9999)throw Error('Årsutfall kräver ett giltigt år.');
   const key=JSON.stringify([row.cost_id,row.year]);if(annual.has(key))throw Error('Endast ett årsutfall per kostnad och år.');annual.add(key);
   if(row.invoice_reference||row.invoice_date||row.valid_from||row.valid_to)throw Error('Årsutfall ska inte innehålla fakturafält.');
  }else{
   if(!row.invoice_reference||!row.invoice_date||!row.valid_from||!row.valid_to)throw Error('Faktura kräver referens, datum och kostnadsperiod.');
   if(row.year!=null)throw Error('Faktura fördelas på kostnadsperioden, inte ett separat år.');
   const key=JSON.stringify([row.cost_id,row.invoice_reference]);if(invoices.has(key))throw Error('Fakturareferensen finns redan för kostnaden.');invoices.add(key);
  }
 }
}

export function createCleanEvaluator(workbook,base,context){
 let active=null;
 const cancel=()=>{if(!active)return;active.worker.terminate();active.reject(Object.assign(Error('Nyare kolumnval ersätter kontrollen.'),{name:'AbortError'}));active=null;};
 const evaluate=(profiles,draft)=>{
  cancel();
  return new Promise((resolve,reject)=>{
   const worker=new Worker(new URL('./import-worker.js',import.meta.url));
   const timer=setTimeout(()=>{finish();reject(Error('Kontrollen tog längre än 30 sekunder och avbröts. Dela underlaget i mindre filer. Inget har sparats.'));},30000);
   const finish=()=>{clearTimeout(timer);worker.terminate();if(active?.worker===worker)active=null;};
   active={worker,reject:error=>{clearTimeout(timer);reject(error);}};
   worker.onmessage=event=>{finish();event.data.error?reject(Error(event.data.error)):resolve(event.data.result);};
   worker.onerror=()=>{finish();reject(Error('Importkontrollen kunde inte startas. Försök igen.'));};
   worker.postMessage({workbook,profiles,base,context:{...context,preferences:draft.importFieldPreferences}});
  });
 };
 evaluate.cancel=cancel;return evaluate;
}

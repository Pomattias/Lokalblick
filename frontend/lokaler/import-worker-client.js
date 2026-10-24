// One worker receives the parsed workbook once. Field edits do not send/reparse it.
export function createCleanEvaluator(workbook,base,context){
 let worker=null,active=null,revision=0,identityCache={};
 const stop=error=>{worker?.terminate();worker=null;if(active){clearTimeout(active.timer);active.reject(error||Object.assign(Error('Nyare kolumnval ersätter kontrollen.'),{name:'AbortError'}));active=null;}};
 const evaluate=(profiles,draft)=>{
  if(active)stop();
  return new Promise((resolve,reject)=>{
   if(!worker){worker=new Worker(new URL('./import-worker.js',import.meta.url));worker.postMessage({type:'init',workbook,base,context:{...context,identityCache}});}
   const id=++revision,timer=setTimeout(()=>stop(Error('Kontrollen tog längre än 30 sekunder och avbröts. Dela underlaget i mindre filer. Inget har sparats.')),30000);
   active={id,timer,reject};
   worker.onmessage=event=>{if(event.data.id!==active?.id)return;clearTimeout(active.timer);active=null;if(event.data.identityCache)identityCache=event.data.identityCache;event.data.error?reject(Error(event.data.error)):resolve(event.data.result);};
   worker.onerror=()=>{clearTimeout(timer);active=null;worker?.terminate();worker=null;reject(Error('Importkontrollen kunde inte startas. Försök igen.'));};
   worker.postMessage({type:'evaluate',id,profiles,preferences:draft.importFieldPreferences,rowMatches:draft.importRowMatches});
  });
 };
 evaluate.baseline=structuredClone(base);evaluate.invalidate=()=>{if(active)stop();};evaluate.cancel=stop;return evaluate;
}

import {emptyData,validateData} from './model.js';
import {projectWorkspace,collectWorkspace} from './view-adapter.js';
import {BrowserExcel} from './excel-client.js';
import {normalizeWorkspace} from './workspace-data.js';
const marker='lokalblick-clean-active';
const database=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('lokalblick-clean-workspace',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function localState(value){
 const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('workspace',value?'readwrite':'readonly');const request=value?tx.objectStore('workspace').put(value,'current'):tx.objectStore('workspace').get('current');let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export function withCleanWorkspace(legacy){
 let clean=null,file=null,api=false,version=0;
 const service={mode:'clean-local',load:async()=>projectWorkspace(clean),save:async view=>persist(collectWorkspace(view,clean))};
 const activate=()=>{window.LokalblickDataService=service;};
 const stage=async data=>{await localState(file?{handle:file.handle}:{data});sessionStorage.setItem(marker,'1');};
 const request=async(url,body)=>{const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Kunde inte spara lokal databas.');return result;};
 const persist=async data=>{
  validateData(data,clean);
  if(api){const result=await request('/api/lokaler/workspace',{version,data});version=result.version;clean=result.data;}
  else if(file){const saved=await file.replace(data,file.version);clean=saved.data;await stage(clean).catch(()=>{});}
  else{await stage(data);clean=structuredClone(data);}
  activate();return projectWorkspace(clean);
 };
 return {...legacy,
  async startClean(){if(api)throw Error('Databasen är redan ansluten.');file=null;const next=emptyData();await stage(next);clean=next;activate();return projectWorkspace(clean);},
  cleanActive:()=>Boolean(clean),canonical:()=>structuredClone(clean||emptyData()),
  async cleanImport(result){const next=collectWorkspace(result.data,result.clean);if(!clean){await stage(next);clean=next;activate();return projectWorkspace(clean);}return persist(next);},
  async load(){
   if(legacy.company())return legacy.load();
   if(window.LokalblickRuntime?.cleanDatabase){api=true;const result=await request('/api/lokaler');clean=result.data;version=result.version;activate();return projectWorkspace(clean);}
   if(clean)return projectWorkspace(clean);
   if(globalThis.sessionStorage?.getItem(marker)==='1'){
    const stored=await localState();if(stored?.handle&&await stored.handle.queryPermission({mode:'readwrite'})==='granted'){file=new BrowserExcel(stored.handle);await file.reload();clean=file.data;activate();return projectWorkspace(clean);}if(stored?.data){clean=normalizeWorkspace(stored.data);activate();return projectWorkspace(clean);}
   }
   return legacy.load();
  },
  save:view=>clean?persist(collectWorkspace(view,clean)):legacy.save(view),
  status:()=>clean?{connected:Boolean(file||api),staged:!file&&!api,dirty:false,mode:api?'database':file?'readwrite':'clean-local',sourceKind:'clean',fileName:api?'Lokal databas':file?.handle.name||'Ren lokal arbetsyta'}:legacy.status(),
  async connect(){
   if(api)throw Error('Den lokala databasen är redan ansluten.');
   const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'Lokalblick-data',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
   // The primary-key header distinguishes the new workbook from existing workfiles.
   const bytes=await (await handle.getFile()).arrayBuffer();
   const book=window.XLSX.read(bytes,{type:'array',sheetRows:1});
   const sheet=book.Sheets.Fastigheter;
   if(sheet&&window.XLSX.utils.sheet_to_json(sheet,{header:1})[0]?.includes('FastighetsID')){
    const next=new BrowserExcel(handle);await next.reload();file=next;clean=next.data;await stage(clean);activate();return projectWorkspace(clean);
   }
   const loaded=await window.LokalblickSourceService.connectHandle(handle,'read',true);clean=null;file=null;globalThis.sessionStorage?.removeItem(marker);return loaded;
  },
  async create(view,blank=false){
   if(api)return projectWorkspace(clean);
   if(!clean&&!view.isDemo&&!blank)return legacy.create(view,blank);
   const nextData=blank||!clean?emptyData():collectWorkspace(view,clean);
   const next=await BrowserExcel.connect(true);await next.replace(nextData,next.version);file=next;clean=next.data;await stage(clean);activate();return projectWorkspace(clean);
  },
  async write(){if(!clean)return legacy.write();if(api)return projectWorkspace(clean);if(!file)throw Error('Välj Skapa Lokalblick-data för att spara arbetsytan i Excel.');return projectWorkspace(clean);},
  async refresh(){if(!clean)return legacy.refresh();if(api){const result=await request('/api/lokaler');version=result.version;clean=result.data;}else if(file){await file.reload();clean=file.data;await stage(clean);}return projectWorkspace(clean);},
  leaveClean(){clean=null;file=null;api=false;globalThis.sessionStorage?.removeItem(marker);}
 };
}

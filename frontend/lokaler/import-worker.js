// Conversion runs off the UI thread; parsed Excel and base data stay in this worker.
importScripts('./vendor/xlsx.full.min.js');
let input;
const model=import('./import-model.js');
self.onmessage=async event=>{
 if(event.data.type==='init'){input=event.data;return;}
 const {id,profiles,preferences,rowMatches}=event.data;
 try{const {prepareCleanImport}=await model;self.postMessage({id,result:prepareCleanImport(input.workbook,profiles,input.base,{...input.context,preferences,rowMatches},self.XLSX)});}catch(error){self.postMessage({id,error:error.message});}
};

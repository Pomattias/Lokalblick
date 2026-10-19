// Conversion runs off the UI thread; all libraries and data stay local.
importScripts('./vendor/xlsx.full.min.js');
self.onmessage = async event => {
 try {
  const {prepareCleanImport}=await import('./import-model.js');
  const {workbook,profiles,base,context}=event.data;
  self.postMessage({result:prepareCleanImport(workbook,profiles,base,context,self.XLSX)});
 }catch(error){self.postMessage({error:error.message});}
};

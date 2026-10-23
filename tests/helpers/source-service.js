import {readFileSync} from 'node:fs';

// Load the same ordered scripts as V2, including in isolated VM contexts.
// Tests still exercise the public source-service API and real XLSX roundtrips.
export function sourceServiceScript(){
 return ['source-workbook.js','source-service.js'].map(file=>
  readFileSync(new URL('../../frontend/services/'+file,import.meta.url),'utf8')
 ).join('\n');
}

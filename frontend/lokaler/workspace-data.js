import {tables,normalize,validateData} from './model.js';
import {workspaceKeys} from './view-fields.js';

// Storage accepts the current model only. External source columns are mapped
// by the import guide before they reach this boundary.
export function normalizeWorkspace(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ogiltig arbetsyta.');
 for(const key of Object.keys(input))if(key!=='workspace'&&!Object.hasOwn(tables,key))throw Error('Okänt register: '+key);
 const workspace=input.workspace||{};
 if(typeof workspace!=='object'||Array.isArray(workspace))throw Error('Ogiltig arbetsytemetadata.');
 for(const key of Object.keys(workspace))if(!workspaceKeys.includes(key))throw Error('Okänt arbetsytefält: '+key);
 const data={workspace:structuredClone(workspace)};
 for(const table of Object.keys(tables)){
  if(input[table]!=null&&!Array.isArray(input[table]))throw Error('Registret '+table+' måste vara en lista.');
  data[table]=(input[table]||[]).map(row=>normalize(table,structuredClone(row)));
 }
 validateData(data);
 return data;
}

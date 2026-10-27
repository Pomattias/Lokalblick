// Primary v3 launcher. Works in PowerShell, cmd, Bash, and other Node environments.
import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['backend/lokaler/server.mjs'],{
 cwd:process.cwd(),env:{...process.env,LOKALER_SCHEMA:'v3'},stdio:'inherit'
});
child.once('exit',(code,signal)=>{
 if(signal)process.exitCode=1;
 else process.exitCode=code??1;
});
child.once('error',error=>{console.error('Kunde inte starta Lokalblick v3:',error.message);process.exitCode=1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(!child.killed)child.kill(signal)});

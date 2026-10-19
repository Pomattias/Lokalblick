process.env.LOKALER_STORAGE = 'excel';
process.env.LOKALER_FILE ||= 'local-data/lokaler.xlsx';
const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, ['backend/lokaler/server.mjs'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

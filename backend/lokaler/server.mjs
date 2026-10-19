import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { LocalStore } from './store.js';
import { writeWorkbook } from './workbook.js';

export function createServer(store) {
 const root = fileURLToPath(new URL('../../frontend/lokaler/', import.meta.url));
 const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
 return http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  const address = req.socket.localAddress;
  const expectedHost = `127.0.0.1:${req.socket.localPort}`;
  const validHost = host === expectedHost || host === `localhost:${req.socket.localPort}`;
  const origin = req.headers.origin;
  const api = req.url?.startsWith('/api/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const json = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(payload)); };
  if (!validHost || !['127.0.0.1', '::ffff:127.0.0.1'].includes(address) || origin && origin !== `http://${host}` || api && req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Endast åtkomst från den lokala appen tillåts.' });
  try {
   const url = new URL(req.url, `http://${expectedHost}`);
   if (url.pathname === '/api/lokaler' && req.method === 'GET') return json(200, await store.readSnapshot());
   if (url.pathname === '/api/lokaler/workbook' && req.method === 'GET') {
    const bytes = await writeWorkbook((await store.readSnapshot()).data);
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="lokalblick-lokaler.xlsx"', 'Cache-Control': 'no-store' });
    return res.end(bytes);
   }
   if (url.pathname === '/api/lokaler/changes' && req.method === 'POST') {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(415, { error: 'Använd JSON för ändringar.' });
    const chunks = []; let size = 0;
    for await (const chunk of req) {
     size += chunk.length;
     if (size > 1024 * 1024) return json(413, { error: 'För stor ändring. Högst 1 MB per anrop.' });
     chunks.push(chunk);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { error: 'Ogiltig JSON.' }); }
    if (!input || typeof input !== 'object') return json(400, { error: 'Ogiltig ändring.' });
    return json(200, await store.mutate(input.operations, input.version));
   }
   if (api) return json(404, { error: 'Okänd API-adress.' });
   if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'Metoden stöds inte.' });
   const relative = decodeURIComponent(url.pathname).replace(/^\/(?:frontend\/)?lokaler\/?/, '').replace(/^\//, '') || 'index.html';
   const full = path.resolve(root, relative);
   if (!full.startsWith(root) || !mime[path.extname(full)]) return json(404, { error: 'Sidan saknas.' });
   const bytes = await readFile(full);
   res.writeHead(200, { 'Content-Type': mime[path.extname(full)], 'Cache-Control': 'no-cache' });
   res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
   if (error.code === 'ENOENT') return json(404, { error: 'Sidan saknas.' });
   json(error.status || 400, { error: error.message || 'Kunde inte slutföra ändringen.' });
  }
 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const mode = process.env.LOKALER_STORAGE || 'sqlite';
 const file = path.resolve(process.env.LOKALER_FILE || `local-data/lokaler.${mode === 'excel' ? 'xlsx' : 'sqlite'}`);
 const port = Number(process.env.LOKALER_PORT || 8790);
 let store;
 try {
  store = await LocalStore.open({ mode, file });
  const server = createServer(store);
  server.on('error', async error => { console.error('Kunde inte starta:', error.message); await store.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Lokalblick Lokaler: http://127.0.0.1:${server.address().port}\nLokal lagring: ${mode} · ${file}`));
  let closing = false;
  const close = () => { if (closing) return; closing = true; server.close(async () => { await store.close(); }); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
 } catch (error) { console.error('Kunde inte öppna lagringen:', error.message); process.exitCode = 1; }
}

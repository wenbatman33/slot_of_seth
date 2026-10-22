#!/usr/bin/env node
// 建置版本機預覽：node tools/serve.mjs [port] [目錄]（預設 8765、build/web-mobile）
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
const port = Number(process.argv[2] || 8765);
const root = path.resolve(process.argv[3] || 'build/web-mobile');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.cconb': 'application/octet-stream',
  '.bin': 'application/octet-stream', '.atlas': 'text/plain', '.fnt': 'text/plain', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const st = statSync(f);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    createReadStream(f).pipe(res);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, '0.0.0.0', 1024, () => console.log(`serving ${root} on http://127.0.0.1:${port}`));

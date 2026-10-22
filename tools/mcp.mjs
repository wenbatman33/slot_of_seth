#!/usr/bin/env node
/**
 * cocos-mcp-server 命令列客戶端（JSON-RPC over HTTP）
 *   node tools/mcp.mjs health
 *   node tools/mcp.mjs list                       # 列出工具
 *   node tools/mcp.mjs call <tool> '<json 參數>'  # 呼叫工具
 *   node tools/mcp.mjs batch steps.json            # 依序呼叫多個 {tool, args}，可用 $ref 帶入前一步結果
 * 環境變數 MCP_URL 可覆寫端點（預設 http://127.0.0.1:3000）
 */
import { readFileSync } from 'node:fs';
const BASE = process.env.MCP_URL || 'http://127.0.0.1:3000';
let id = 1;

async function rpc(method, params) {
  const r = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function unwrap(res) {
  // MCP 回傳 content[{type:'text',text:'...json...'}]
  const c = res?.result?.content?.[0]?.text;
  if (c) { try { return JSON.parse(c); } catch { return c; } }
  return res?.error || res?.result || res;
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'health') {
  const r = await fetch(BASE + '/health').then((x) => x.text()).catch((e) => 'DOWN ' + e.message);
  console.log(r);
} else if (cmd === 'list') {
  const res = await rpc('tools/list', {});
  for (const t of res?.result?.tools || []) console.log(`${t.name}  —  ${(t.description || '').slice(0, 90)}`);
} else if (cmd === 'schema') {
  const res = await rpc('tools/list', {});
  const t = (res?.result?.tools || []).find((x) => x.name === a1);
  console.log(JSON.stringify(t?.inputSchema, null, 2));
} else if (cmd === 'call') {
  const res = await rpc('tools/call', { name: a1, arguments: a2 ? JSON.parse(a2) : {} });
  console.log(JSON.stringify(unwrap(res), null, 2));
} else if (cmd === 'batch') {
  const steps = JSON.parse(readFileSync(a1, 'utf8'));
  const out = {};
  for (const s of steps) {
    let args = JSON.stringify(s.args || {});
    args = args.replace(/"\$ref:([\w.]+)"/g, (_, p) => JSON.stringify(p.split('.').reduce((o, k) => o?.[k], out)));
    const res = unwrap(await rpc('tools/call', { name: s.tool, arguments: JSON.parse(args) }));
    if (s.save) out[s.save] = res;
    console.log(`▶ ${s.tool} ${s.args?.action || ''} →`, JSON.stringify(res).slice(0, 300));
  }
} else {
  console.log('用法：health | list | schema <tool> | call <tool> <json> | batch <file>');
}

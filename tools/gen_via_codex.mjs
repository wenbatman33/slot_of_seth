#!/usr/bin/env node
/**
 * 戰神賽特2 美術批次生圖（透過 codex exec 內建 image_gen）
 *
 * 用法：
 *   node tools/gen_via_codex.mjs                    # 全跑（已存在的跳過）
 *   node tools/gen_via_codex.mjs --only char_seth   # 只跑指定 id（可多個）
 *   node tools/gen_via_codex.mjs --workers 2        # 同時跑幾個 codex（預設 2）
 *   node tools/gen_via_codex.mjs --force --only x   # 覆蓋重產
 *
 * 依賴：item.ref 裡若引用 art_src/raw/ 的圖，要等那張產好才會開始。
 * 任何結束路徑（完成、逾時、例外、Ctrl+C）都會殺掉 codex 子程序群組。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "art_src/raw");
const LOG = path.join(ROOT, "tools/gen.log");
const TIMEOUT_MS = 8 * 60 * 1000;
// 你 ~/.codex/config.toml 的預設 gpt-5.5 已不支援 ChatGPT 帳號，這裡明確指定
const MODEL = process.env.CODEX_MODEL || "gpt-6.1-sol";

const manifest = JSON.parse(readFileSync(path.join(ROOT, "tools/asset_manifest.json"), "utf-8"));
const args = process.argv.slice(2);
const only = new Set();
let workers = 2;
let force = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--only") { while (args[i + 1] && !args[i + 1].startsWith("--")) only.add(args[++i]); }
  else if (args[i] === "--workers") workers = Math.max(1, Math.min(3, parseInt(args[++i], 10) || 2));
  else if (args[i] === "--force") force = true;
}

mkdirSync(RAW, { recursive: true });
const log = (m) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(line); appendFileSync(LOG, line + "\n"); };

const outOf = (it) => path.join(RAW, `${it.id}.png`);
const pending = manifest.items.filter((it) => (!only.size || only.has(it.id)) && (force || !existsSync(outOf(it))));
const running = new Set(); // 正在跑的子程序（用來保證清理）

function killAll() {
  for (const cp of running) { try { process.kill(-cp.pid, "SIGKILL"); } catch {} }
  running.clear();
}
process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { log(`收到 ${sig}，清理子程序`); killAll(); process.exit(1); });
process.on("uncaughtException", (e) => { log(`例外：${e.message}`); killAll(); process.exit(1); });
process.on("unhandledRejection", (e) => { log(`未處理 rejection：${e}`); killAll(); process.exit(1); });

function buildPrompt(it) {
  const [w, h] = it.size.split("x").map(Number);
  const refs = (it.ref || []).map((r) => path.join(ROOT, r));
  const styleOnly = refs.length && (it.ref || []).every((r) => r.startsWith("art_src/ref/"));
  const refNote = styleOnly
    ? "附加的截圖只是風格與品質參考（渲染方式、配色、細節程度），請做原創設計，不要複製截圖中的角色或物件。"
    : "";
  return [
    "請用你內建的 image_gen 工具產生一張圖片（只要一張）。",
    `整體美術風格：${manifest.style}`,
    `本張內容：${it.prompt}`,
    refNote,
    `完成後把產出的 PNG 複製到絕對路徑 ${outOf(it)}，再執行 sips -z ${h} ${w} 把它調整成 ${w}x${h}。`,
    "不要建立或修改其他任何檔案。完成後只回報 OK。",
  ].filter(Boolean).join("\n\n");
}

function runOne(it) {
  return new Promise((resolve) => {
    const refs = (it.ref || []).map((r) => path.join(ROOT, r));
    const argv = ["exec", "--skip-git-repo-check", "-m", MODEL, "-s", "workspace-write", "-C", ROOT];
    for (const r of refs) argv.push("--image", r);
    const cp = spawn("codex", argv, { cwd: ROOT, detached: true, stdio: ["pipe", "ignore", "ignore"] });
    running.add(cp);
    cp.stdin.end(buildPrompt(it));
    const timer = setTimeout(() => { log(`⏱  ${it.id} 逾時，終止`); try { process.kill(-cp.pid, "SIGKILL"); } catch {} }, TIMEOUT_MS);
    cp.on("exit", (code) => { clearTimeout(timer); running.delete(cp); resolve(code); });
    cp.on("error", (e) => { clearTimeout(timer); running.delete(cp); log(`✗ ${it.id} spawn 失敗 ${e.message}`); resolve(-1); });
  });
}

const refsReady = (it) => (it.ref || []).every((r) => existsSync(path.join(ROOT, r)));
let ok = 0, fail = 0;
const total = pending.length;
log(`=== 開始 ${total} 張，workers=${workers} ===`);

async function worker(wid) {
  for (;;) {
    const idx = pending.findIndex(refsReady);
    if (idx === -1) {
      if (!pending.length) return;
      if (running.size === 0) { // 沒有人在跑又沒有可跑的 → 依賴缺失
        for (const it of pending.splice(0)) { log(`✗ ${it.id} 缺參考圖 ${it.ref}`); fail++; }
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const it = pending.splice(idx, 1)[0];
    const t0 = Date.now();
    log(`▶ w${wid} ${it.id} (${it.size})`);
    await runOne(it);
    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    if (existsSync(outOf(it))) { ok++; log(`✓ ${it.id} ${dt}s  [${ok + fail}/${total}]`); }
    else { fail++; log(`✗ ${it.id} ${dt}s 沒有產出檔案  [${ok + fail}/${total}]`); }
  }
}

await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
log(`=== 完成 ok=${ok} fail=${fail} ===`);

#!/bin/bash
# 建置網頁版（web-mobile）＋建置後處理：
#   1. 關閉 Cocos 預設啟動畫面（settings.json 的 splashScreen.totalTime 設 0，引擎會直接略過）
# 用法：bash tools/build_web.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CC=/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
LOG="$ROOT/temp/build_web.log"
mkdir -p "$ROOT/temp"
"$CC" --project "$ROOT" --build "configPath=$ROOT/tools/buildConfig_web-mobile.json" > "$LOG" 2>&1 || true
if ! grep -q "build Task (web-mobile) Finished" "$LOG"; then
  echo "建置失敗，請看 $LOG"; exit 1
fi
node - "$ROOT/build/web-mobile/src" <<'JS'
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => /^settings.*\.json$/.test(x))) {
  const p = path.join(dir, f);
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (s.splashScreen) { s.splashScreen.totalTime = 0; s.splashScreen.logo = { type: 'none' }; }
  fs.writeFileSync(p, JSON.stringify(s));
  console.log('已關閉 Cocos 啟動畫面：' + f);
}
JS
# 角落版本號：日期時間 + git 短雜湊（有未提交修改時加 *）
VER="$(date +%m%d-%H%M) $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"
[ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ] && VER="$VER*"
sed -i '' "s|__SETH2_BUILD__|$VER|" "$ROOT/build/web-mobile/index.html"
echo "建置完成（$VER）：$ROOT/build/web-mobile"

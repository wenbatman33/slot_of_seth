#!/bin/bash
# 把 build/web-mobile 發佈到 main 的 play/ 資料夾（GitHub Pages 從 main 根目錄發佈）
#   線上網址：https://wenbatman33.github.io/slot_of_seth/  → 根目錄 index.html 導向 play/
# 用法：bash tools/build_web.sh && bash tools/publish_pages.sh，再自行 commit / push
#
# 每次建置的檔名都有雜湊，舊檔要先移除：只用 git rm 移除「已被 git 追蹤」的 play/ 檔案，
# 舊版仍保留在 git 歷史裡，可隨時找回；不會動到 play/ 以外的任何檔案。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/web-mobile"
DST="$ROOT/play"
[ -f "$SRC/index.html" ] || { echo "找不到 $SRC/index.html，請先執行 bash tools/build_web.sh"; exit 1; }
if git -C "$ROOT" ls-files --error-unmatch play >/dev/null 2>&1; then
  git -C "$ROOT" rm -r -q play
fi
mkdir -p "$DST"
cp -R "$SRC/." "$DST/"
# Pages 預設用 Jekyll，會略過 _ 開頭的檔案（Cocos 引擎有 _virtual_cc-*.js），一定要關掉
touch "$ROOT/.nojekyll"
echo "已發佈到 $DST（$(grep -o 'seth2Ver">[^<]*' "$DST/index.html" | sed 's/.*">//')）"

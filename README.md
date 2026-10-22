# 戰神賽特2・覺醒之力（Cocos Creator 3.8.8 復刻版）

參考影片：<https://www.youtube.com/watch?v=rVht0Qszrjs>（ATG 戰神賽特2 覺醒之力）
美術全部 AI 原創（codex image_gen），角色用 **Spine 3.8 骨骼動畫**（程式產生骨架、網格蒙皮與動畫）。

## 玩法（tools/sim.ts 模擬 30 萬轉：RTP ≈ 96.5%，中獎率 35%，約 390 轉進一次免費遊戲）
- 6 軸 × 5 列，盤面任意位置 8 個以上相同符號即中獎，中獎消除後上方落下補位
- **倍數球**：由賽特（藍火）或女祭司（紫焰）施法打進盤面；主遊戲有贏分時倍數加總相乘，免費遊戲累加總倍數
- 4 個以上 SCATTER → 15 次免費遊戲；免費遊戲中 3 個以上 SCATTER → **覺醒之力**（賽特全螢幕特寫，+5 次、法老百搭、金色太陽倍數球）
- 大獎分級 BIG → SUPER → MEGA → LEGENDARY、四級 Jackpot、購買免費遊戲（110 倍押注）
- 電腦（橫式）與手機（直式）兩套版面自動切換

## 角色動作（依影片逐格分析）
| 狀態 | 賽特（左） | 女祭司（右） |
|---|---|---|
| 待機 | 外側手舉在頭旁托藍火、內側手下垂；火焰跳動、呼吸、披風擺動 | 外側手托紫焰、內側手叉腰；S 曲線微擺、髮絲與披紗擺動 |
| 施法（倍數球出現時） | 全身泛藍光 → 手舉過頭蓄力 → 往外下方甩出 → 收回、火焰重燃，同時發射藍色能量球打進盤面 | 全身泛粉紫光 → 高舉過頭後仰 → 朝盤面揮出 → 收回，發射紫色魔法 |
| 覺醒 | 全螢幕特寫：雙臂由下舉起展力、雙眼發光、雷電環繞 | — |

## 目錄
```
assets/
  scenes/            Main.scene（由 cocos-mcp-server 建立）
  scripts/
    Main.ts          主控：版面、流程、狀態、DEV 介面
    core/SlotEngine.ts  純邏輯數學引擎（不依賴 cc，可用 node 模擬）
    layout/Layouts.ts   PC / MOBILE 版面數值（DEV 工具匯出後貼回這裡）
    view/            盤面、角色、HUD、演出、粒子、音效
    dev/DevTool.ts   DEV 開發者微調工具
  resources/
    art/  fx/  font/  spine/{seth,goddess,seth_awaken}/
extensions/cocos-mcp-server/   MCP 外掛（已 npm install + build，設定為自動啟動 port 3000）
tools/               美術與骨架產生工具（不會被 Cocos 打包）
art_src/             AI 原圖、去背圖、骨架預覽
```

## 開啟專案
```bash
git clone --recursive https://github.com/wenbatman33/slot_of_seth.git
cd slot_of_seth/extensions/cocos-mcp-server && npm install && npm run build
```
1. 用 Cocos Dashboard 或官網安裝 **Cocos Creator 3.8.8**（MCP 外掛需要 3.8.6 以上），開啟這個資料夾
2. 開啟後 MCP 伺服器會自動在 `http://127.0.0.1:3000/mcp` 啟動（設定：`settings/mcp-server.json`）；選單「擴充功能 → Cocos MCP Server」可看狀態
3. 建置網頁版：`bash tools/build_web.sh`（會自動關掉 Cocos 預設啟動畫面，改用 `build-templates/web-mobile/` 的遊戲載入畫面），本機試玩：`node tools/serve.mjs 8765`

## 線上試玩（GitHub Pages）
**https://wenbatman33.github.io/slot_of_seth/**（手機、電腦都可以玩）

Pages 從 `main` 根目錄發佈：根目錄 `index.html` 導向 `play/`，`play/` 是建置好的網頁版，`.nojekyll` 讓 Pages 不略過 `_` 開頭的引擎檔。更新線上版：
```bash
bash tools/build_web.sh && bash tools/publish_pages.sh
git add -A && git commit -m "更新線上版" && git push
```

`extensions/cocos-mcp-server` 是 [DaxianLee/cocos-mcp-server](https://github.com/DaxianLee/cocos-mcp-server) 的 git submodule。
`art_src/ref/`（參考影片截圖）與各種檢查截圖不放進版控。

## DEV 微調工具
遊戲中按 **D** 或右下角 ⚙：直接拖曳元件、滾輪縮放、Shift+滾輪旋轉；面板可調 x/y/縮放/旋轉/透明度/字級/顏色、切換 PC/MOBILE、觸發大獎/免費遊戲/覺醒/轉場等狀態。按「💾 匯出 JSON」後把內容交給 Claude 說「我調好了，鎖定」即可寫回 `Layouts.ts`。

## 常用工具指令
```bash
node tools/gen_via_codex.mjs --only char_seth2          # 重產指定美術（codex image_gen）
tools/.venv/bin/python tools/process_art.py             # 去背、裁切、輸出遊戲尺寸
tools/.venv/bin/python tools/spine_rig.py seth --debug  # 產生 Spine 骨架（seth / goddess / seth_awaken）
tools/.venv/bin/python tools/spine_preview.py seth cast 0,0.5,0.7   # 用 spine-ts 3.8 實際播放截圖
node --experimental-strip-types tools/sim.ts 300000     # RTP 模擬
node tools/mcp.mjs list                                 # 呼叫 cocos-mcp-server
```

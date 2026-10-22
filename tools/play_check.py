#!/usr/bin/env python3
"""
遊戲實機檢查（無頭 Chrome，同時只開一個瀏覽器，任何結束路徑都會關閉）
用法：tools/.venv/bin/python tools/play_check.py <url> <pc|mobile> <輸出前綴> [動作...]
動作：wait:秒 | shot:名稱 | key:Space | click:x,y（CSS 像素） | js:程式碼
"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
from browser_lock import browser_lock

ROOT = Path(__file__).resolve().parent.parent
url, mode, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
acts = sys.argv[4:]
# iphone：iPhone Safari 扣掉網址列與工具列後的實際可視區（使用者回報的尺寸）
vp = {"pc": dict(width=1600, height=900), "mobile": dict(width=390, height=844), "landphone": dict(width=844, height=390),
      "iphone": dict(width=430, height=764), "iphonese": dict(width=375, height=553), "android": dict(width=412, height=780)}[mode]
out = ROOT / "art_src/playtest"
out.mkdir(parents=True, exist_ok=True)
logs = []
_lock = browser_lock()
_lock.__enter__()
pw = sync_playwright().start()
browser = None
try:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
    ctx = browser.new_context(viewport=vp, device_scale_factor=2 if mode != "pc" else 1, is_mobile=mode != "pc", has_touch=mode != "pc")
    page = ctx.new_page()
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.on("requestfailed", lambda r: logs.append(f"[reqfail] {r.url} {r.failure}"))
    page.on("response", lambda r: logs.append(f"[http{r.status}] {r.url}") if r.status >= 400 else None)
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    page.goto(url, timeout=60000)
    for a in acts:
        k, _, v = a.partition(":")
        if k == "wait":
            page.wait_for_timeout(float(v) * 1000)
        elif k == "shot":
            page.screenshot(path=str(out / f"{prefix}_{v}.png"))
            print("shot", out / f"{prefix}_{v}.png")
        elif k == "key":
            page.keyboard.press(v)
        elif k == "click":
            x, y = map(float, v.split(","))
            page.mouse.click(x, y)
        elif k == "ready":  # 等遊戲載入完成（最多 v 秒）
            page.wait_for_function("window.__seth2 && window.__seth2.ready && !document.getElementById('seth2Loading')", timeout=float(v or 40) * 1000)
        elif k == "js":
            print("js →", page.evaluate(v))
finally:
    if browser:
        browser.close()
    pw.stop()
    _lock.__exit__(None, None, None)
errs = [l for l in logs if l.startswith(("[error]", "[pageerror]", "[reqfail]", "[http")) or "warn" in l[:8]]
print(f"console: {len(logs)} 行，錯誤/警告 {len(errs)}")
for l in (logs if "--all" in sys.argv else errs)[:40]:
    print("  ", l[:400])
for l in logs:
    if "404" in l or "Failed" in l: pass

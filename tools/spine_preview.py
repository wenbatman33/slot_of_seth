#!/usr/bin/env python3
"""
Spine 動畫無頭預覽：用 spine-ts 3.8 實際播放並截取多個時間點，拼成一張總覽圖。
用法：tools/.venv/bin/python tools/spine_preview.py seth idle 0,1,2,3
輸出：art_src/preview/<name>_<anim>.png
注意：同時只開一個瀏覽器；任何結束路徑都會關閉瀏覽器與 HTTP 伺服器。
"""
import sys, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from PIL import Image
import io

ROOT = Path(__file__).resolve().parent.parent


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    name, anim = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "idle"
    times = [float(t) for t in (sys.argv[3] if len(sys.argv) > 3 else "0,1,2,3").split(",")]
    big = "--big" in sys.argv
    vw, vh = (1000, 1400) if big else (520, 720)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    port = srv.server_address[1]
    from playwright.sync_api import sync_playwright
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from browser_lock import browser_lock
    _lock = browser_lock()
    _lock.__enter__()
    shots = []
    pw = sync_playwright().start()
    browser = None
    try:
        browser = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": vw, "height": vh})
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.goto(f"http://127.0.0.1:{port}/tools/preview/spine.html?name={name}&anim={anim}&w={vw}&h={vh}", timeout=30000)
        page.wait_for_function("window.ready || window.err", timeout=30000)
        err = page.evaluate("window.err")
        if err:
            raise SystemExit(f"spine 載入失敗：{err}")
        for t in times:
            page.evaluate(f"setT({t})")
            page.wait_for_timeout(250)
            shots.append(Image.open(io.BytesIO(page.screenshot())))
        if errs:
            print("console errors:", errs[:5])
    finally:
        if browser:
            browser.close()
        pw.stop()
        srv.shutdown()
        _lock.__exit__(None, None, None)
    out = ROOT / "art_src/preview"
    out.mkdir(parents=True, exist_ok=True)
    w, h = shots[0].size
    sheet = Image.new("RGB", (w * len(shots), h))
    for i, im in enumerate(shots):
        sheet.paste(im.convert("RGB"), (i * w, 0))
    p = out / f"{name}_{anim}{'_big' if big else ''}.png"
    sheet.save(p)
    print(p)


if __name__ == "__main__":
    main()

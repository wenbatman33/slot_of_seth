#!/usr/bin/env python3
"""把盤框柱身中段複製插入，延長框高，讓內框比例符合 6x5 盤面（避免直接拉伸變形）"""
from pathlib import Path
import numpy as np
from PIL import Image
import json, sys
sys.path.insert(0, str(Path(__file__).parent))
from process_art import write_frame_meta, OUT

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / "art_src/keyed/ui_frame.png").convert("RGBA")
if src.width != 1536:
    src = src.resize((1536, round(src.height * 1536 / src.width)), Image.LANCZOS)
a = np.asarray(src)
W, H = src.size
TARGET = (6 * 172 + 26) / (5 * 150 + 26)          # 盤面加邊界的寬高比
# 量目前開口
alpha = a[..., 3] < 40
def run(arr, c):
    """從 c 往兩邊找連續 True 的範圍"""
    l = c
    while l > 0 and arr[l - 1]:
        l -= 1
    r = c
    while r < len(arr) - 1 and arr[r + 1]:
        r += 1
    return l, r


x0, x1 = run(alpha[H // 2], W // 2)
y0, y1 = run(alpha[:, W // 2], H // 2)
iw, ih = x1 - x0, y1 - y0
need = int(round(iw / TARGET - ih))
print("opening", iw, ih, "need +", need)
# 從柱身中段取一段重複插入（分兩次插，接縫比較分散）
cut1 = y0 + int(ih * 0.30)
cut2 = y0 + int(ih * 0.62)
n1 = need // 2
n2 = need - n1
band1 = a[cut1 - n1:cut1]
band2 = a[cut2 - n2:cut2]
out = np.concatenate([a[:cut1], band1, a[cut1:cut2], band2, a[cut2:]], axis=0)
img = Image.fromarray(out, "RGBA")
img.save(ROOT / "art_src/keyed/ui_frame_tall.png")
img.save(OUT / "ui_frame.png", optimize=True)
write_frame_meta(img)
print("frame", img.size)

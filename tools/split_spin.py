#!/usr/bin/env python3
"""把 SPIN 按鈕拆成固定金框（ui_spin_rim）與可旋轉中心（ui_spin_core），讓只有箭頭轉動"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / "art_src/keyed/ui_spin.png").convert("RGBA")
n = max(src.size)
sq = Image.new("RGBA", (n, n), (0, 0, 0, 0))
sq.paste(src, ((n - src.width) // 2, (n - src.height) // 2))
a = np.asarray(sq).astype(np.float32)
cy = cx = n / 2
# 沿 72 個方向「由外往內」找第一個紫色像素（中心漩渦），取中位數當金框內緣半徑（箭頭也是金色，不能由內往外找）
r_in = []
for ang in np.linspace(0, 2 * np.pi, 72, endpoint=False):
    for r in range(int(n * 0.49), int(n * 0.2), -1):
        x, y = int(cx + r * np.cos(ang)), int(cy + r * np.sin(ang))
        R, G, B, A = a[y, x]
        if A > 200 and B > 110 and B > R * 0.95 and G < B * 0.7:
            r_in.append(r)
            break
rin = float(np.median(r_in)) + 3
print("金框內緣半徑", rin, "／外徑", n / 2)
yy, xx = np.mgrid[0:n, 0:n]
d = np.sqrt((xx - cx + 0.5) ** 2 + (yy - cy + 0.5) ** 2)
feather = 4.0
inset = 22.0  # 金框上下兩顆寶石的尖端會伸進內圈，中心圓縮小一點避免寶石被轉走
core_a = np.clip((rin - inset + feather - d) / (2 * feather), 0, 1)       # 會旋轉的中心圓
rim_a = np.clip((d - (rin - inset - feather)) / (2 * feather), 0, 1)      # 固定金框（含最內圈一點紫邊，蓋住交界）
core = a.copy(); core[..., 3] *= core_a
rim = a.copy(); rim[..., 3] *= rim_a
out = ROOT / "assets/resources/art"
for name, arr in (("ui_spin_core", core), ("ui_spin_rim", rim)):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA").resize((320, 320), Image.LANCZOS)
    im.save(out / f"{name}.png", optimize=True)
    print("  ✓", name)

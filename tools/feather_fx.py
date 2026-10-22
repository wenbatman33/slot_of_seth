#!/usr/bin/env python3
"""
轉場火焰／紫焰、閃電貼圖四邊羽化（QA P1-16、P1-17）：
貼圖邊緣原本不透明，平移旋轉時會露出矩形硬邊。從 art_src/keyed 原圖重新輸出，可重複執行不會疊加。
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
KEYED = ROOT / "art_src/keyed"
OUT = ROOT / "assets/resources/art"


def feather(img, frac=0.18, pad=0):
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    h, w = a.shape[:2]
    fx, fy = max(1, int(w * frac)), max(1, int(h * frac))
    rx = np.clip(np.minimum(np.arange(w), w - 1 - np.arange(w)) / fx, 0, 1)
    ry = np.clip(np.minimum(np.arange(h), h - 1 - np.arange(h)) / fy, 0, 1)
    m = np.outer(ry, rx)
    m = m * m * (3 - 2 * m)  # smoothstep，邊緣過渡更柔
    a[..., 3] *= m
    out = Image.fromarray(a.astype(np.uint8), "RGBA")
    if pad:  # 外圍再加一圈全透明，避免 atlas 取樣到鄰邊
        p = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
        p.paste(out, (pad, pad))
        out = p
    return out


def fit(img, n):
    s = n / max(img.size)
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


for name, size, frac in (("fx_fire_wave", 1536, 0.2), ("fx_purple_wave", 1536, 0.2), ("fx_lightning", 512, 0.12)):
    f = feather(Image.open(KEYED / f"{name}.png"), frac, pad=12)
    fit(f, size).save(OUT / f"{name}.png", optimize=True)
    print("  ✓", name)
# 給 Spine 覺醒特寫用的柔邊閃電
feather(Image.open(KEYED / "fx_lightning.png"), 0.12, pad=12).save(ROOT / "art_src/fx/fx_lightning_soft.png")
print("  ✓ art_src/fx/fx_lightning_soft.png")

#!/usr/bin/env python3
"""
把 art_src/raw/ 的 AI 原圖處理成遊戲用素材：
  - green / magenta 綠幕：色鍵去背 + 去溢色 + 裁邊
  - black：加色混合用特效，alpha = 亮度（反預乘），可在 Cocos 用 additive
  - none：背景圖，只縮放
輸出：
  art_src/keyed/<id>.png            全解析度去背版（給 Spine 拆骨架用）
  assets/resources/art/<id>.png     遊戲用尺寸

用法：tools/.venv/bin/python tools/process_art.py [id ...]
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art_src/raw"
KEYED = ROOT / "art_src/keyed"
OUT = ROOT / "assets/resources/art"

# 遊戲內輸出尺寸（長邊），None = 不縮
GAME_SIZE = {
    "sym_": 256, "orb_": 256, "ui_mult_ring": 256, "ui_spin": 320, "ui_coin": 128,
    "title_": 1024, "fx_flame": 256, "fx_burst": 256, "fx_lightning": 512,
    "fx_fire_wave": 1536, "fx_purple_wave": 1536, "bg_": None, "ui_frame": 1536,
    "char_": "skip", "seth_awaken": "skip",   # 角色只進 Spine atlas，不單獨輸出
}


def game_size(item_id):
    for k, v in GAME_SIZE.items():
        if item_id.startswith(k):
            return v
    return None


def chroma_key(img, key):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if key == "green":
        d = g - np.maximum(r, b)          # 綠色主導程度
    else:
        d = np.minimum(r, b) - g          # 品紅主導程度
    # d 越大越像背景；20 以下完全保留，110 以上完全透明
    alpha = np.clip(1.0 - (d - 20.0) / 90.0, 0.0, 1.0)
    # 去溢色：把主導通道壓回其他通道的上限
    out = a.copy()
    if key == "green":
        lim = np.maximum(r, b)
        out[..., 1] = np.where(g > lim, lim + (g - lim) * 0.15, g)
    else:
        spill = np.clip(np.minimum(r, b) - g, 0, None)
        out[..., 0] = r - spill * 0.85
        out[..., 2] = b - spill * 0.85
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255.0]).astype(np.uint8)
    # 清掉孤立雜點：alpha 很低的直接歸零
    rgba[..., 3][rgba[..., 3] < 10] = 0
    return Image.fromarray(rgba, "RGBA")


def black_key(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    lum = a.max(axis=2)
    alpha = np.clip((lum - 6.0) / 249.0, 0, 1)
    rgb = np.where(alpha[..., None] > 0, a / np.maximum(alpha[..., None], 1e-3), 0)
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def trim(img, pad=4):
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((l, t, r, b))


def fit_long(img, n):
    if not n:
        return img
    s = n / max(img.size)
    if abs(s - 1) < 1e-3:
        return img
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)


def write_frame_meta(img):
    """量測盤框中間的透明開口（從中心往外找透明連通區），寫成 frame_meta.json 給遊戲對位"""
    from scipy import ndimage
    a = np.asarray(img.getchannel("A")) < 40
    lab, _ = ndimage.label(a)
    h, w = a.shape
    cy, cx = h // 2, w // 2
    target = lab[cy, cx]
    if target == 0:  # 中心不透明時往下找
        for dy in range(0, h // 2, 4):
            if lab[cy + dy, cx]:
                target = lab[cy + dy, cx]
                break
    ys, xs = np.nonzero(lab == target)
    # 用 5%/95% 分位數，避免開口邊緣的鋸齒或缺口影響
    x0, x1 = np.percentile(xs, 0.3), np.percentile(xs, 99.7)
    y0, y1 = np.percentile(ys, 0.3), np.percentile(ys, 99.7)
    meta = {"w": w, "h": h, "innerCx": float((x0 + x1) / 2), "innerCy": float((y0 + y1) / 2),
            "innerW": float(x1 - x0), "innerH": float(y1 - y0)}
    (OUT / "frame_meta.json").write_text(json.dumps(meta))
    print("    frame_meta", meta)


def main():
    manifest = json.loads((ROOT / "tools/asset_manifest.json").read_text())
    only = set(sys.argv[1:])
    KEYED.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for it in manifest["items"]:
        iid, key = it["id"], it["key"]
        if only and iid not in only:
            continue
        src = RAW / f"{iid}.png"
        if not src.exists():
            print(f"  - {iid}: 尚未生成")
            continue
        img = Image.open(src)
        if key in ("green", "magenta"):
            k = trim(chroma_key(img, key))
        elif key == "black":
            k = black_key(img)
        else:
            k = img.convert("RGB")
        k.save(KEYED / f"{iid}.png")
        if game_size(iid) == "skip":
            print(f"  ✓ {iid}: keyed {k.size}（只給 Spine 用）")
            continue
        g = fit_long(k, game_size(iid))
        g.save(OUT / f"{iid}.png", optimize=True)
        if iid == "ui_frame":
            write_frame_meta(g)
        print(f"  ✓ {iid}: keyed {k.size} -> game {g.size}")


if __name__ == "__main__":
    main()

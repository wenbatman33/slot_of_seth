#!/usr/bin/env python3
"""程序化產生柔光、粒子點、光芒等小型特效貼圖（art_src/fx/ 給 Spine，assets/resources/fx/ 給遊戲）"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "art_src/fx"
G = ROOT / "assets/resources/fx"
A.mkdir(parents=True, exist_ok=True)
G.mkdir(parents=True, exist_ok=True)


def radial(n, rgb, power=2.2, core=0.0):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.sqrt((x - n / 2 + 0.5) ** 2 + (y - n / 2 + 0.5) ** 2) / (n / 2)
    a = np.clip(1 - r, 0, 1) ** power
    if core:
        a = np.maximum(a, np.clip(1 - r / core, 0, 1) ** 1.5)
    img = np.zeros((n, n, 4), np.float32)
    img[..., :3] = rgb
    img[..., 3] = a * 255
    return Image.fromarray(img.astype(np.uint8), "RGBA")


def rays(n, rgb, count=12):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    dx, dy = x - n / 2, y - n / 2
    r = np.sqrt(dx * dx + dy * dy) / (n / 2)
    ang = np.arctan2(dy, dx)
    beam = (0.5 + 0.5 * np.cos(ang * count)) ** 6
    a = beam * np.clip(1 - r, 0, 1) ** 1.2
    img = np.zeros((n, n, 4), np.float32)
    img[..., :3] = rgb
    img[..., 3] = a * 255
    return Image.fromarray(img.astype(np.uint8), "RGBA")


radial(256, (90, 170, 255), 1.8, 0.25).save(A / "glow_blue.png")
radial(256, (220, 110, 255), 1.8, 0.25).save(A / "glow_purple.png")
radial(256, (255, 210, 120), 1.8, 0.25).save(A / "glow_gold.png")
for nm in ("glow_blue", "glow_purple", "glow_gold"):
    Image.open(A / f"{nm}.png").save(G / f"{nm}.png")
radial(64, (255, 255, 255), 2.5, 0.2).save(G / "dot.png")
radial(256, (255, 255, 255), 1.6).save(G / "soft.png")
rays(512, (255, 230, 170), 16).save(G / "rays.png")
print("fx ok")


def win_frame(w, h, rgb, r=18, thick=5, glow=16):
    """中獎格的青色發光方框（含外光暈）"""
    from PIL import ImageDraw, ImageFilter
    W, H = w + glow * 2, h + glow * 2
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([glow, glow, glow + w - 1, glow + h - 1], r, outline=255, width=thick)
    g = m.filter(ImageFilter.GaussianBlur(glow / 2.2))
    a = np.maximum(np.asarray(m).astype(np.float32), np.asarray(g).astype(np.float32) * 1.6)
    inner = Image.new("L", (W, H), 0)
    ImageDraw.Draw(inner).rounded_rectangle([glow + thick, glow + thick, glow + w - thick, glow + h - thick], r - 4, fill=255)
    ia = np.asarray(inner.filter(ImageFilter.GaussianBlur(10))).astype(np.float32) * 0.18
    a = np.clip(np.maximum(a, ia), 0, 255)
    img = np.zeros((H, W, 4), np.float32)
    img[..., :3] = rgb
    core = np.asarray(m).astype(np.float32)[..., None] / 255
    img[..., :3] = img[..., :3] * (1 - core) + 255 * core * 0.85 + img[..., :3] * core * 0.15
    img[..., 3] = a
    return Image.fromarray(img.astype(np.uint8), "RGBA")


def star(n, rgb):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    dx, dy = np.abs(x - n / 2 + 0.5) / (n / 2), np.abs(y - n / 2 + 0.5) / (n / 2)
    a = np.clip(1 - (dx * 8 * dy + dx + dy) ** 0.5, 0, 1) ** 2
    a = np.maximum(a, np.clip(1 - np.sqrt(dx * dx + dy * dy) * 3, 0, 1))
    img = np.zeros((n, n, 4), np.float32)
    img[..., :3] = rgb
    img[..., 3] = a * 255
    return Image.fromarray(img.astype(np.uint8), "RGBA")


win_frame(168, 146, (70, 240, 255)).save(G / "win_frame.png")
star(128, (255, 250, 220)).save(G / "star.png")
print("win_frame/star ok")


def round_rect(n, r, border=0):
    """白色圓角矩形（給九宮格面板用）：border>0 時只畫外框線"""
    from PIL import ImageDraw
    s = 4  # 超取樣抗鋸齒
    m = Image.new("L", (n * s, n * s), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, n * s - 1, n * s - 1], r * s, fill=255)
    if border:
        d.rounded_rectangle([border * s, border * s, n * s - 1 - border * s, n * s - 1 - border * s], (r - border) * s, fill=0)
    m = m.resize((n, n), Image.LANCZOS)
    img = Image.new("RGBA", (n, n), (255, 255, 255, 0))
    img.putalpha(m)
    return img


Image.new("RGBA", (8, 8), (255, 255, 255, 255)).save(G / "white.png")
round_rect(96, 24).save(G / "ui_round_fill.png")
round_rect(96, 24, 4).save(G / "ui_round_stroke.png")
print("white/round ok")

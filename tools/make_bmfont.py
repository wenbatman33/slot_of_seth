#!/usr/bin/env python3
"""
產生金色立體數字 BMFont（.fnt + .png），Cocos 會匯入成 BitmapFont
  num_gold  ：金色漸層 + 深棕描邊（贏分、倍數、免費次數）
  num_white ：白→淡紫漸層 + 深紫描邊（倍數球上的數字）
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/resources/font"
FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
CHARS = "0123456789.,x+-$:/%"
SIZE = 96
STROKE = 7


def lerp(c0, c1, t):
    return tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))


def glyph(ch, font, grad, outline):
    bbox = font.getbbox(ch)
    w = bbox[2] - bbox[0] + STROKE * 2 + 6
    h = SIZE + STROKE * 2 + 10
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((STROKE + 3 - bbox[0], STROKE + 2), ch, font=font, fill=255)
    omask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(omask).text((STROKE + 3 - bbox[0], STROKE + 2), ch, font=font, fill=255,
                               stroke_width=STROKE, stroke_fill=255)
    # 漸層填色
    fill = np.zeros((h, w, 3), np.uint8)
    for y in range(h):
        t = y / (h - 1)
        if t < 0.5:
            c = lerp(grad[0], grad[1], t / 0.5)
        else:
            c = lerp(grad[1], grad[2], (t - 0.5) / 0.5)
        fill[y, :] = c
    # 上緣高光
    hl = np.asarray(mask.filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    shift = np.roll(hl, 3, axis=0)
    edge = np.clip(hl - shift, 0, 1)[..., None]
    fillf = fill.astype(np.float32) + edge * 120
    img = np.zeros((h, w, 4), np.float32)
    o = np.asarray(omask).astype(np.float32) / 255
    m = np.asarray(mask).astype(np.float32) / 255
    img[..., :3] = outline
    img[..., :3] = img[..., :3] * (1 - m[..., None]) + fillf * m[..., None]
    img[..., 3] = np.maximum(o, m) * 255
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA"), w, h


def build(name, grad, outline):
    font = ImageFont.truetype(FONT, SIZE)
    gl = [(ch,) + glyph(ch, font, grad, outline) for ch in CHARS]
    # 依數字 0-9 的實際字墨範圍統一裁切上下留白（所有字用同一個裁切窗，基線才會對齊），
    # 否則字型上方的上伸空間會讓數字在 Label 裡看起來偏下
    top, bot = 10 ** 9, -1
    for ch, im, w, h in gl:
        if ch.isdigit():
            ys = np.nonzero(np.asarray(im)[..., 3].max(axis=1) > 8)[0]
            top, bot = min(top, ys.min()), max(bot, ys.max())
    top, bot = max(0, top - 3), bot + 4
    gl = [(ch, im.crop((0, top, w, bot)), w, bot - top) for ch, im, w, h in gl]
    W = 1024
    x = y = 0
    rowh = 0
    pos = {}
    for ch, im, w, h in gl:
        if x + w > W:
            x, y = 0, y + rowh + 2
            rowh = 0
        pos[ch] = (x, y)
        x += w + 2
        rowh = max(rowh, h)
    H = 1
    while H < y + rowh:
        H *= 2
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gh = gl[0][3]
    lines = [f'info face="{name}" size={gh} bold=1 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0',
             f"common lineHeight={gh} base={gh - 4} scaleW={W} scaleH={H} pages=1 packed=0",
             f'page id=0 file="{name}.png"', f"chars count={len(gl)}"]
    for ch, im, w, h in gl:
        px, py = pos[ch]
        sheet.paste(im, (px, py))
        adv = w - STROKE - 2 if ch not in ".,:" else w - STROKE + 2
        lines.append(f"char id={ord(ch)} x={px} y={py} width={w} height={h} xoffset=0 yoffset=0 xadvance={adv} page=0 chnl=15")
    sheet.save(OUT / f"{name}.png")
    (OUT / f"{name}.fnt").write_text("\n".join(lines) + "\n")
    print(f"  ✓ {name}.fnt  {W}x{H}")


OUT.mkdir(parents=True, exist_ok=True)
build("num_gold", [(255, 250, 215), (255, 206, 72), (196, 112, 18)], (58, 22, 0))
build("num_white", [(255, 255, 255), (246, 226, 255), (205, 160, 255)], (52, 8, 72))

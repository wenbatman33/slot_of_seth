#!/usr/bin/env python3
"""把多張圖拼成縮圖總覽：contact.py out.png img1 img2 ...（棋盤底顯示透明）"""
import sys, math
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
cell = 300
cols = min(6, len(files))
rows = math.ceil(len(files) / cols)
sheet = Image.new("RGB", (cols * cell, rows * (cell + 16)), (30, 30, 36))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA")
    im.thumbnail((cell - 8, cell - 8))
    bg = Image.new("RGBA", im.size, (70, 60, 80, 255))
    bg.alpha_composite(im)
    x, y = (i % cols) * cell, (i // cols) * (cell + 16)
    sheet.paste(bg.convert("RGB"), (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
    d.text((x + 4, y + cell), f.split("/")[-1][:40], fill=(230, 230, 230))
sheet.save(out)

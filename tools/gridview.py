#!/usr/bin/env python3
"""在去背圖上疊座標格線，方便定位骨架關節：gridview.py in.png out.png"""
import sys
from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert("RGBA")
bg = Image.new("RGBA", im.size, (40, 40, 48, 255))
bg.alpha_composite(im)
d = ImageDraw.Draw(bg)
W, H = im.size
for x in range(0, W, 50):
    d.line([(x, 0), (x, H)], fill=(255, 255, 255, 70) if x % 100 else (255, 80, 80, 160), width=1)
for y in range(0, H, 50):
    d.line([(0, y), (W, y)], fill=(255, 255, 255, 70) if y % 100 else (255, 80, 80, 160), width=1)
for x in range(0, W, 100):
    for y in range(0, H, 100):
        d.text((x + 2, y + 2), f"{x},{y}", fill=(255, 255, 0, 255))
bg.convert("RGB").save(sys.argv[2])

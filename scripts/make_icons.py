#!/usr/bin/env python3
"""Render the DS-6 home-screen icon set: a brass plate on walnut.

Draws at 1024 and downsamples to every size the web manifest and Apple
touch icon need. Run from the repo root:  python3 scripts/make_icons.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

S = 1024
img = Image.new('RGB', (S, S))
px = img.load()

# Walnut ground: radial falloff from a warm center, faint grain.
cx, cy = S / 2, S * 0.42
top = (0x2a, 0x1b, 0x0d)
edge = (0x12, 0x0a, 0x05)
maxd = math.hypot(S, S) / 1.55
for y in range(S):
    for x in range(0, S, 2):  # 2px steps then smooth — full res is slow in pure PIL
        d = math.hypot(x - cx, y - cy) / maxd
        d = min(1.0, d) ** 1.4
        c = tuple(int(t + (e - t) * d) for t, e in zip(top, edge))
        px[x, y] = c
        if x + 1 < S:
            px[x + 1, y] = c
grain = Image.new('L', (S, S), 0)
gd = ImageDraw.Draw(grain)
for i in range(70):
    yy = (i * 149) % S
    gd.line([(0, yy), (S, yy + ((i * 37) % 90) - 45)], fill=10 + (i * 7) % 14, width=3)
grain = grain.filter(ImageFilter.GaussianBlur(6))
img = Image.composite(Image.new('RGB', (S, S), (0x0c, 0x07, 0x03)), img, grain.point(lambda v: v // 2))

draw = ImageDraw.Draw(img)

# The brass plate, screwed to the cabinet.
pw, ph = 700, 360
pl, pt = (S - pw) // 2, (S - ph) // 2
plate = Image.new('RGB', (pw, ph))
ppx = plate.load()
for y in range(ph):
    t = y / ph
    r = int(0xf2 + (0xd9 - 0xf2) * t)
    g = int(0xbd + (0x9b - 0xbd) * t)
    b = int(0x6b + (0x3f - 0x6b) * t)
    for x in range(pw):
        ppx[x, y] = (r, g, b)
# brushed sheen
sheen = Image.new('L', (pw, ph), 0)
sd = ImageDraw.Draw(sheen)
sd.ellipse([-pw * 0.25, -ph * 1.15, pw * 1.25, ph * 0.75], fill=46)
sheen = sheen.filter(ImageFilter.GaussianBlur(40))
plate = Image.composite(Image.new('RGB', (pw, ph), (0xff, 0xe2, 0xa8)), plate, sheen)

mask = Image.new('L', (pw, ph), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=26, fill=255)

# drop shadow under the plate
shadow = Image.new('L', (S, S), 0)
ImageDraw.Draw(shadow).rounded_rectangle([pl + 6, pt + 14, pl + pw + 6, pt + ph + 14], radius=26, fill=110)
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
img = Image.composite(Image.new('RGB', (S, S), (0, 0, 0)), img, shadow)

img.paste(plate, (pl, pt), mask)
draw = ImageDraw.Draw(img)
# engraved border line inside the plate edge
draw.rounded_rectangle([pl + 18, pt + 18, pl + pw - 18, pt + ph - 18], radius=16,
                       outline=(0x8a, 0x62, 0x28), width=4)

# screws in the corners
for sx, sy in [(pl + 42, pt + 42), (pl + pw - 42, pt + 42),
               (pl + 42, pt + ph - 42), (pl + pw - 42, pt + ph - 42)]:
    draw.ellipse([sx - 16, sy - 16, sx + 16, sy + 16], fill=(0xb8, 0x8a, 0x3e),
                 outline=(0x6e, 0x4d, 0x1c), width=3)
    a = 0.6 if (sx + sy) % 2 else -0.35
    dx, dy = 13 * math.cos(a), 13 * math.sin(a)
    draw.line([sx - dx, sy - dy, sx + dx, sy + dy], fill=(0x5a, 0x3e, 0x14), width=5)

# the stamp: D S , P in Besley, pressed into the brass
font = ImageFont.truetype(os.path.join(ROOT, 'assets', 'fonts', 'Besley.ttf'), 150)
text = 'D S , P'
bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx, ty = (S - tw) // 2 - bbox[0], pt + (ph - th) // 2 - bbox[1] - 8
draw.text((tx + 2, ty + 3), text, font=font, fill=(0xff, 0xe6, 0xb0))  # relief light below-right
draw.text((tx, ty), text, font=font, fill=(0x2a, 0x1a, 0x08))

# the amber jewel, lit, beneath the plate
jx, jy = S // 2, pt + ph + 110
glow = Image.new('L', (S, S), 0)
ImageDraw.Draw(glow).ellipse([jx - 60, jy - 60, jx + 60, jy + 60], fill=150)
glow = glow.filter(ImageFilter.GaussianBlur(34))
img = Image.composite(Image.new('RGB', (S, S), (0xff, 0xa5, 0x26)), img, glow)
draw = ImageDraw.Draw(img)
draw.ellipse([jx - 22, jy - 22, jx + 22, jy + 22], fill=(0xff, 0xb4, 0x3c),
             outline=(0x7a, 0x4d, 0x12), width=4)
draw.ellipse([jx - 10, jy - 16, jx + 2, jy - 6], fill=(0xff, 0xe2, 0xa0))

for name, size in [('icon-1024.png', 1024), ('icon-512.png', 512),
                   ('icon-192.png', 192), ('apple-touch-icon.png', 180)]:
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    print('wrote', name)

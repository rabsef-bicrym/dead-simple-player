#!/usr/bin/env python3
"""Render the native app icon set: the pilot lamp, lit, in its brass bezel.

The lamp is the mark that means "on the air" inside the app — the station
register's jewel, scaled up to jewelry. Emits:

  assets/icon.png           1024 opaque — iOS (system applies the squircle)
  assets/splash-icon.png    1024 w/ alpha — splash `contain` image
  assets/adaptive-icon.png  1024 w/ alpha — Android foreground (safe-zone sized)

Run from the repo root:  python3 scripts/make_ios_icon.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets')

S = 1024
CX = CY = S // 2
R_BEZEL = 372   # outer edge of the brass bezel
R_DOME = 292    # amber dome


def walnut_ground():
    img = Image.new('RGB', (S, S))
    px = img.load()
    top = (0x2c, 0x1c, 0x0d)
    edge = (0x0f, 0x08, 0x04)
    maxd = math.hypot(S, S) / 1.62
    for y in range(S):
        for x in range(0, S, 2):
            d = min(1.0, math.hypot(x - CX, y - CY * 0.92) / maxd) ** 1.35
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
    return Image.composite(Image.new('RGB', (S, S), (0x0b, 0x06, 0x03)), img, grain.point(lambda v: v // 2))


def draw_lamp(img, with_ground_glow=True):
    """Draw bezel + dome + ribs + screws onto img (RGB or RGBA)."""
    # ambient glow on whatever's behind
    if with_ground_glow:
        glow = Image.new('L', (S, S), 0)
        ImageDraw.Draw(glow).ellipse([CX - 300, CY - 300, CX + 300, CY + 300], fill=120)
        glow = glow.filter(ImageFilter.GaussianBlur(130))
        amber_fill = Image.new(img.mode, (S, S), (0xff, 0xa5, 0x26) if img.mode == 'RGB' else (0xff, 0xa5, 0x26, 255))
        img.paste(amber_fill, (0, 0), glow)

    d = ImageDraw.Draw(img)

    # brass bezel: vertical gradient annulus
    ring = Image.new('RGB', (S, S))
    rpx = ring.load()
    for y in range(CY - R_BEZEL, CY + R_BEZEL + 1):
        t = (y - (CY - R_BEZEL)) / (2 * R_BEZEL)
        r = int(0xf4 + (0xd6 - 0xf4) * t)
        g = int(0xc0 + (0x98 - 0xc0) * t)
        b = int(0x6e + (0x3c - 0x6e) * t)
        for x in range(S):
            rpx[x, y] = (r, g, b)
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([CX - R_BEZEL, CY - R_BEZEL, CX + R_BEZEL, CY + R_BEZEL], fill=255)
    md.ellipse([CX - R_DOME, CY - R_DOME, CX + R_DOME, CY + R_DOME], fill=0)
    img.paste(ring, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.ellipse([CX - R_BEZEL, CY - R_BEZEL, CX + R_BEZEL, CY + R_BEZEL],
              outline=(0x64, 0x45, 0x18), width=7)
    d.ellipse([CX - R_DOME, CY - R_DOME, CX + R_DOME, CY + R_DOME],
              outline=(0x8a, 0x62, 0x28), width=6)

    # bezel screws at the diagonals
    for a in (45, 135, 225, 315):
        sx = CX + (R_BEZEL - 40) * math.cos(math.radians(a))
        sy = CY + (R_BEZEL - 40) * math.sin(math.radians(a))
        d.ellipse([sx - 21, sy - 21, sx + 21, sy + 21], fill=(0xb8, 0x8a, 0x3e),
                  outline=(0x6e, 0x4d, 0x1c), width=4)
        ang = 0.6 if a % 180 == 45 else -0.35
        dx, dy = 16 * math.cos(ang), 16 * math.sin(ang)
        d.line([sx - dx, sy - dy, sx + dx, sy + dy], fill=(0x5a, 0x3e, 0x14), width=6)

    # amber dome: radial gradient, bright heart
    dome = Image.new('RGB', (S, S))
    dpx = dome.load()
    for y in range(CY - R_DOME, CY + R_DOME + 1):
        for x in range(CX - R_DOME, CX + R_DOME + 1):
            dd = math.hypot(x - CX, y - CY) / R_DOME
            if dd > 1:
                continue
            t = dd ** 1.5
            r = int(0xff + (0xa0 - 0xff) * t)
            g = int(0xc8 + (0x46 - 0xc8) * t)
            b = int(0x5c + (0x0c - 0x5c) * t)
            dpx[x, y] = (r, g, b)
    dmask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(dmask).ellipse([CX - R_DOME, CY - R_DOME, CX + R_DOME, CY + R_DOME], fill=255)
    img.paste(dome, (0, 0), dmask)
    d = ImageDraw.Draw(img)

    # lens ribs: vertical chords, the classic jewel cut
    for off in range(-4, 5):
        xo = CX + off * (R_DOME // 5)
        half = math.sqrt(max(0.0, R_DOME * R_DOME * 0.94 - (xo - CX) ** 2))
        d.line([xo, CY - half, xo, CY + half], fill=(0xd8, 0x7e, 0x1c), width=5)
    d.ellipse([CX - R_DOME * 0.55, CY - R_DOME * 0.55, CX + R_DOME * 0.55, CY + R_DOME * 0.55],
              outline=(0xea, 0x93, 0x28), width=4)
    d.ellipse([CX - R_DOME, CY - R_DOME, CX + R_DOME, CY + R_DOME],
              outline=(0x7a, 0x4d, 0x12), width=6)

    # specular
    spec = Image.new('L', (S, S), 0)
    ImageDraw.Draw(spec).ellipse([CX - 140, CY - 190, CX - 20, CY - 95], fill=210)
    spec = spec.filter(ImageFilter.GaussianBlur(14))
    warm = Image.new(img.mode, (S, S), (0xff, 0xea, 0xb6) if img.mode == 'RGB' else (0xff, 0xea, 0xb6, 255))
    img.paste(warm, (0, 0), spec)
    return img


def lamp_on_alpha(scale=1.0):
    """The lamp alone on transparency, optionally scaled toward center."""
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    lamp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw_lamp(lamp, with_ground_glow=False)
    # keep only the bezel disc
    keep = Image.new('L', (S, S), 0)
    ImageDraw.Draw(keep).ellipse([CX - R_BEZEL - 4, CY - R_BEZEL - 4, CX + R_BEZEL + 4, CY + R_BEZEL + 4], fill=255)
    lamp.putalpha(keep)
    if scale != 1.0:
        ns = int(S * scale)
        lamp = lamp.resize((ns, ns), Image.LANCZOS)
        base.paste(lamp, ((S - ns) // 2, (S - ns) // 2), lamp)
        return base
    return lamp


os.makedirs(OUT, exist_ok=True)

icon = draw_lamp(walnut_ground())
icon.save(os.path.join(OUT, 'icon.png'))
print('wrote assets/icon.png')

lamp_on_alpha(scale=0.62).save(os.path.join(OUT, 'splash-icon.png'))
print('wrote assets/splash-icon.png')

lamp_on_alpha(scale=0.58).save(os.path.join(OUT, 'adaptive-icon.png'))
print('wrote assets/adaptive-icon.png')

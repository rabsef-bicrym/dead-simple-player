#!/usr/bin/env python3
"""Generate the DS,P period-correct, seamless 12 fps tuning loop."""

from pathlib import Path
import math
import random

from PIL import Image


WIDTH = 144
HEIGHT = 81
FRAMES = 12
SEED = 8605
OUT = Path(__file__).resolve().parents[1] / "assets" / "static" / "tuning-static.gif"


def frame_pixels(frame: int) -> list[int]:
    rng = random.Random(SEED + frame * 7919)
    flutter = math.sin((frame / FRAMES) * math.tau) * 4.0
    pixels: list[int] = []
    for y in range(HEIGHT):
        ny = (y - HEIGHT / 2) / (HEIGHT / 2)
        for x in range(WIDTH):
            nx = (x - WIDTH / 2) / (WIDTH / 2)
            vignette = max(0.0, nx * nx + ny * ny - 0.25) * 16.0
            grain = rng.gauss(132 + flutter, 36)
            pixels.append(round(max(35, min(218, grain - vignette))))
    return pixels


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    for index in range(FRAMES):
        image = Image.new("L", (WIDTH, HEIGHT))
        image.putdata(frame_pixels(index))
        frames.append(image.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / 12),
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

"""Original A.T. field hexagon texture for the End of Evangelion scene.

Run: python3 tools/author-at-field.py

Draws a seamless pointy-top hexagon lattice as a linear grayscale luminance mask, then encodes
dist/assets/at-field-4k.webp (4096 x 4096, ULTRA) and dist/assets/at-field.webp (1024 x 1024,
the Lanczos downscale of the same art). The renderer multiplies it into an additive orange
material, so black is transparent and no alpha channel is needed. The lattice holds an integer
number of periods in both axes so RepeatWrapping tiles without a seam.
"""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work' / 'at-field'
OUTPUT = ROOT / 'dist' / 'assets'
SIZE = 4096
COLUMNS, ROWS = 9, 10            # 9 horizontal periods, 5 two-row periods
SUPERSAMPLE = 2                  # edges are drawn at 8192 and Lanczos-reduced for anti-aliasing
PAD = 128                        # wrapped margin so the glow blur continues across the tile edge
CELL, EDGE, GLOW = 26, 255, .85  # cell floor, edge peak, glow weight


def hexagons(size):
    period, row = size / COLUMNS, size / ROWS
    half, radius = period / 2, row / 1.5
    for j in range(-1, ROWS + 2):
        for i in range(-1, COLUMNS + 2):
            cx, cy = i * period + (half if j % 2 else 0), j * row
            yield [(cx, cy - radius), (cx + half, cy - radius / 2), (cx + half, cy + radius / 2),
                   (cx, cy + radius), (cx - half, cy + radius / 2), (cx - half, cy - radius / 2)]


def layer(size, width, fill):
    image = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(image)
    for polygon in hexagons(size):
        if width:
            draw.line(polygon + [polygon[0]], fill=fill, width=width, joint='curve')
        else:
            draw.polygon(polygon, fill=fill)
    return image


def wrapped_blur(array, radius):
    padded = np.pad(array, PAD, mode='wrap')
    blurred = Image.fromarray(padded).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(blurred, dtype=np.float32)[PAD:-PAD, PAD:-PAD]


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    cells = np.asarray(layer(SIZE, 0, CELL), dtype=np.float32)
    edges = layer(SIZE * SUPERSAMPLE, 9 * SUPERSAMPLE, EDGE).resize((SIZE, SIZE), Image.LANCZOS)
    edges = np.asarray(edges, dtype=np.float32)
    glow = wrapped_blur(np.asarray(Image.fromarray(edges.astype(np.uint8)), dtype=np.uint8), 30)
    mask = np.clip(cells + edges + glow * GLOW, 0, 255).astype(np.uint8)
    full = Image.fromarray(mask, 'L')
    full.save(WORK / 'at-field-4k.png')
    full.resize((SIZE // 4, SIZE // 4), Image.LANCZOS).save(WORK / 'at-field.png')
    for name in ('at-field-4k', 'at-field'):
        subprocess.run(['cwebp', '-quiet', '-q', '90', '-m', '6', WORK / f'{name}.png', '-o', OUTPUT / f'{name}.webp'], check=True)
        print(name, (OUTPUT / f'{name}.webp').stat().st_size, 'bytes')


if __name__ == '__main__':
    main()

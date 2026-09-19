"""Original deterministic 4x4 particle masks. Run: python3 tools/author-particles.py.

Requires only Pillow and NumPy. RGB stores linear coverage, with a black gutter in
all sixteen cells; no external imagery, models, or random runtime state is used.
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 256
ROOT = Path(__file__).resolve().parents[1]


def smooth(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(rng):
    result = np.zeros((SIZE, SIZE), dtype=np.float64)
    for grid, weight in ((5, .53), (11, .27), (23, .13), (47, .07)):
        noise = Image.fromarray(rng.integers(0, 256, (grid, grid), dtype=np.uint8))
        result += np.asarray(noise.resize((SIZE, SIZE), Image.Resampling.BICUBIC)) / 255 * weight
    return result


def atlas():
    rng = np.random.default_rng(20260916)
    y, x = np.mgrid[:SIZE, :SIZE].astype(float)
    x = (x + .5 - SIZE / 2) / (SIZE / 2)
    y = (y + .5 - SIZE / 2) / (SIZE / 2)
    r = np.hypot(x, y)
    edge = 1 - smooth(.72, .91, r)
    sheet = np.zeros((1024, 1024), dtype=np.uint8)
    for cell in range(16):
        variant = cell % 4
        if cell < 4:
            grain = fbm(rng)
            mask = smooth(.18 + variant * .055, .68, grain) * np.exp(-r*r*(1.3 + variant*.2)) * edge
        elif cell < 8:
            mask = np.clip(np.exp(-r*r*(22 + variant*9)) + .38*np.exp(-r*r*(3 + variant)), 0, 1) * edge
        elif cell < 12:
            # Long axis is +X; the vertex shader aligns it to projected motion.
            mask = np.exp(-(y/(.055 + variant*.014))**2) * (1-smooth(.1,.84,np.abs(x)))
            mask += .2*np.exp(-(y/.18)**2-(x/.6)**2)
            mask *= edge
        elif cell < 14:
            radius = np.hypot(x*(1.1 if cell == 12 else 1.45), y)
            mask = (np.exp(-radius**2*7)*.55 + np.exp(-((radius-.38)/.13)**2)*.45)*edge
        else:
            angle = np.arctan2(y,x)
            arms = np.exp(-(np.sin(angle*3)*r/.045)**2)
            branches = np.exp(-((np.abs(np.sin(angle*3))-.32)/.10)**2)*np.exp(-((r-.4)/.17)**2)
            mask = np.clip(arms+branches*(.65 if cell == 14 else 1),0,1)*(1-smooth(.48,.82,r))
        sheet[(cell//4)*SIZE:(cell//4+1)*SIZE,(cell%4)*SIZE:(cell%4+1)*SIZE] = np.uint8(np.clip(mask,0,1)*255)
    return Image.fromarray(sheet).convert('RGB')


if __name__ == '__main__':
    target = ROOT / 'dist/assets/particle-atlas.webp'
    atlas().save(target, 'WEBP', lossless=True, method=6)
    print(f'{target}: {target.stat().st_size} bytes')

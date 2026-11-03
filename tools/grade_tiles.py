#!/usr/bin/env python3
"""Evens out the colour patchwork in Esri imagery (different sources per area/zoom).

Each zoom level is colour-matched, at low frequency, to the already-corrected level
above it (zoom 9 is matched to the uniform zoom-8 regional image). Fine detail is kept;
only broad colour/brightness differences are removed. Output: tiles_graded/<z>/<x>_<y>.jpg
"""
import json, math, os
import cv2, numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAN = json.load(open(os.path.join(ROOT, 'assets/earth/manifest.json')))
SRC, DST = os.path.join(ROOT, 'tiles'), os.path.join(ROOT, 'tiles_graded')

def bounds(tiles):
    xs = [t[0] for t in tiles]; ys = [t[1] for t in tiles]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1

def load_level(z):
    tl = MAN['pyramid'][str(z)]
    x0, y0, x1, y1 = bounds(tl)
    img = np.zeros(((y1 - y0) * 256, (x1 - x0) * 256, 3), np.float32)
    mask = np.zeros(img.shape[:2], np.float32)
    for x, y in tl:
        t = cv2.imread(os.path.join(SRC, str(z), f'{x}_{y}.jpg'))
        if t is None: continue
        img[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = t
        mask[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = 1
    return img, mask, (x0, y0, x1, y1)

def nblur(img, mask, sigma):
    k = (0, 0)
    num = cv2.GaussianBlur(img * mask[..., None], k, sigma)
    den = cv2.GaussianBlur(mask, k, sigma)[..., None]
    return num / np.maximum(den, 1e-4)

p8 = MAN['patch8']
ref = cv2.imread(os.path.join(ROOT, 'assets/earth/patch8.jpg')).astype(np.float32)
ref_b = (p8['x0'], p8['y0'], p8['x1'], p8['y1'])
ref_z = 8
for z in range(9, 20):
    if str(z) not in MAN['pyramid']: break
    img, mask, b = load_level(z)
    # reference: previous (corrected) level, cropped to this level's area and upscaled x2^(z-ref_z)
    f = 2 ** (z - ref_z)
    ox, oy = b[0] / f - ref_b[0], b[1] / f - ref_b[1]
    sx = img.shape[1] / f; sy = img.shape[0] / f
    M = np.float32([[f, 0, -ox * 256 * f], [0, f, -oy * 256 * f]])
    refc = cv2.warpAffine(ref, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    sigma = 6 if z < 15 else 10
    gain = (nblur(refc, mask, sigma) + 4) / (nblur(img, mask, sigma) + 4)
    gain = np.clip(gain, 0.55, 1.8)
    out = np.clip(img * gain, 0, 255)
    os.makedirs(os.path.join(DST, str(z)), exist_ok=True)
    for x, y in MAN['pyramid'][str(z)]:
        tile = out[(y - b[1]) * 256:(y - b[1] + 1) * 256, (x - b[0]) * 256:(x - b[0] + 1) * 256]
        cv2.imwrite(os.path.join(DST, str(z), f'{x}_{y}.jpg'), tile.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    ref, ref_b, ref_z = out, b, z
    print('graded zoom', z, img.shape)

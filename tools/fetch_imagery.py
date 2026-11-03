#!/usr/bin/env python3
"""Downloads Esri World Imagery tiles and builds the textures used by the video.

  assets/earth/globe.jpg       whole Earth, equirectangular (from zoom 4)
  assets/earth/patch6.jpg      Arabian Peninsula detail (zoom 6, Web Mercator)
  assets/earth/patch8.jpg      UAE detail (zoom 8, Web Mercator)
  tiles/<z>/<x>_<y>.jpg        zoom pyramid around the target (zoom 9..19)
  assets/earth/manifest.json   bounds of the patches + pyramid
Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community.
"""
import io, json, math, os, ssl, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, 'config.json')))
LAT, LON = CFG['target']['lat'], CFG['target']['lon']
URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
CA = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
CTX = ssl.create_default_context(cafile=CA) if CA else ssl.create_default_context()
TILES = os.path.join(ROOT, 'tiles'); OUT = os.path.join(ROOT, 'assets', 'earth')
os.makedirs(OUT, exist_ok=True)

def tile(z, x, y):
    p = os.path.join(TILES, str(z), f'{x}_{y}.jpg')
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(URL.format(z=z, x=x, y=y), context=CTX, timeout=30).read(); break
            except Exception:
                if attempt == 3: raise
        open(p, 'wb').write(data)
    return p

def fetch_all(jobs):
    with ThreadPoolExecutor(12) as ex: return list(ex.map(lambda a: tile(*a), jobs))

def merc(lat, lon, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

def mosaic(z, x0, y0, x1, y1):
    fetch_all([(z, x, y) for x in range(x0, x1) for y in range(y0, y1)])
    im = Image.new('RGB', ((x1 - x0) * 256, (y1 - y0) * 256))
    for x in range(x0, x1):
        for y in range(y0, y1):
            im.paste(Image.open(os.path.join(TILES, str(z), f'{x}_{y}.jpg')).convert('RGB'), ((x - x0) * 256, (y - y0) * 256))
    return im

manifest = {'target': CFG['target']}

# 1. globe (zoom 4 mercator -> equirectangular 4096x2048)
merc4 = np.asarray(mosaic(4, 0, 0, 16, 16)).astype(np.float32)
W, H = 4096, 2048
lat = 90 - (np.arange(H) + 0.5) / H * 180
latc = np.clip(lat, -85.05, 85.05)
my = (1 - np.arcsinh(np.tan(np.radians(latc))) / np.pi) / 2 * 4096
rows = np.clip(my.astype(int), 0, 4095)
eq = merc4[rows][:, np.clip(((np.arange(W) + 0.5) / W * 4096).astype(int), 0, 4095)]
polar = np.abs(lat) > 84
eq[polar] = np.array([225, 232, 240], np.float32)
Image.fromarray(eq.astype(np.uint8)).save(os.path.join(OUT, 'globe.jpg'), quality=90)
print('globe ok')

# 2. regional patches
for z, (lon0, lat0, lon1, lat1) in ((6, (34, 41, 76, 4)), (8, (49.5, 28.5, 60.5, 19.5))):
    ax, ay = merc(lat0, lon0, z); bx, by = merc(lat1, lon1, z)
    x0, y0, x1, y1 = int(ax), int(ay), int(bx) + 1, int(by) + 1
    mosaic(z, x0, y0, x1, y1).save(os.path.join(OUT, f'patch{z}.jpg'), quality=90)
    manifest[f'patch{z}'] = {'z': z, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}
    print('patch', z, x1 - x0, 'x', y1 - y0)

# 3. pyramid around the target (radius chosen so a 2304px canvas is always covered)
pyr = {}
for z in range(9, CFG.get('maxZoom', 19) + 1):
    cx, cy = merc(LAT, LON, z)
    r = 10 if z < 16 else 12
    jobs = [(z, x, y) for x in range(int(cx) - r, int(cx) + r + 1) for y in range(int(cy) - r, int(cy) + r + 1)
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= (r + 0.8) ** 2]
    fetch_all(jobs)
    pyr[z] = [[x, y] for _, x, y in jobs]
    print('zoom', z, len(jobs))
manifest['pyramid'] = pyr
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'))
print('done')

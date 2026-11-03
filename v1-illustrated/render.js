#!/usr/bin/env node
/*
 * Renders index.html / scene.js to an MP4 with headless Chromium + ffmpeg.
 *
 *   node render.js                 -> out/lifehub-zakher.mp4
 *   node render.js --stills 1,5,9  -> out/still-<t>.png only (quick preview)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const stillsArg = process.argv.indexOf('--stills');
  const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;

  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('page error:', e));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render=1`);
  await page.evaluate(() => window.SCENE.ready);
  const { FPS, DURATION } = await page.evaluate(() => ({ FPS: SCENE.FPS, DURATION: SCENE.DURATION }));

  const grab = (t, type) => page.evaluate(([t, type]) => { SCENE.render(t); return SCENE.canvas.toDataURL(type, 0.95); }, [t, type]);
  const write = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

  if (stills) {
    for (const t of stills) { write(path.join(OUT, `still-${t}.png`), await grab(t, 'image/png')); console.log('still', t); }
  } else {
    const dir = path.join(OUT, 'frames');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(FPS * DURATION);
    for (let i = 0; i < n; i++) {
      write(path.join(dir, `${String(i).padStart(5, '0')}.jpg`), await grab(i / FPS, 'image/jpeg'));
      if (i % 30 === 0) console.log(`frame ${i}/${n}`);
    }
    const mp4 = path.join(OUT, 'lifehub-zakher.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4.replace('.mp4', '-720p.mp4')], { stdio: 'inherit' });
    write(path.join(OUT, 'poster.jpg'), await grab(DURATION - 0.1, 'image/jpeg'));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('wrote', mp4);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });

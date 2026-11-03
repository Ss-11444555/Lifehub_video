#!/usr/bin/env node
/*
 * Renders index.html / earth.js to video with headless Chromium + ffmpeg.
 *
 *   python3 tools/fetch_imagery.py   (once: satellite tiles)
 *   python3 tools/make_audio.py      (narration + music mix -> build/audio.wav)
 *   node render.js                   -> out/life-hub-park.mp4 (+ 720p)
 *   node render.js --stills 2,9,20   -> out/still-<t>.jpg only
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

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
  const si = process.argv.indexOf('--stills');
  const stills = si > 0 ? process.argv[si + 1].split(',').map(Number) : null;

  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('page error:', e));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render=1`);
  await page.evaluate(() => window.SCENE.ready);
  const { FPS, DURATION } = await page.evaluate(() => ({ FPS: SCENE.FPS, DURATION: SCENE.DURATION }));

  const grab = (t) => page.evaluate(async (t) => { await SCENE.render(t); return SCENE.canvas.toDataURL('image/jpeg', 0.94); }, t);
  const write = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

  if (stills) {
    for (const t of stills) { write(path.join(OUT, `still-${t}.jpg`), await grab(t)); console.log('still', t); }
  } else {
    const dir = path.join(OUT, 'frames');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(FPS * DURATION);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      write(path.join(dir, `${String(i).padStart(5, '0')}.jpg`), await grab(i / FPS));
      if (i % 60 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    const audio = path.join(ROOT, 'build', 'audio.wav');
    const mp4 = path.join(OUT, 'life-hub-park.mp4');
    const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg')];
    if (fs.existsSync(audio)) args.push('-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest');
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
    execFileSync('ffmpeg', args, { stdio: 'inherit' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4.replace('.mp4', '-720p.mp4')], { stdio: 'inherit' });
    write(path.join(OUT, 'poster.jpg'), await grab(DURATION - 1.6));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('wrote', mp4);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });

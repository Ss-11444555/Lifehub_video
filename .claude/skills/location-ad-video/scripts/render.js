#!/usr/bin/env node
/*
 * Renders a location ad project with headless Chromium + ffmpeg.
 *
 *   node render.js <project-dir>                      every format in ad.json -> <project>/out/<name>-<w>x<h>.mp4
 *   node render.js <project-dir> --format 1080x1920   one format
 *   node render.js <project-dir> --stills 1,5,9,13    quick JPEG stills (per format) for review
 *
 * Needs: playwright (Chromium), ffmpeg. Audio is muxed from <project>/build/audio.wav when present.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require.resolve('playwright', { paths: [process.cwd(), '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }))); }

const SKILL = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const PROJECT = path.resolve(argv.find((a) => !a.startsWith('--') && !/^[\d.,x]+$/.test(a)) || '.');
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const AD = JSON.parse(fs.readFileSync(path.join(PROJECT, 'ad.json'), 'utf8'));
const OUT = path.join(PROJECT, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const ROUTES = [['/engine/', path.join(SKILL, 'scripts/engine')], ['/fonts/', path.join(SKILL, 'assets/fonts')], ['/p/', PROJECT]];

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const r = ROUTES.find(([pre]) => url.startsWith(pre));
    const p = r && path.join(r[1], url.slice(r[0].length));
    if (!p || !p.startsWith(r[1]) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const formats = (opt('--format') ? [opt('--format')] : (AD.formats || ['1920x1080'])).map((f) => f.split('x').map(Number));
  const stills = opt('--stills') ? opt('--stills').split(',').map(Number) : null;
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  for (const [w, h] of formats) {
    const page = await browser.newPage({ viewport: { width: Math.min(w, 1920), height: Math.min(h, 1920) } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(`http://127.0.0.1:${port}/engine/index.html?w=${w}&h=${h}&render=1`);
    await page.evaluate(() => window.SCENE.ready);
    const { FPS, DURATION } = await page.evaluate(() => ({ FPS: SCENE.FPS, DURATION: SCENE.DURATION }));
    const grab = (t) => page.evaluate(async (t) => { await SCENE.render(t); return SCENE.canvas.toDataURL('image/jpeg', 0.93); }, t);
    const write = (file, d) => fs.writeFileSync(file, Buffer.from(d.split(',')[1], 'base64'));
    const tag = `${AD.name || 'ad'}-${w}x${h}`;

    if (stills) {
      for (const t of stills) write(path.join(OUT, `still-${w}x${h}-${t}.jpg`), await grab(t));
      console.log(`stills ${w}x${h}: ${stills.join(', ')}`);
    } else {
      const dir = path.join(OUT, `frames-${w}x${h}`);
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const n = Math.round(FPS * DURATION), t0 = Date.now();
      for (let i = 0; i < n; i++) {
        write(path.join(dir, `${String(i).padStart(5, '0')}.jpg`), await grab(i / FPS));
        if (i % 60 === 0) console.log(`${w}x${h} frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      const mp4 = path.join(OUT, `${tag}.mp4`);
      const audio = path.join(PROJECT, 'build', 'audio.wav');
      const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg')];
      if (fs.existsSync(audio)) args.push('-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest');
      args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', '12M', '-bufsize', '24M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
      execFileSync('ffmpeg', args, { stdio: 'inherit' });
      write(path.join(OUT, `${tag}-poster.jpg`), await grab(DURATION - 0.5));
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('wrote', mp4);
    }
    await page.close();
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });

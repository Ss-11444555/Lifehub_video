/*
 * LifeHub location video — "from the palms of Al Ain to Zakher".
 *
 * Storyboard (seconds):
 *   0.0 – 3.5   Ground level among date palms; camera pushes forward through the fronds.
 *   2.9 – 4.3   Camera rises through clouds.
 *   3.4 – 8.4   Aerial map of Al Ain; camera zooms from the whole city down to Zakher.
 *   8.4 – 10.4  Street level of Zakher; location pin drops on the site.
 *  10.4 – 14.0  Map blurs, pin becomes the logo emblem; brand name + location.
 *
 * Everything is drawn procedurally from a time value `t`, so the same frame is produced
 * every time (render.js uses this to export an MP4).
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const CONFIG = {
    brand: ['Life', 'Hub'],                 // wordmark, second part drawn in the accent colour
    showWordmark: true,                     // set false if your logo image already contains the name
    logoSrc: 'assets/logo.png',             // optional: drop your real logo here (transparent PNG)
    placeAr: 'زاخر، العين',
    placeEn: 'ZAKHER  ·  AL AIN  ·  UAE',
    countryAr: 'الإمارات العربية المتحدة',
    colors: {
      green: '#1f7a5a',
      greenDark: '#0f3d2e',
      gold: '#e0b062',
      sand: '#ecd9b4',
    },
  };

  const W = 1920, H = 1080, FPS = 30, DURATION = 14;
  const SCX = W / 2, SCY = H / 2;

  // ---------------------------------------------------------------- helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (u) => u * u * (3 - 2 * u);
  const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const easeIn = (u) => u * u * u;
  const easeOutBack = (u) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const easeOutBounce = (u) => {
    const n1 = 7.5625, d1 = 2.75;
    if (u < 1 / d1) return n1 * u * u;
    if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
    if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
    return n1 * (u -= 2.625 / d1) * u + 0.984375;
  };
  const fadeInOut = (t, a, b, c, d) => smooth(seg(t, a, b)) * (1 - smooth(seg(t, c, d)));

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20261103);
  const rand = (a, b) => a + (b - a) * R();

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, str, x, y, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.font = `${o.weight || 700} ${o.size || 40}px Cairo, sans-serif`;
    ctx.fillStyle = o.color || '#fff';
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.direction = o.rtl ? 'rtl' : 'ltr';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.spacing || 0) + 'px';
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur ?? 18; ctx.shadowOffsetY = 2; }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function measure(ctx, str, size, weight, spacing = 0) {
    ctx.save();
    ctx.font = `${weight} ${size}px Cairo, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  // ======================================================================
  // Scene A — ground level among date palms
  // ======================================================================
  const VP = { x: 960, y: 742 }; // vanishing point

  function makePalm(x, y, h, color) {
    const fronds = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = lerp(-Math.PI - 0.35, 0.35, i / (n - 1)) + rand(-0.08, 0.08);
      const outer = Math.abs(Math.cos(a));
      fronds.push({ ang: a, len: rand(0.4, 0.5), droop: 0.25 + outer * 0.55 + rand(0, 0.1) });
    }
    return { x, y, h, color, lean: rand(-0.08, 0.08), phase: rand(0, 6.28), fronds };
  }

  const palmsFar = [], palmsMid = [], palmsNear = [];
  for (let i = 0; i < 34; i++) palmsFar.push(makePalm(rand(-200, 2120), rand(736, 748), rand(48, 86), '#88a28b'));
  for (let i = 0; i < 16; i++) {
    let x = rand(-150, 2070);
    if (x > 760 && x < 1160) x += x < 960 ? -420 : 420;
    palmsMid.push(makePalm(x, rand(790, 830), rand(170, 250), '#4f765a'));
  }
  [[90, 1010, 640], [330, 960, 520], [-120, 1080, 760], [1610, 990, 600], [1840, 1060, 720], [1420, 940, 470]]
    .forEach(([x, y, h]) => palmsNear.push(makePalm(x, y, h, '#2a5236')));
  palmsFar.sort((a, b) => a.y - b.y);
  palmsMid.sort((a, b) => a.y - b.y);

  const tufts = [];
  for (let i = 0; i < 70; i++) {
    const y = rand(760, 1080);
    const depth = (y - 740) / 340;
    tufts.push({ x: rand(-100, 2020), y, s: 6 + depth * 40, c: depth > 0.5 ? '#557a3f' : '#7f9a5f' });
  }

  function drawFrond(ctx, x0, y0, ang, len, droop, lw, leafLen, n) {
    const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len + droop * len;
    const cx = x0 + Math.cos(ang) * len * 0.55, cy = y0 + Math.sin(ang) * len * 0.55 - droop * len * 0.3;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const u = i / n, v = 1 - u;
      const px = v * v * x0 + 2 * v * u * cx + u * u * ex;
      const py = v * v * y0 + 2 * v * u * cy + u * u * ey;
      let tx = 2 * v * (cx - x0) + 2 * u * (ex - cx), ty = 2 * v * (cy - y0) + 2 * u * (ey - cy);
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const L = leafLen * Math.sin(Math.PI * (0.12 + 0.88 * u)) * (1.05 - 0.45 * u);
      for (const s of [-1, 1]) {
        let dx = tx * 0.5 - ty * s * 0.85, dy = ty * 0.5 + tx * s * 0.85 + 0.5;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        ctx.moveTo(px, py); ctx.lineTo(px + dx * L, py + dy * L);
      }
    }
    ctx.lineWidth = Math.max(0.6, lw * 0.5);
    ctx.stroke();
  }

  function drawPalm(ctx, p, t) {
    const { x, y, h, lean } = p;
    const sw = Math.sin(t * 1.2 + p.phase) * 0.015;
    const tx = x + (lean + sw) * h, ty = y - h;
    const w0 = h * 0.042, w1 = h * 0.026;
    ctx.fillStyle = p.color; ctx.strokeStyle = p.color; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w0, y);
    ctx.quadraticCurveTo(x + lean * h * 0.35 - w0 * 0.8, y - h * 0.5, tx - w1, ty);
    ctx.lineTo(tx + w1, ty);
    ctx.quadraticCurveTo(x + lean * h * 0.35 + w0 * 0.8, y - h * 0.5, x + w0, y);
    ctx.closePath(); ctx.fill();
    // trunk rings
    if (h > 150) {
      ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, h * 0.004);
      ctx.beginPath();
      for (let k = 0.08; k < 0.95; k += 0.045) {
        const yy = y - h * k, xx = lerp(x, tx, k * k * 0.6 + k * 0.4), ww = lerp(w0, w1, k);
        ctx.moveTo(xx - ww * 0.9, yy); ctx.lineTo(xx + ww * 0.9, yy - h * 0.006);
      }
      ctx.stroke(); ctx.restore();
    }
    for (const f of p.fronds) drawFrond(ctx, tx, ty, f.ang + sw * 3, h * f.len, f.droop, Math.max(1, h * 0.011), h * 0.12, h > 150 ? 26 : 14);
    ctx.beginPath(); ctx.arc(tx, ty, w1 * 1.6, 0, Math.PI * 2); ctx.fill();
  }

  function withPush(ctx, k, dy, fn) {
    ctx.save();
    ctx.translate(VP.x, VP.y + dy); ctx.scale(k, k); ctx.translate(-VP.x, -VP.y);
    fn(); ctx.restore();
  }

  function drawSceneA(ctx, t) {
    const p = easeInOut(seg(t, 0, 3.6));
    const rise = easeIn(seg(t, 2.6, 3.6)) * 520; // camera lifts -> scene slides down
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, 760);
    sky.addColorStop(0, '#6fa9c6'); sky.addColorStop(0.55, '#b9d3d3'); sky.addColorStop(1, '#f6d6a2');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(1340, 560 + rise * 0.3, 0, 1340, 560 + rise * 0.3, 520);
    sun.addColorStop(0, 'rgba(255,244,214,1)'); sun.addColorStop(0.08, 'rgba(255,236,190,0.95)');
    sun.addColorStop(0.3, 'rgba(255,214,150,0.35)'); sun.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

    // far: Jebel Hafeet silhouette + dunes + far palms
    withPush(ctx, 1 + 0.12 * p, rise * 0.4, () => {
      ctx.fillStyle = '#c7a488';
      ctx.beginPath(); ctx.moveTo(1000, 745);
      ctx.bezierCurveTo(1160, 700, 1260, 640, 1400, 610);
      ctx.bezierCurveTo(1480, 592, 1540, 600, 1620, 640);
      ctx.bezierCurveTo(1720, 690, 1820, 712, 1960, 728); ctx.lineTo(1960, 760); ctx.lineTo(1000, 760); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,215,0.35)';
      ctx.beginPath(); ctx.moveTo(1400, 610); ctx.bezierCurveTo(1480, 592, 1540, 600, 1620, 640);
      ctx.bezierCurveTo(1540, 625, 1470, 625, 1400, 610); ctx.fill();
      ctx.fillStyle = '#e2c597';
      ctx.beginPath(); ctx.moveTo(-50, 750); ctx.bezierCurveTo(300, 715, 600, 735, 900, 742);
      ctx.bezierCurveTo(1200, 748, 1600, 730, 1980, 748); ctx.lineTo(1980, 780); ctx.lineTo(-50, 780); ctx.fill();
      for (const pl of palmsFar) drawPalm(ctx, pl, t);
    });

    // ground + path
    withPush(ctx, 1 + 0.5 * p, rise * 0.7, () => {
      const g = ctx.createLinearGradient(0, 740, 0, 1500);
      g.addColorStop(0, '#e6c48f'); g.addColorStop(1, '#bf8c57');
      ctx.fillStyle = g; ctx.fillRect(-2000, 744, 6000, 2000);
      ctx.fillStyle = 'rgba(255,240,210,0.55)';
      ctx.beginPath(); ctx.moveTo(930, 744); ctx.lineTo(990, 744); ctx.lineTo(1500, 1500); ctx.lineTo(420, 1500); ctx.fill();
      // palm grove shade band
      ctx.fillStyle = 'rgba(70,110,60,0.18)'; ctx.fillRect(-2000, 770, 6000, 70);
      for (const tf of tufts) {
        ctx.strokeStyle = tf.c; ctx.lineWidth = Math.max(1, tf.s * 0.08); ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = -3; k <= 3; k++) { ctx.moveTo(tf.x, tf.y); ctx.lineTo(tf.x + k * tf.s * 0.22, tf.y - tf.s * (1 - Math.abs(k) * 0.12)); }
        ctx.stroke();
      }
      for (const pl of palmsMid) drawPalm(ctx, pl, t);
    });

    // near palms
    withPush(ctx, 1 + 1.4 * p, rise, () => { for (const pl of palmsNear) drawPalm(ctx, pl, t); });

    // warm haze over everything
    const haze = ctx.createLinearGradient(0, 500, 0, 900);
    haze.addColorStop(0, 'rgba(255,225,170,0)'); haze.addColorStop(0.5, 'rgba(255,225,170,0.22)'); haze.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = haze; ctx.fillRect(0, 0, W, H);

    // foreground fronds framing the shot (out of focus, part as we move forward)
    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.strokeStyle = '#143823'; ctx.fillStyle = '#143823'; ctx.lineCap = 'round';
    const open = easeInOut(seg(t, 0.3, 2.6)) * 1000;
    const sc = 1 + 0.9 * p;
    const sway = Math.sin(t * 1.5) * 0.03;
    for (const side of [-1, 1]) {
      ctx.save();
      const ox = side < 0 ? -60 - open : W + 60 + open;
      ctx.translate(ox, 560 + rise); ctx.scale(-sc * side, sc);
      [[-0.75, 1000, 0.35], [-0.3, 1100, 0.45], [0.15, 980, 0.5], [0.55, 820, 0.4], [-1.1, 760, 0.25]].forEach(([a, len, d], i) => {
        drawFrond(ctx, 0, 0, a + sway * (i % 2 ? 1 : -1), len, d, 16, 210, 30);
      });
      ctx.restore();
    }
    ctx.restore();
  }

  // ======================================================================
  // Clouds (transition from ground to aerial)
  // ======================================================================
  const clouds = [];
  for (let i = 0; i < 46; i++) clouds.push({ x: rand(-200, 2120), y: rand(1100, 2900), r: rand(160, 420), sp: rand(0.8, 1.3) });

  function drawClouds(ctx, t) {
    const a = smooth(seg(t, 2.8, 3.35)) * (1 - smooth(seg(t, 3.55, 4.4)));
    if (a <= 0) return;
    const u = seg(t, 2.7, 4.5);
    ctx.save();
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#fbf6ee'; ctx.fillRect(0, 0, W, H);
    for (const c of clouds) {
      const y = c.y - u * 2600 * c.sp;
      const r = c.r * (1 + u * 0.8);
      if (y < -r || y > H + r) continue;
      const g = ctx.createRadialGradient(c.x, y, 0, c.x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,252,246,0.6)'); g.addColorStop(1, 'rgba(255,252,246,0)');
      ctx.globalAlpha = a; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ======================================================================
  // Scene B/C — stylised map of Al Ain, zooming into Zakher
  // (not to scale; 1 world unit ≈ 10 m around Zakher)
  // ======================================================================
  const AL_AIN = { x: 1300, y: 780 };
  const Z = { x: 1030, y: 1090 };                 // Zakher main intersection
  const GA = 0.71;                                // Zakher street grid angle
  const AX = { x: Math.cos(GA), y: Math.sin(GA) };
  const AY = { x: -Math.sin(GA), y: Math.cos(GA) };
  const g2w = (u, v) => ({ x: Z.x + u * AX.x + v * AY.x, y: Z.y + u * AX.y + v * AY.y });
  const TARGET = g2w(6, 6);                       // centre of the LifeHub plot
  const LAKE = g2w(-40, 44);
  const HAFEET = { x: 1130, y: 1470, rx: 78, ry: 290, rot: 0.12 };

  function blob(cx, cy, r, n, jitter, seed) {
    const rr = rng(seed), pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + (rr() - 0.5) * jitter;
      pts.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k * 0.9 });
    }
    return pts;
  }
  function pathSmooth(ctx, pts) {
    ctx.beginPath();
    const n = pts.length;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let m = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m.x, m.y);
    for (let i = 0; i < n; i++) { const p = pts[i], q = mid(p, pts[(i + 1) % n]); ctx.quadraticCurveTo(p.x, p.y, q.x, q.y); }
    ctx.closePath();
  }

  const dunes = [];
  for (let i = 0; i < 80; i++) dunes.push({ x: rand(-1200, 3600), y: rand(-800, 2800), r: rand(90, 380), light: R() > 0.5 });

  const urbanAlAin = blob(AL_AIN.x, AL_AIN.y, 270, 18, 0.35, 11);
  const urbanHili = blob(1290, 470, 120, 12, 0.4, 12);
  const urbanZakher = blob(Z.x - 10, Z.y + 10, 100, 14, 0.25, 13);

  const oases = [
    { ar: 'واحة العين', en: 'Al Ain Oasis', x: 1335, y: 835, r: 46 },
    { x: 1235, y: 655, r: 26 }, { x: 1370, y: 615, r: 22 }, { x: 1285, y: 480, r: 30 },
    { x: 1150, y: 760, r: 16 }, { x: 1450, y: 900, r: 18 },
    { x: TARGET.x + AX.x * 30 - AY.x * 26, y: TARGET.y + AX.y * 30 - AY.y * 26, r: 11 }, // neighbourhood park in Zakher
  ];
  const palmsDots = [];
  for (const o of oases) {
    const n = Math.round((o.r * o.r * Math.PI) / 6.5);
    for (let i = 0; i < n; i++) {
      let x, y;
      do { x = rand(-1, 1); y = rand(-1, 1); } while (x * x + y * y > 1);
      palmsDots.push({ x: o.x + x * o.r, y: o.y + y * o.r, r: rand(0.9, 1.5), c: ['#4f8a4a', '#5f9a52', '#3f7a42', '#6aa35a'][(R() * 4) | 0] });
    }
  }

  const roads = [
    { w: 7, min: 3.0, pts: [[1300, 780], [1050, 620], [500, 420], [-900, -60]] },               // to Abu Dhabi
    { w: 7, min: 3.0, pts: [[1300, 780], [1265, 420], [1200, -600]] },                          // to Dubai
    { w: 6, min: 3.0, pts: [[1300, 780], [Z.x + AY.x * -190, Z.y + AY.y * -190], [Z.x, Z.y], [Z.x + AY.x * 260, Z.y + AY.y * 260], [520, 1900]] }, // Zakher spine
    { w: 5, min: 2.6, pts: [[Z.x - AX.x * 420, Z.y - AX.y * 420], [Z.x, Z.y], [Z.x + AX.x * 160, Z.y + AX.y * 160], [1280, 1240], [1250, 1300]] }, // Zakher cross street
    { w: 4, min: 2.0, pts: [[1250, 1300], [1180, 1290], [1150, 1320], [1188, 1350], [1146, 1380], [1182, 1410], [1150, 1440]] }, // Jebel Hafeet climb
    { w: 5, min: 2.4, pts: [[1300, 780], [1700, 740], [2400, 660]] },
  ];
  const ring = { x: AL_AIN.x, y: AL_AIN.y, r: 185 };

  // tree lines along the Zakher roads
  const roadTrees = [];
  [roads[2], roads[3]].forEach((rd) => {
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [x0, y0] = rd.pts[i], [x1, y1] = rd.pts[i + 1];
      const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      for (let d = 2; d < L; d += 3.2) {
        const x = x0 + ((x1 - x0) * d) / L, y = y0 + ((y1 - y0) * d) / L;
        if (Math.hypot(x - Z.x, y - Z.y) < 4) continue;
        for (const s of [-1, 1]) roadTrees.push({ x: x + nx * s * 2.6, y: y + ny * s * 2.6, r: 0.8, c: '#4f8a4a' });
      }
    }
  });

  // Zakher neighbourhood: blocks of villas on a rotated grid
  const blocks = [];
  const roofs = ['#f7f1e6', '#efe4d0', '#e9dcc4', '#f4ece0', '#e7e0d4', '#f2e6d2'];
  for (let i = -8; i < 8; i++) {
    for (let j = -8; j < 8; j++) {
      const u = (i + 0.5) * 12, v = (j + 0.5) * 12;
      const w = g2w(u, v);
      if (Math.hypot(w.x - (Z.x - 10), w.y - (Z.y + 10)) > 92 + rand(-8, 8)) continue;
      if (Math.hypot(w.x - LAKE.x, w.y - LAKE.y) < 30) continue;
      const special = i === 0 && j === 0;
      const houses = [], trees = [];
      if (!special) {
        for (const a of [-1, 1]) for (const b of [-1, 1]) {
          if (R() < 0.1) continue;
          const hw = rand(2.6, 3.4), hh = rand(2.4, 3.2);
          houses.push({ x: a * 2.5 + rand(-0.4, 0.4), y: b * 2.5 + rand(-0.4, 0.4), w: hw, h: hh, c: roofs[(R() * roofs.length) | 0] });
        }
      }
      for (let k = 0; k < 7; k++) {
        const e = (R() * 4) | 0, s = rand(-4.4, 4.4);
        trees.push([[s, -4.5], [s, 4.5], [-4.5, s], [4.5, s]][e]);
      }
      blocks.push({ u, v, w, special, houses, trees });
    }
  }

  // camera
  const S0 = 0.6, S1 = 30;
  const C0 = { x: 1170, y: 960 };
  function camera(t) {
    const e = easeInOut(seg(t, 3.5, 8.4));
    let s = Math.exp(lerp(Math.log(S0), Math.log(S1), e));
    s *= 1 + 0.08 * smooth(seg(t, 8.4, 12));
    const d0x = (TARGET.x - C0.x) * S0, d0y = (TARGET.y - C0.y) * S0;
    const pinOffset = 60 * e; // keep the target slightly below centre so the pin is framed
    return { s, cx: TARGET.x - (d0x * (1 - e)) / s, cy: TARGET.y - (d0y * (1 - e) + pinOffset) / s, rot: lerp(-0.18, 0, easeOut(seg(t, 3.4, 8.4))) };
  }
  function w2s(cam, x, y) {
    const dx = (x - cam.cx) * cam.s, dy = (y - cam.cy) * cam.s;
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return { x: dx * c - dy * s + SCX, y: dx * s + dy * c + SCY };
  }

  function strokePolyline(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  function drawPalmCrown(ctx, d, s) {
    if (s > 9) {
      ctx.fillStyle = 'rgba(40,60,30,0.25)';
      ctx.beginPath(); ctx.arc(d.x + d.r * 0.35, d.y + d.r * 0.35, d.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.c;
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2, rr = k % 2 ? d.r * 0.45 : d.r * 1.1;
        const x = d.x + Math.cos(a) * rr, y = d.y + Math.sin(a) * rr;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = d.c;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function mapLabel(ctx, cam, ar, en, wx, wy, alpha, big) {
    if (alpha <= 0.001) return;
    const p = w2s(cam, wx, wy);
    const sa = big ? 46 : 32, se = big ? 20 : 15;
    const wa = measure(ctx, ar, sa, 700), we = measure(ctx, en, se, 700, 3);
    const bw = Math.max(wa, we) + 56, bh = big ? 104 : 80;
    const bx = p.x - bw / 2, by = p.y - bh - 26 - (1 - alpha) * 14;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(40,30,10,0.25)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,253,248,0.94)';
    roundRect(ctx, bx, by, bw, bh, 18); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.moveTo(p.x - 10, by + bh); ctx.lineTo(p.x + 10, by + bh); ctx.lineTo(p.x, by + bh + 12); ctx.fill();
    ctx.fillStyle = CONFIG.colors.greenDark;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    text(ctx, ar, p.x, by + bh * 0.38, { size: sa, weight: 700, color: CONFIG.colors.greenDark, rtl: true, alpha });
    text(ctx, en, p.x, by + bh * 0.76, { size: se, weight: 700, color: '#8a7656', spacing: 3, alpha });
  }

  function drawMap(ctx, t) {
    const cam = camera(t);
    const s = cam.s;
    const viewR = Math.hypot(W, H) / 2 / s + 4;
    const visible = (x, y, r = 0) => Math.abs(x - cam.cx) < viewR + r && Math.abs(y - cam.cy) < viewR + r;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CONFIG.colors.sand; ctx.fillRect(0, 0, W, H);
    ctx.translate(SCX, SCY); ctx.rotate(cam.rot); ctx.scale(s, s); ctx.translate(-cam.cx, -cam.cy);

    // dunes
    for (const d of dunes) {
      if (!visible(d.x, d.y, d.r)) continue;
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      const c = d.light ? '246,232,204' : '222,198,154';
      g.addColorStop(0, `rgba(${c},0.75)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }

    // Jebel Hafeet: shadow + terraced contour bands
    ctx.save();
    ctx.translate(HAFEET.x, HAFEET.y); ctx.rotate(HAFEET.rot);
    ctx.fillStyle = 'rgba(120,80,40,0.22)';
    ctx.beginPath(); ctx.ellipse(26, 14, HAFEET.rx * 1.05, HAFEET.ry * 1.02, 0, 0, Math.PI * 2); ctx.fill();
    const bands = ['#d9b994', '#cfab82', '#c49d73', '#b98f65', '#ad8259', '#a0764f', '#946b46'];
    bands.forEach((c, i) => {
      const f = 1 - i * 0.13;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(i * 3, -i * 6, HAFEET.rx * f, HAFEET.ry * f, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,30,0.25)'; ctx.lineWidth = 1.2 / s; ctx.stroke();
    });
    ctx.restore();

    // urban areas
    ctx.fillStyle = '#e4d8c3';
    for (const b of [urbanAlAin, urbanHili]) { pathSmooth(ctx, b); ctx.fill(); }
    ctx.fillStyle = '#ddd1bb'; pathSmooth(ctx, urbanZakher); ctx.fill();

    // oasis canopy wash
    for (const o of oases) {
      ctx.fillStyle = 'rgba(110,160,90,0.55)';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.02, 0, Math.PI * 2); ctx.fill();
    }

    // Zakher lake
    if (visible(LAKE.x, LAKE.y, 40)) {
      const lk = blob(LAKE.x, LAKE.y, 20, 10, 0.5, 21);
      ctx.fillStyle = '#86c9d8'; pathSmooth(ctx, lk); ctx.fill();
      ctx.strokeStyle = '#5aa9bf'; ctx.lineWidth = Math.max(0.4, 2 / s); ctx.stroke();
    }

    // Zakher blocks (fade in with zoom)
    const aGrid = smooth(seg(s, 2.2, 6));
    if (aGrid > 0) {
      ctx.save();
      ctx.globalAlpha = aGrid;
      ctx.translate(Z.x, Z.y); ctx.rotate(GA);
      for (const b of blocks) {
        if (!visible(b.w.x, b.w.y, 10)) continue;
        ctx.fillStyle = b.special ? '#e9f0e2' : '#efe6d4';
        ctx.fillRect(b.u - 5, b.v - 5, 10, 10);
        if (s > 5) {
          ctx.strokeStyle = 'rgba(160,140,110,0.6)'; ctx.lineWidth = 0.18;
          ctx.strokeRect(b.u - 4.9, b.v - 4.9, 9.8, 9.8);
          for (const h of b.houses) {
            ctx.fillStyle = 'rgba(90,70,40,0.25)';
            ctx.fillRect(b.u + h.x - h.w / 2 + 0.35, b.v + h.y - h.h / 2 + 0.35, h.w, h.h);
            ctx.fillStyle = h.c;
            ctx.fillRect(b.u + h.x - h.w / 2, b.v + h.y - h.h / 2, h.w, h.h);
          }
          for (const [x, y] of b.trees) drawPalmCrown(ctx, { x: b.u + x, y: b.v + y, r: 0.55, c: '#5a9450' }, s);
        }
      }
      ctx.restore();
    }

    // palm groves
    for (const d of palmsDots) if (visible(d.x, d.y, 2)) drawPalmCrown(ctx, d, s);
    if (aGrid > 0) for (const d of roadTrees) if (visible(d.x, d.y, 2)) drawPalmCrown(ctx, d, s);

    // roads
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const roadW = (px, min) => Math.max(px / s, min);
    ctx.strokeStyle = '#cdb68e';
    for (const r of roads) { ctx.lineWidth = roadW(r.w + 3, r.min + 0.7); strokePolyline(ctx, r.pts); }
    ctx.lineWidth = roadW(9, 3.7); ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fffaf0';
    for (const r of roads) { ctx.lineWidth = roadW(r.w, r.min); strokePolyline(ctx, r.pts); }
    ctx.lineWidth = roadW(6, 3); ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
    // centre lines when close
    if (s > 8) {
      ctx.save(); ctx.globalAlpha = smooth(seg(s, 8, 14));
      ctx.strokeStyle = '#e0b062'; ctx.lineWidth = 0.18; ctx.setLineDash([1.2, 1.2]);
      strokePolyline(ctx, roads[2].pts); strokePolyline(ctx, roads[3].pts);
      ctx.restore();
    }

    // the LifeHub plot
    if (aGrid > 0) {
      ctx.save();
      ctx.translate(Z.x, Z.y); ctx.rotate(GA); ctx.globalAlpha = aGrid;
      ctx.fillStyle = 'rgba(30,60,40,0.3)'; ctx.fillRect(2.4 + 0.5, 2.6 + 0.5, 7.2, 6.8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(2.4, 2.6, 7.2, 6.8);
      ctx.fillStyle = CONFIG.colors.green; ctx.fillRect(2.4, 2.6, 7.2, 1.2);
      ctx.fillStyle = '#cfe3d4'; ctx.fillRect(4.6, 5.0, 2.8, 2.6);
      [[1.6, 1.6], [10.4, 1.6], [1.6, 10.4], [10.4, 10.4]].forEach(([x, y]) => drawPalmCrown(ctx, { x, y, r: 0.75, c: '#3f7a42' }, s));
      const glow = fadeInOut(t, 9.0, 9.6, 10.4, 11.0);
      if (glow > 0) {
        ctx.globalAlpha = glow;
        ctx.strokeStyle = CONFIG.colors.gold; ctx.lineWidth = 0.35 + 0.15 * Math.sin(t * 8);
        ctx.strokeRect(1.2, 1.2, 9.6, 9.6);
      }
      ctx.restore();
    }

    // ---------------- screen-space labels & overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tin = (a) => smooth(seg(t, a, a + 0.6));
    mapLabel(ctx, cam, 'العين', 'AL AIN', AL_AIN.x - 60, AL_AIN.y - 150, tin(3.9) * (1 - smooth(seg(s, 1.3, 2.4))), true);
    mapLabel(ctx, cam, 'جبل حفيت', 'JEBEL HAFEET', HAFEET.x + 10, HAFEET.y - 120, tin(4.2) * (1 - smooth(seg(s, 1.2, 2.0))), false);
    mapLabel(ctx, cam, 'واحة العين', 'AL AIN OASIS', 1360, 860, tin(4.1) * (1 - smooth(seg(s, 1.0, 1.8))), false);
    mapLabel(ctx, cam, 'زاخر', 'ZAKHER', Z.x - 10, Z.y + 10, tin(4.7) * (1 - smooth(seg(s, 5, 9))), true);
    mapLabel(ctx, cam, 'بحيرة زاخر', 'ZAKHER LAKE', LAKE.x, LAKE.y, smooth(seg(s, 3, 5)) * (1 - smooth(seg(s, 9, 14))), false);

    // compass
    const ca = smooth(seg(t, 3.8, 4.4));
    if (ca > 0) {
      ctx.save();
      ctx.globalAlpha = ca * 0.9;
      ctx.translate(1800, 120); ctx.rotate(cam.rot);
      ctx.fillStyle = 'rgba(255,253,248,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = CONFIG.colors.greenDark;
      ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(10, 0); ctx.lineTo(-10, 0); ctx.fill();
      ctx.fillStyle = '#b9a07a';
      ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(10, 0); ctx.lineTo(-10, 0); ctx.fill();
      ctx.restore();
      text(ctx, 'N', 1800 + Math.sin(cam.rot) * 58, 120 - Math.cos(cam.rot) * 58, { size: 20, weight: 900, color: CONFIG.colors.greenDark, alpha: ca });
    }

    // vignette
    const v = ctx.createRadialGradient(SCX, SCY, 400, SCX, SCY, 1150);
    v.addColorStop(0, 'rgba(60,40,10,0)'); v.addColorStop(1, 'rgba(60,40,10,0.35)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    return cam;
  }

  // ======================================================================
  // Pin + logo
  // ======================================================================
  function leafPath(ctx, cx, cy, size, ang) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.bezierCurveTo(size * 0.55, size * 0.15, size * 0.45, -size * 0.35, 0, -size * 0.55);
    ctx.bezierCurveTo(-size * 0.45, -size * 0.35, -size * 0.55, size * 0.15, 0, size * 0.5);
    ctx.restore();
  }

  function drawPin(ctx, x, y, h, alpha = 1) {
    // (x, y) = tip of the pin
    const r = h * 0.36, cy = y - h + r;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(10,40,25,0.35)'; ctx.shadowBlur = h * 0.18; ctx.shadowOffsetY = h * 0.06;
    const g = ctx.createLinearGradient(x - r, cy - r, x + r, y);
    g.addColorStop(0, '#2fa577'); g.addColorStop(1, CONFIG.colors.greenDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - r * 0.35, y - h * 0.3, x - r, cy + r * 0.75, x - r, cy);
    ctx.arc(x, cy, r, Math.PI, 0);
    ctx.bezierCurveTo(x + r, cy + r * 0.75, x + r * 0.35, y - h * 0.3, x, y);
    ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fffdf6';
    ctx.beginPath(); ctx.arc(x, cy, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CONFIG.colors.green;
    leafPath(ctx, x - r * 0.1, cy + r * 0.04, r * 0.78, -0.55); ctx.fill();
    ctx.fillStyle = CONFIG.colors.gold;
    leafPath(ctx, x + r * 0.2, cy + r * 0.12, r * 0.5, 0.6); ctx.fill();
    ctx.strokeStyle = '#fffdf6'; ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.moveTo(x - r * 0.3, cy + r * 0.38); ctx.quadraticCurveTo(x - r * 0.05, cy, x + r * 0.08, cy - r * 0.38); ctx.stroke();
    ctx.restore();
  }

  const logoImg = new Image();
  let logoOk = false;
  const logoReady = new Promise((res) => {
    logoImg.onload = () => { logoOk = true; res(); };
    logoImg.onerror = () => res();
    logoImg.src = CONFIG.logoSrc;
  });

  function drawCaption(ctx, ar, en, alpha) {
    if (alpha <= 0) return;
    const off = (1 - alpha) * 24;
    ctx.save();
    const g = ctx.createLinearGradient(0, H - 300, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(5,25,15,0.55)');
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(0, H - 300, W, 300);
    ctx.restore();
    text(ctx, ar, SCX, H - 150 + off, { size: 60, weight: 900, color: '#fff', rtl: true, alpha, shadow: 'rgba(0,0,0,0.45)' });
    text(ctx, en, SCX, H - 82 + off, { size: 24, weight: 700, color: '#f3dfb4', spacing: 6, alpha, shadow: 'rgba(0,0,0,0.45)' });
  }

  // ======================================================================
  // Frame composer
  // ======================================================================
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const aCanvas = makeCanvas(), aCtx = aCanvas.getContext('2d');
  const mCanvas = makeCanvas(), mCtx = mCanvas.getContext('2d');

  function render(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none';
    ctx.fillStyle = '#0b1410'; ctx.fillRect(0, 0, W, H);

    let cam = null;
    if (t > 3.2) {
      cam = drawMap(mCtx, t);
      const blur = 16 * easeInOut(seg(t, 10.4, 11.4));
      ctx.save();
      if (blur > 0.2) {
        ctx.filter = `blur(${blur.toFixed(1)}px)`;
        const k = 1 + blur * 0.004;
        ctx.drawImage(mCanvas, (W - W * k) / 2, (H - H * k) / 2, W * k, H * k);
      } else ctx.drawImage(mCanvas, 0, 0);
      ctx.restore();
    }
    if (t < 3.6) {
      drawSceneA(aCtx, t);
      ctx.save(); ctx.globalAlpha = 1 - smooth(seg(t, 3.2, 3.55)); ctx.drawImage(aCanvas, 0, 0); ctx.restore();
    }
    drawClouds(ctx, t);

    // captions
    drawCaption(ctx, 'العين · مدينة الحدائق', 'AL AIN  —  THE GARDEN CITY', fadeInOut(t, 0.6, 1.2, 2.5, 3.0));
    drawCaption(ctx, 'عند سفوح جبل حفيت', 'AT THE FOOT OF JEBEL HAFEET', fadeInOut(t, 5.0, 5.6, 7.4, 7.9));
    drawCaption(ctx, 'نحن هنا · زاخر', 'WE ARE HERE  —  ZAKHER, AL AIN', fadeInOut(t, 9.0, 9.5, 10.3, 10.7));

    // pin + logo
    if (t > 8.5 && cam) {
      const tip = w2s(cam, TARGET.x, TARGET.y);
      const drop = easeOutBounce(seg(t, 8.5, 9.3));
      const toLogo = easeInOut(seg(t, 10.4, 11.3));
      const pinH = lerp(150, 230, toLogo);
      const px = lerp(tip.x, SCX, toLogo);
      const py = lerp(tip.y - (1 - drop) * 700, 410 + pinH * 0.5, toLogo);

      // overlay behind logo
      const ov = easeInOut(seg(t, 10.4, 11.4));
      if (ov > 0) {
        const g = ctx.createRadialGradient(SCX, 460, 100, SCX, 540, 1200);
        g.addColorStop(0, 'rgba(18,80,58,0.82)'); g.addColorStop(1, 'rgba(6,30,22,0.96)');
        ctx.save(); ctx.globalAlpha = ov; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      }

      // ground shadow + pulse rings (only while on the map)
      const onMap = 1 - toLogo;
      if (onMap > 0) {
        ctx.save();
        ctx.globalAlpha = onMap * drop * 0.35;
        ctx.fillStyle = '#0a2a1c';
        ctx.beginPath(); ctx.ellipse(tip.x, tip.y, 26 * drop, 9 * drop, 0, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 4; k++) {
          const tt = t - 9.05 - k * 0.55;
          if (tt < 0) continue;
          const u = (tt % 2.2) / 2.2;
          ctx.globalAlpha = onMap * (1 - u) * 0.9;
          ctx.strokeStyle = CONFIG.colors.gold; ctx.lineWidth = 5 * (1 - u) + 1;
          ctx.beginPath(); ctx.ellipse(tip.x, tip.y, 30 + u * 220, (30 + u * 220) * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }

      // logo emblem disc
      const disc = easeOutBack(seg(t, 10.9, 11.6));
      const logoCy = 400;
      if (disc > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(disc);
        ctx.fillStyle = '#fffdf6';
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40;
        ctx.beginPath(); ctx.arc(SCX, logoCy, 190 * disc, 0, Math.PI * 2); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = CONFIG.colors.gold; ctx.lineWidth = 8;
        const sweep = easeInOut(seg(t, 11.0, 11.9));
        ctx.beginPath(); ctx.arc(SCX, logoCy, 212, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep); ctx.stroke();
        ctx.restore();
      }

      const imgA = logoOk ? smooth(seg(t, 11.5, 12.1)) : 0;
      drawPin(ctx, px, py, pinH, drop > 0 ? 1 - imgA : 0);
      if (imgA > 0) {
        const box = 300, ratio = logoImg.width / logoImg.height;
        const iw = ratio >= 1 ? box : box * ratio, ih = ratio >= 1 ? box / ratio : box;
        ctx.save(); ctx.globalAlpha = imgA; ctx.drawImage(logoImg, SCX - iw / 2, logoCy - ih / 2, iw, ih); ctx.restore();
      }

      // wordmark + location
      if (CONFIG.showWordmark) {
        const wa = easeOut(seg(t, 11.4, 12.1));
        if (wa > 0) {
          const [a, b] = CONFIG.brand;
          const wA = measure(ctx, a, 128, 900), wB = measure(ctx, b, 128, 900);
          const x0 = SCX - (wA + wB) / 2, y = 720 + (1 - wa) * 30;
          text(ctx, a, x0, y, { size: 128, weight: 900, color: '#fffdf6', align: 'left', alpha: wa });
          text(ctx, b, x0 + wA, y, { size: 128, weight: 900, color: CONFIG.colors.gold, align: 'left', alpha: wa });
        }
      }
      const la = easeOut(seg(t, 11.9, 12.6));
      if (la > 0) {
        const lw = 460 * easeInOut(seg(t, 11.8, 12.6));
        ctx.save(); ctx.globalAlpha = la; ctx.fillStyle = CONFIG.colors.gold;
        ctx.fillRect(SCX - lw / 2, 812, lw, 3); ctx.restore();
        text(ctx, CONFIG.placeAr + ' — ' + CONFIG.countryAr, SCX, 868 + (1 - la) * 20, { size: 44, weight: 700, color: '#fffdf6', rtl: true, alpha: la });
        text(ctx, CONFIG.placeEn, SCX, 935 + (1 - la) * 20, { size: 26, weight: 700, color: '#f3dfb4', spacing: 8, alpha: smooth(seg(t, 12.1, 12.8)) });
      }
    }

    // fade from black at start
    const fin = 1 - smooth(seg(t, 0, 0.6));
    if (fin > 0) { ctx.fillStyle = `rgba(0,0,0,${fin})`; ctx.fillRect(0, 0, W, H); }
  }

  // ======================================================================
  // Boot
  // ======================================================================
  const fontsReady = Promise.all(
    [400, 700, 900].flatMap((w) => [document.fonts.load(`${w} 40px Cairo`, 'Abc'), document.fonts.load(`${w} 40px Cairo`, 'العين')])
  );
  const ready = Promise.all([fontsReady, logoReady]);

  window.SCENE = { W, H, FPS, DURATION, render, ready, canvas };

  if (!/[?&]render=1/.test(location.search)) {
    ready.then(() => {
      let start = performance.now();
      canvas.addEventListener('click', () => { start = performance.now(); });
      const loop = (now) => {
        const t = ((now - start) / 1000) % (DURATION + 1.5);
        render(Math.min(t, DURATION));
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }
})();

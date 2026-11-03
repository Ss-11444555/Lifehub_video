/*
 * Location ad engine: "from space to your door" advert, driven entirely by <project>/ad.json.
 *
 *   beats.space    hook text over the Earth (first ~2 s decide whether people keep watching)
 *   beats.country  camera dives; country label
 *   beats.city     city (+ landmark) labels
 *   beats.district district label
 *   beats.site     camera lands, tilts; pin drops; brand name card
 *   beats.offers   benefit cards, one by one, while the camera orbits the site
 *   beats.end      logo + call to action end card (held to the last frame)
 *
 * URL: /engine/index.html?w=1920&h=1080[&render=1]. Every frame is a pure function of t.
 */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const W = +q.get('w') || 1920, H = +q.get('h') || 1080, FPS = 30;
  const PORTRAIT = H > W, U = Math.min(W, H) / 1080; // layout unit
  const VFOV = (30 * Math.PI) / 180, TANV = Math.tan(VFOV / 2), ASPECT = W / H;
  const M = 3072;

  // ------------------------------------------------------------- helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (u) => u * u * (3 - 2 * u);
  const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const easeOutBack = (u) => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);
  const band = (x, a, b, c, d) => smooth(seg(x, a, b)) * (1 - smooth(seg(x, c, d)));
  const rad = (d) => (d * Math.PI) / 180;

  function monotone(keys) {
    const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = 0; m[n - 1] = 0;
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], u = (x - xs[i]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
    };
  }

  const v3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  };
  const sph = (lat, lon) => { const a = rad(lat), o = rad(lon); return [Math.cos(a) * Math.sin(o), Math.sin(a), Math.cos(a) * Math.cos(o)]; };
  const mercX = (lon) => (lon + 180) / 360;
  const mercY = (lat) => (1 - Math.asinh(Math.tan(rad(lat))) / Math.PI) / 2;
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });

  // ------------------------------------------------------------- state from ad.json
  let AD, B, T, MAN, TL, DURATION, zoomAt, ACCENT, MAXZ;
  const LEVEL_BANDS = { country: [3.4, 4.0, 7.4, 8.2], city: [8.8, 9.4, 11.8, 12.6], landmark: [9.2, 9.8, 11.4, 12.0], district: [12.2, 12.8, 15.0, 15.8] };

  // ------------------------------------------------------------- WebGL
  const glc = document.createElement('canvas'); glc.width = W; glc.height = H;
  const gl = glc.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  const QUAD_VS = 'attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos,0.0,1.0); }';
  const GLOBE_FS = `
    precision highp float;
    varying vec2 vNdc;
    uniform vec3 uCam, uRight, uUp, uFwd, uSun;
    uniform float uTan, uAspect;
    uniform sampler2D tGlobe, tP6, tP8;
    uniform vec4 uP6, uP8;
    const float PI = 3.14159265;
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    vec4 patch(sampler2D t, vec4 b, float z, float lon, float lat){
      float n = pow(2.0, z);
      float X = (lon/360.0+0.5)*n, Y = (1.0 - log(tan(lat)+1.0/cos(lat))/PI)/2.0*n;
      vec2 uv = vec2((X-b.x)/(b.z-b.x), (Y-b.y)/(b.w-b.y));
      float m = smoothstep(0.0,0.08,uv.x)*smoothstep(0.0,0.08,uv.y)*smoothstep(0.0,0.08,1.0-uv.x)*smoothstep(0.0,0.08,1.0-uv.y);
      return vec4(texture2D(t, clamp(uv,0.0,1.0)).rgb, m);
    }
    void main(){
      vec3 dir = normalize(uFwd + vNdc.x*uAspect*uTan*uRight + vNdc.y*uTan*uUp);
      float b = dot(uCam, dir), c = dot(uCam,uCam) - 1.0, disc = b*b - c;
      vec3 col;
      if (disc > 0.0 && -b - sqrt(disc) > 0.0) {
        vec3 p = normalize(uCam + dir*(-b - sqrt(disc)));
        float lat = asin(clamp(p.y,-1.0,1.0)), lon = atan(p.x, p.z);
        vec3 base = texture2D(tGlobe, vec2(lon/(2.0*PI)+0.5, 0.5 - lat/PI)).rgb;
        float lonD = degrees(lon);
        if (abs(lat) < 1.3) {
          vec4 p6 = patch(tP6, uP6, 6.0, lonD, lat); base = mix(base, p6.rgb, p6.a);
          vec4 p8 = patch(tP8, uP8, 8.0, lonD, lat); base = mix(base, p8.rgb, p8.a);
        }
        float ndl = dot(p, uSun);
        col = base * mix(0.05, 1.08, smoothstep(-0.12, 0.4, ndl));
        float view = clamp(dot(p, -dir), 0.0, 1.0);
        col = mix(col, vec3(0.42,0.64,1.0)*smoothstep(-0.2,0.5,ndl), pow(1.0 - view, 2.6)*0.75);
      } else {
        vec3 q = dir*420.0; vec3 cell = floor(q);
        float star = step(0.9965, hash(cell)) * smoothstep(0.55, 0.0, length(fract(q)-0.5)) * (0.5+0.5*hash(cell+3.1));
        col = vec3(0.004,0.006,0.016) + vec3(star)*vec3(0.85,0.9,1.0);
        float d = sqrt(max(c - b*b + 1.0, 0.0));
        if (b < 0.0) {
          vec3 closest = normalize(uCam + dir*(-b));
          col += vec3(0.32,0.56,1.0) * exp(-(d-1.0)*38.0) * 0.9 * smoothstep(-0.35, 0.5, dot(closest, uSun));
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }`;
  const PLANE_VS = `attribute vec2 aPos; uniform mat4 uMVP; uniform float uHalf; varying vec2 vUv; varying float vW;
    void main(){ vUv = aPos*0.5+0.5; vec4 p = uMVP*vec4(aPos.x*uHalf, 0.0, aPos.y*uHalf, 1.0); vW = p.w; gl_Position = p; }`;
  const PLANE_FS = `precision highp float; varying vec2 vUv; varying float vW; uniform sampler2D tMap; uniform float uAlpha, uFogNear, uFogFar;
    void main(){
      vec3 c = texture2D(tMap, vUv).rgb;
      c = mix(c, vec3(0.80,0.85,0.92), smoothstep(uFogNear, uFogFar, vW)*0.85);
      float e = smoothstep(0.0,0.03,vUv.x)*smoothstep(0.0,0.03,vUv.y)*smoothstep(0.0,0.03,1.0-vUv.x)*smoothstep(0.0,0.03,1.0-vUv.y);
      gl_FragColor = vec4(c, uAlpha*e);
    }`;
  const globeProg = program(QUAD_VS, GLOBE_FS), planeProg = program(PLANE_VS, PLANE_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  function texture(src, mip) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    const pot = (src.width & (src.width - 1)) === 0 && (src.height & (src.height - 1)) === 0;
    if (pot && mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, pot && mip ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, center, up) {
    const z = v3.norm(v3.sub(eye, center)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1];
  }
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }
  const project = (m, p) => {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return w <= 0 ? null : { x: (x / w * 0.5 + 0.5) * W, y: (0.5 - y / w * 0.5) * H };
  };

  // ------------------------------------------------------------- camera
  function camera(t) {
    const g = easeInOut(seg(t, 0, B.city));
    const s = AD.camera?.startFrom || { lat: T.lat - 10, lon: T.lon - 60 };
    return {
      zf: zoomAt(t),
      lat: lerp(s.lat, T.lat, g), lon: lerp(s.lon, T.lon, g),
      tilt: rad(AD.camera?.tilt ?? (PORTRAIT ? 36 : 50)) * easeInOut(seg(t, B.site + 0.3, B.offers + 1.6)),
      bearing: rad(AD.camera?.orbit ?? -32) * smooth(seg(t, B.site, DURATION)),
    };
  }
  const groundWidth = (zf, lat) => (156543.03 * Math.cos(rad(lat)) * W) / Math.pow(2, zf) / 6371000;
  function globeBasis(cam) {
    const h = groundWidth(cam.zf, cam.lat) / (2 * TANV * ASPECT);
    const p = sph(cam.lat, cam.lon), a = rad(cam.lat), o = rad(cam.lon);
    const north = [-Math.sin(a) * Math.sin(o), Math.cos(a), -Math.sin(a) * Math.cos(o)];
    const fwd = v3.scale(p, -1);
    return { eye: v3.scale(p, 1 + h), fwd, up: north, right: v3.cross(fwd, north) };
  }
  function globeProject(b, lat, lon) {
    const p = sph(lat, lon), v = v3.sub(p, b.eye);
    if (v3.dot(p, v3.scale(v, -1)) <= 0) return null;
    const z = v3.dot(v, b.fwd); if (z <= 0) return null;
    return { x: W / 2 + (v3.dot(v, b.right) / z / (TANV * ASPECT)) * W / 2, y: H / 2 - (v3.dot(v, b.up) / z / TANV) * H / 2 };
  }
  function planeMVP(cam) {
    const d = H / 2 / TANV, st = Math.sin(cam.tilt), ct = Math.cos(cam.tilt), sb = Math.sin(cam.bearing), cb = Math.cos(cam.bearing);
    return mul(perspective(VFOV, ASPECT, 20, d * 12), lookAt([d * st * sb, d * ct, d * st * cb], [0, 0, 0], [-sb * ct, st, -cb * ct]));
  }
  const planePoint = (lat, lon, zf) => { const n = Math.pow(2, zf) * 256; return [(mercX(lon) - mercX(T.lon)) * n, 0, (mercY(lat) - mercY(T.lat)) * n]; };

  // ------------------------------------------------------------- tiles
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = M; mapCanvas.height = M;
  const mctx = mapCanvas.getContext('2d');
  const levels = new Map(), MINZ = 9;
  function ensureLevel(z) {
    if (levels.has(z)) return levels.get(z).ready;
    const e = { tiles: new Map() };
    e.ready = Promise.all((MAN.pyramid[z] || []).map(([x, y]) => loadImg(`/p/tiles_graded/${z}/${x}_${y}.jpg`).then((im) => e.tiles.set(x + '_' + y, im)).catch(() => {})));
    levels.set(z, e);
    return e.ready;
  }
  function drawMapCanvas(zf) {
    const L = clamp(Math.ceil(zf - 1e-6), MINZ, MAXZ), s = Math.pow(2, zf - L);
    mctx.fillStyle = '#c9b49a'; mctx.fillRect(0, 0, M, M);
    for (const [lvl, scale] of [[L - 1, s * 2], [L, s]]) {
      const e = levels.get(lvl); if (!e) continue;
      const nn = Math.pow(2, lvl) * 256, cx = mercX(T.lon) * nn, cy = mercY(T.lat) * nn, size = 256 * scale + 0.6;
      for (const [k, im] of e.tiles) {
        const [x, y] = k.split('_').map(Number);
        const px = M / 2 + (x * 256 - cx) * scale, py = M / 2 + (y * 256 - cy) * scale;
        if (px > M || py > M || px + size < 0 || py + size < 0) continue;
        mctx.drawImage(im, px, py, size, size);
      }
    }
  }
  let mapTex = null;

  // ------------------------------------------------------------- 2D overlay
  const out = document.getElementById('out'); out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  function font(size, weight) { return `${weight} ${size}px Cairo, sans-serif`; }
  function text(str, x, y, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    let size = o.size || 40 * U;
    ctx.font = font(size, o.weight || 700);
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.spacing || 0) + 'px';
    if (o.maxWidth) { const w = ctx.measureText(str).width; if (w > o.maxWidth) { size *= o.maxWidth / w; ctx.font = font(size, o.weight || 700); } }
    ctx.fillStyle = o.color || '#fff';
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = o.rtl ? 'rtl' : 'ltr';
    if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = o.blur ?? 16 * U; ctx.shadowOffsetY = 2 * U; }
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  function measure(str, size, weight, spacing = 0) {
    ctx.save(); ctx.font = font(size, weight); if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    const w = ctx.measureText(str).width; ctx.restore(); return w;
  }

  function placeLabel(p, pl, a, t) {
    if (!p || a <= 0.001) return;
    const big = pl.level !== 'landmark', lift = (big ? 120 : 90) * U, rise = (1 - easeOut(a)) * 24 * U;
    ctx.save();
    ctx.globalAlpha = a;
    const pu = (t * 0.8) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - pu)})`; ctx.lineWidth = 2 * U;
    ctx.beginPath(); ctx.arc(p.x, p.y, (8 + pu * 26) * U, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 * U, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 10 * U); ctx.lineTo(p.x, p.y - 10 * U - (lift - 18 * U) * easeOut(a)); ctx.stroke();
    ctx.restore();
    const ty = p.y - lift - rise;
    text(pl.ar, p.x, ty - (big ? 30 : 22) * U, { size: (big ? 64 : 44) * U, weight: 900, rtl: true, alpha: a });
    if (pl.en) text(pl.en, p.x, ty + (big ? 22 : 14) * U, { size: (big ? 22 : 17) * U, weight: 700, spacing: 7 * U, color: '#f1e3c4', alpha: a });
  }

  function hook(t) {
    const h = AD.hook; if (!h) return;
    const a = band(t, 0.05, 0.45, B.country - 0.5, B.country);
    if (a <= 0) return;
    const y = PORTRAIT ? H * 0.3 : H * 0.36;
    const sc = lerp(1.12, 1, easeOut(seg(t, 0.05, 0.9)));
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.translate(-W / 2, -y);
    text(h.ar, W / 2, y, { size: (PORTRAIT ? 96 : 104) * U, weight: 900, rtl: true, alpha: a, maxWidth: W * 0.9, blur: 30 * U });
    ctx.restore();
    const lw = 260 * U * easeOut(seg(t, 0.3, 1.0));
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = ACCENT; ctx.fillRect(W / 2 - lw / 2, y + 78 * U, lw, 4 * U); ctx.restore();
    if (h.en) text(h.en, W / 2, y + 128 * U, { size: 26 * U, weight: 700, spacing: lerp(16, 8, easeOut(seg(t, 0.2, 1.2))) * U, color: '#f1e3c4', alpha: a * smooth(seg(t, 0.3, 0.8)), maxWidth: W * 0.9 });
  }

  function drawPin(x, y, h, alpha) {
    const r = h * 0.34, cy = y - h + r;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = h * 0.2; ctx.shadowOffsetY = h * 0.06;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - r * 0.35, y - h * 0.3, x - r, cy + r * 0.75, x - r, cy);
    ctx.arc(x, cy, r, Math.PI, 0);
    ctx.bezierCurveTo(x + r, cy + r * 0.75, x + r * 0.35, y - h * 0.3, x, y); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.arc(x, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function siteMarker(p, t) {
    if (!p) return;
    const t0 = B.site + 0.15, drop = seg(t, t0, t0 + 0.6);
    if (drop <= 0) return;
    const fade = 1 - smooth(seg(t, B.end - 0.2, B.end + 0.4));
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const tt = t - t0 - 0.6 - k * 0.6; if (tt < 0) continue;
      const u = (tt % 1.8) / 1.8;
      ctx.globalAlpha = fade * (1 - u) * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = (3 * (1 - u) + 1) * U;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, (20 + u * 170) * U, (20 + u * 170) * 0.62 * U, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    drawPin(p.x, p.y - (1 - easeOutBack(drop)) * 240 * U, 110 * U, fade * clamp(drop * 3));
    // brand name card (until the offers take over)
    const a = band(t, B.site + 0.5, B.site + 1.1, B.offers - 0.1, B.offers + 0.4);
    if (a > 0) {
      const x = PORTRAIT ? W / 2 : p.x - 90 * U, y = PORTRAIT ? p.y - 330 * U : p.y - 150 * U;
      const al = PORTRAIT ? 'center' : 'right';
      const nw = Math.min(W * 0.9, Math.max(measure(AD.brand.nameAr, 64 * U, 900), measure(AD.brand.nameEn || '', 22 * U, 700, 8 * U)) + 70 * U);
      const nx = PORTRAIT ? x - nw / 2 : x - nw + 35 * U;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(12,22,18,0.62)'; ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24 * U;
      ctx.beginPath(); ctx.roundRect(nx, y - 70 * U, nw, 150 * U, 22 * U); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = ACCENT; ctx.fillRect(PORTRAIT ? x - 40 * U : x - 60 * U, y + 18 * U, 80 * U, 3 * U); ctx.restore();
      text(AD.brand.nameAr, x, y - 18 * U, { size: 64 * U, weight: 900, rtl: true, align: al, alpha: a, maxWidth: W * 0.9 });
      if (AD.brand.nameEn) text(AD.brand.nameEn, x, y + 46 * U, { size: 22 * U, weight: 700, spacing: 8 * U, align: al, color: '#f1e3c4', alpha: a });
    }
  }

  // simple line icons, drawn in a unit box centred at (0,0), size ~1
  const ICONS = {
    family(c) { c.beginPath(); c.arc(-0.22, -0.28, 0.13, 0, 7); c.moveTo(0.35, -0.28); c.arc(0.22, -0.28, 0.13, 0, 7); c.moveTo(0.1, 0.02); c.arc(0, 0.02, 0.09, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(-0.4, 0.42); c.lineTo(-0.4, 0.05); c.quadraticCurveTo(-0.22, -0.1, -0.05, 0.05); c.moveTo(0.05, 0.05); c.quadraticCurveTo(0.22, -0.1, 0.4, 0.05); c.lineTo(0.4, 0.42); c.moveTo(-0.12, 0.42); c.lineTo(-0.12, 0.22); c.quadraticCurveTo(0, 0.12, 0.12, 0.22); c.lineTo(0.12, 0.42); c.stroke(); },
    kids(c) { ICONS.family(c); },
    sports(c) { c.beginPath(); c.arc(0, 0, 0.42, 0, 7); c.moveTo(-0.42, 0); c.quadraticCurveTo(0, -0.18, 0.42, 0); c.moveTo(-0.3, 0.3); c.quadraticCurveTo(0, 0.05, 0.3, 0.3); c.moveTo(0, -0.42); c.lineTo(0, 0.42); c.stroke(); },
    events(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.18 : 0.44, a = -Math.PI / 2 + i * Math.PI / 5; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.stroke(); },
    nature(c) { c.beginPath(); c.moveTo(0, 0.45); c.lineTo(0, -0.05); c.moveTo(0, 0.1); c.quadraticCurveTo(-0.45, 0.05, -0.38, -0.35); c.quadraticCurveTo(-0.05, -0.3, 0, 0.1); c.moveTo(0, -0.05); c.quadraticCurveTo(0.42, -0.1, 0.35, -0.45); c.quadraticCurveTo(0.02, -0.4, 0, -0.05); c.stroke(); },
    food(c) { c.beginPath(); c.moveTo(-0.38, -0.1); c.lineTo(0.3, -0.1); c.lineTo(0.24, 0.3); c.quadraticCurveTo(-0.04, 0.42, -0.32, 0.3); c.closePath(); c.moveTo(0.3, 0.0); c.quadraticCurveTo(0.48, 0.02, 0.28, 0.18); c.moveTo(-0.15, -0.22); c.quadraticCurveTo(-0.22, -0.35, -0.12, -0.45); c.moveTo(0.05, -0.22); c.quadraticCurveTo(-0.02, -0.35, 0.08, -0.45); c.stroke(); },
    star(c) { ICONS.events(c); },
  };

  function offers(t) {
    const list = AD.offers || []; if (!list.length) return;
    const out_ = 1 - smooth(seg(t, B.end - 0.35, B.end + 0.1));
    if (t < B.offers || out_ <= 0) return;
    // shade the side the cards sit on so they read over busy imagery
    ctx.save();
    const sh = smooth(seg(t, B.offers, B.offers + 0.5)) * out_;
    const g = PORTRAIT ? ctx.createLinearGradient(0, H, 0, H * 0.35) : ctx.createLinearGradient(W, 0, W * 0.45, 0);
    g.addColorStop(0, `rgba(0,0,0,${0.6 * sh})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const cw = PORTRAIT ? W * 0.84 : 640 * U, ch = 128 * U, gap = 28 * U;
    const total = list.length * ch + (list.length - 1) * gap;
    const x0 = PORTRAIT ? (W - cw) / 2 : W - cw - 90 * U;
    const y0 = PORTRAIT ? H * 0.66 - total / 2 : H * 0.5 - total / 2 - 30 * U;
    const step = Math.min(1.0, (B.end - B.offers - 1.2) / Math.max(1, list.length));
    list.forEach((o, i) => {
      const ti = B.offers + 0.25 + i * step;
      const a = smooth(seg(t, ti, ti + 0.45)) * out_;
      if (a <= 0) return;
      const slide = (1 - easeOut(seg(t, ti, ti + 0.6))) * 80 * U;
      const x = x0 + (PORTRAIT ? 0 : slide), y = y0 + i * (ch + gap) + (PORTRAIT ? slide * 0.6 : 0);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30 * U; ctx.shadowOffsetY = 10 * U;
      ctx.fillStyle = 'rgba(12,22,18,0.72)';
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 22 * U); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.roundRect(x + cw - 8 * U, y + 18 * U, 8 * U, ch - 36 * U, 4 * U); ctx.fill();
      // icon (right side, Arabic reading order)
      const icx = x + cw - 82 * U, icy = y + ch / 2;
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5 * U;
      ctx.beginPath(); ctx.arc(icx, icy, 40 * U, 0, Math.PI * 2); ctx.stroke();
      ctx.translate(icx, icy); ctx.scale(52 * U, 52 * U); ctx.lineWidth = 2.6 / 52; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      (ICONS[o.icon] || ICONS.star)(ctx);
      ctx.restore();
      const tx = x + cw - 150 * U, maxw = cw - 190 * U;
      text(o.ar, tx, y + ch * 0.4, { size: 44 * U, weight: 900, rtl: true, align: 'right', alpha: a, maxWidth: maxw, shadow: false });
      if (o.en) text(o.en, tx, y + ch * 0.76, { size: 17 * U, weight: 700, spacing: 5 * U, align: 'right', color: '#e9d9b3', alpha: a, maxWidth: maxw, shadow: false });
    });
  }

  let logo = null;
  function endCard(t) {
    const a = smooth(seg(t, B.end, B.end + 0.6));
    if (a <= 0) return;
    const photo = AD.brand.logoKind === 'photo';
    ctx.save(); ctx.globalAlpha = a;
    // background: blurred logo photo, or blurred current frame + brand tint
    if (photo) {
      ctx.filter = 'blur(28px) brightness(0.4) saturate(0.8)';
      const bs = Math.max(W / logo.width, H / logo.height) * 1.15;
      ctx.drawImage(logo, (W - logo.width * bs) / 2, (H - logo.height * bs) / 2, logo.width * bs, logo.height * bs);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = AD.brand.background || '#0d1f18'; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    const iw = logo.width, ih = logo.height;
    const fitW = PORTRAIT ? W * 0.9 : W * 0.7, fitH = PORTRAIT ? H * 0.3 : H * 0.48;
    const fitS = Math.min(fitW / iw, fitH / ih);
    const settle = photo ? easeInOut(seg(t, B.end + 1.3, B.end + 2.3)) : 1;
    const logoCy = PORTRAIT ? H * 0.36 : H * 0.36;
    ctx.save(); ctx.globalAlpha = a;
    if (photo) {
      // full-bleed pan across the real sign, then settle into a framed card
      const pan = easeInOut(seg(t, B.end, B.end + 1.6));
      const coverS = Math.max(H / ih, W / iw) * 1.02;
      const s = lerp(coverS, fitS, settle);
      const dw = iw * s, dh = ih * s;
      const x = lerp(lerp(W - dw, 0, pan), (W - dw) / 2, settle), y = lerp((H - dh) / 2, logoCy - dh / 2, settle);
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50 * U * settle; ctx.shadowOffsetY = 18 * U * settle;
      ctx.beginPath(); ctx.roundRect(x, y, dw, dh, 18 * U * settle); ctx.save(); ctx.clip();
      ctx.filter = 'contrast(1.08) saturate(0.92)'; ctx.drawImage(logo, x, y, dw, dh); ctx.filter = 'none';
      const sw = seg(t, B.end + 2.3, B.end + 3.4);
      if (sw > 0 && sw < 1) {
        const sx = lerp(x - 400 * U, x + dw + 400 * U, easeInOut(sw));
        const g = ctx.createLinearGradient(sx - 220 * U, y, sx + 220 * U, y + dh * 0.3);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,235,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x, y, dw, dh);
      }
      ctx.restore();
    } else {
      const s = fitS * lerp(0.85, 1, easeOutBack(seg(t, B.end + 0.1, B.end + 0.9)));
      ctx.drawImage(logo, W / 2 - iw * s / 2, logoCy - ih * s / 2, iw * s, ih * s);
    }
    ctx.restore();

    // call to action
    const cta = AD.cta; if (!cta) return;
    const ca = smooth(seg(t, B.end + (photo ? 1.9 : 0.8), B.end + (photo ? 2.5 : 1.4)));
    if (ca <= 0) return;
    const by = logoCy + fitH / 2 + (PORTRAIT ? 120 : 92) * U;
    const pw = measure(cta.ar, 58 * U, 900) + 110 * U, ph = 104 * U;
    const pop = easeOutBack(seg(t, B.end + (photo ? 1.9 : 0.8), B.end + (photo ? 2.6 : 1.5)));
    ctx.save(); ctx.globalAlpha = ca; ctx.translate(W / 2, by); ctx.scale(pop, pop);
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30 * U; ctx.shadowOffsetY = 8 * U;
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fill();
    ctx.restore();
    text(cta.ar, W / 2, by + 2 * U, { size: 58 * U, weight: 900, rtl: true, color: '#14231c', alpha: ca * clamp(pop), shadow: false });
    if (cta.en) text(cta.en, W / 2, by + ph / 2 + 44 * U, { size: 24 * U, weight: 700, spacing: 10 * U, color: '#fff', alpha: ca });
    const la = smooth(seg(t, B.end + (photo ? 2.4 : 1.3), B.end + (photo ? 3.0 : 1.9)));
    if (cta.subAr) text(cta.subAr, W / 2, by + ph / 2 + 116 * U, { size: 42 * U, weight: 700, rtl: true, alpha: la, maxWidth: W * 0.9 });
    if (cta.subEn) text(cta.subEn, W / 2, by + ph / 2 + 168 * U, { size: 20 * U, weight: 700, spacing: 7 * U, color: '#e8d6ae', alpha: la, maxWidth: W * 0.9 });
  }

  function subtitles(t) {
    for (const l of TL.lines) {
      if (l.subtitle === false) continue;
      const a = band(t, l.start - 0.1, l.start + 0.2, l.start + l.duration + 0.1, l.start + l.duration + 0.4);
      if (a <= 0) continue;
      const y = PORTRAIT ? H * 0.8 : H - 96 * U;
      ctx.save();
      const g = ctx.createLinearGradient(0, y - 140 * U, 0, y + 120 * U);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, y - 140 * U, W, 260 * U);
      ctx.restore();
      text(l.text, W / 2, y + (1 - a) * 10 * U, { size: (PORTRAIT ? 50 : 46) * U, weight: 700, rtl: true, alpha: a, blur: 20 * U, maxWidth: W * 0.9 });
    }
  }

  // ------------------------------------------------------------- frame
  const TEX = {};
  async function render(t) {
    const cam = camera(t);
    const mapA = smooth(seg(cam.zf, 8.0, 8.7));
    const showMap = mapA > 0 && t < B.end + 0.7;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    let gb = null, mvp = null;
    if (mapA < 1) {
      gb = globeBasis(cam);
      const P = globeProg; gl.useProgram(P.p);
      const loc = gl.getAttribLocation(P.p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(P.u.uCam, gb.eye); gl.uniform3fv(P.u.uRight, gb.right); gl.uniform3fv(P.u.uUp, gb.up); gl.uniform3fv(P.u.uFwd, gb.fwd);
      gl.uniform3fv(P.u.uSun, v3.norm(sph(T.lat - 6, T.lon - 24)));
      gl.uniform1f(P.u.uTan, TANV); gl.uniform1f(P.u.uAspect, ASPECT);
      const p6 = MAN.patch6, p8 = MAN.patch8;
      gl.uniform4f(P.u.uP6, p6.x0, p6.y0, p6.x1, p6.y1); gl.uniform4f(P.u.uP8, p8.x0, p8.y0, p8.x1, p8.y1);
      [['tGlobe', TEX.globe], ['tP6', TEX.p6], ['tP8', TEX.p8]].forEach(([n, tx], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(P.u[n], i); });
      gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (showMap) {
      if (cam.tilt > 0.01) { gl.clearColor(0.80, 0.85, 0.92, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      const L = clamp(Math.ceil(cam.zf - 1e-6), MINZ, MAXZ);
      await Promise.all([ensureLevel(L), ensureLevel(Math.max(MINZ, L - 1))]);
      for (const z of [...levels.keys()]) if (z < L - 1 || z > L + 1) levels.delete(z);
      if (L < MAXZ) ensureLevel(L + 1);
      drawMapCanvas(cam.zf);
      gl.activeTexture(gl.TEXTURE0);
      if (!mapTex) mapTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, mapCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      mvp = planeMVP(cam);
      const P = planeProg; gl.useProgram(P.p);
      const loc = gl.getAttribLocation(P.p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(P.u.uMVP, false, new Float32Array(mvp));
      gl.uniform1f(P.u.uHalf, M / 2); gl.uniform1f(P.u.uAlpha, mapA);
      const d = H / 2 / TANV; gl.uniform1f(P.u.uFogNear, d * 1.05); gl.uniform1f(P.u.uFogFar, d * 2.4);
      gl.uniform1i(P.u.tMap, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.filter = 'saturate(1.12) contrast(1.06)'; ctx.drawImage(glc, 0, 0); ctx.filter = 'none';
    if (cam.tilt > 0.01 && t < B.end + 0.7) {
      const k = cam.tilt / rad(AD.camera?.tilt ?? (PORTRAIT ? 36 : 50));
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.45);
      g.addColorStop(0, `rgba(205,220,236,${0.75 * k})`); g.addColorStop(1, 'rgba(205,220,236,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.45);
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

    const where = (lat, lon) => (mapA >= 0.5 && mvp ? project(mvp, planePoint(lat, lon, cam.zf)) : gb ? globeProject(gb, lat, lon) : null);
    for (const pl of AD.places || []) {
      const a = band(cam.zf, ...(pl.zoomBand || LEVEL_BANDS[pl.level] || LEVEL_BANDS.city));
      if (a > 0) placeLabel(where(pl.lat, pl.lon), pl, a, t);
    }
    hook(t);
    if (mvp && t < B.end + 0.5) siteMarker(project(mvp, [0, 0, 0]), t);
    offers(t);
    endCard(t);
    subtitles(t);
    const attrA = 1 - smooth(seg(t, B.end, B.end + 0.5));
    if (attrA > 0) text('Imagery © Esri, Maxar, Earthstar Geographics', PORTRAIT ? W / 2 : W - 28 * U, H - 26 * U, { size: 14 * U, weight: 400, align: PORTRAIT ? 'center' : 'right', color: 'rgba(255,255,255,0.7)', alpha: attrA, blur: 6 });
    const fin = 1 - smooth(seg(t, 0, 0.35));
    if (fin > 0) { ctx.fillStyle = `rgba(0,0,0,${fin})`; ctx.fillRect(0, 0, W, H); }
  }

  const ready = (async () => {
    AD = await (await fetch('/p/ad.json')).json();
    MAN = await (await fetch('/p/earth/manifest.json')).json();
    try { TL = await (await fetch('/p/build/timeline.json')).json(); } catch (e) { TL = { lines: [] }; }
    B = AD.beats; T = AD.target; DURATION = AD.duration; ACCENT = AD.brand.accent || '#d9b46a'; MAXZ = AD.maxZoom || 19;
    const Z = AD.camera?.zoom || {};
    zoomAt = monotone(AD.camera?.zoomKeys || [
      [0, Z.start ?? 2.0], [B.country, Z.country ?? 5.2], [B.city, Z.city ?? 10.3], [B.district, Z.district ?? 13.4],
      [B.site, Z.site ?? 16.6], [B.offers, Z.offers ?? 17.4], [B.end, Z.end ?? 17.9], [DURATION, (Z.end ?? 17.9) + 0.1],
    ]);
    const [globe, p6, p8, lg] = await Promise.all(['/p/earth/globe.jpg', '/p/earth/patch6.jpg', '/p/earth/patch8.jpg', '/p/' + AD.brand.logo].map(loadImg));
    TEX.globe = texture(globe, true); TEX.p6 = texture(p6); TEX.p8 = texture(p8); logo = lg;
    await Promise.all([400, 700, 900].flatMap((w) => [document.fonts.load(`${w} 40px Cairo`, 'Abc'), document.fonts.load(`${w} 40px Cairo`, 'العين')]));
  })();

  window.SCENE = { W, H, FPS, get DURATION() { return DURATION; }, render, ready, canvas: out };
  if (q.get('render') !== '1') ready.then(() => {
    const start = performance.now(); let busy = false;
    const loop = async (now) => { if (!busy) { busy = true; await render(((now - start) / 1000) % DURATION); busy = false; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
})();

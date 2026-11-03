/*
 * Life Hub Park — "from space to Zakher" location video.
 *
 * One continuous camera move driven by an equivalent map zoom `zf(t)`:
 *   - zf < ~8.6  : WebGL globe (equirectangular Earth + high-res regional patches, atmosphere, stars)
 *   - zf > ~8.0  : satellite tile pyramid drawn to a canvas and shown on a WebGL plane
 *                  (so the camera can tilt and orbit at the end, Google-Earth style)
 *   - end card   : the real Life Hub Park sign photo
 * Overlays (labels, pin, subtitles, attribution) are drawn on a 2D canvas.
 * Everything is a pure function of `t`, so render.js can export frame-exact video.
 */
(() => {
  'use strict';

  const W = 1920, H = 1080, FPS = 30, DURATION = 35;
  const VFOV = (30 * Math.PI) / 180, TANV = Math.tan(VFOV / 2), ASPECT = W / H;
  const M = 3072; // map canvas size (px)

  // ------------------------------------------------------------- timeline
  // narration start times (s); durations come from assets/voice/lines.json
  let VO = {}; // filled from config.json
  // camera: [time, equivalent zoom]
  const ZOOM_KEYS = [[0, 1.75], [3, 2.35], [5.4, 3.5], [8.6, 6.3], [10.2, 8.2], [13.4, 10.9], [15.4, 12.3], [18.0, 14.3], [20.0, 15.6], [23.0, 17.6], [26.5, 18.35]];
  const END_START = 25.6; // crossfade into the sign

  const PLACES = {
    uae: { lat: 23.75, lon: 54.4, ar: 'الإمارات العربية المتحدة', en: 'UNITED ARAB EMIRATES', z: [4.6, 5.2, 7.2, 7.9], big: true },
    alain: { lat: 24.2075, lon: 55.7447, ar: 'العين', en: 'AL AIN', z: [9.4, 10.0, 12.2, 12.9], big: true },
    hafeet: { lat: 24.06, lon: 55.775, ar: 'جبل حفيت', en: 'JEBEL HAFEET', z: [9.8, 10.4, 11.6, 12.2] },
    zakher: { lat: 24.1525, lon: 55.7015, ar: 'زاخر', en: 'ZAKHER', z: [12.6, 13.2, 15.3, 15.9], big: true },
  };

  // ------------------------------------------------------------- helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (u) => u * u * (3 - 2 * u);
  const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const band = (x, a, b, c, d) => smooth(seg(x, a, b)) * (1 - smooth(seg(x, c, d)));
  const rad = (d) => (d * Math.PI) / 180;

  // monotone cubic (Fritsch–Carlson) so the camera never stops between keys
  function monotone(keys) {
    const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = 0; m[n - 1] = 0; // ease in / ease out at the ends
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
  const zoomAt = monotone(ZOOM_KEYS);

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

  // ------------------------------------------------------------- assets
  let CFG, MANIFEST, LINES;
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });

  // ------------------------------------------------------------- WebGL
  const glc = document.createElement('canvas'); glc.width = W; glc.height = H;
  const gl = glc.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }

  const GLOBE_FS = `
    precision highp float;
    varying vec2 vNdc;
    uniform vec3 uCam, uRight, uUp, uFwd, uSun;
    uniform float uTan, uAspect, uTime;
    uniform sampler2D tGlobe, tP6, tP8;
    uniform vec4 uP6, uP8; // x0,y0,x1,y1 in tiles
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
        if (abs(lat) < 1.2) {
          vec4 p6 = patch(tP6, uP6, 6.0, lonD, lat); base = mix(base, p6.rgb, p6.a);
          vec4 p8 = patch(tP8, uP8, 8.0, lonD, lat); base = mix(base, p8.rgb, p8.a);
        }
        float ndl = dot(p, uSun);
        float light = mix(0.05, 1.08, smoothstep(-0.12, 0.4, ndl));
        col = base * light;
        // ocean glint + atmosphere
        float view = clamp(dot(p, -dir), 0.0, 1.0);
        float rim = pow(1.0 - view, 2.6);
        col = mix(col, vec3(0.42,0.64,1.0)*smoothstep(-0.2,0.5,ndl), rim*0.75);
        col += vec3(0.08,0.12,0.2)*(1.0-view)*smoothstep(-0.2,0.5,ndl)*0.6;
      } else {
        // stars
        vec3 q = dir*420.0; vec3 cell = floor(q);
        float h = hash(cell);
        float star = step(0.9965, h) * smoothstep(0.55, 0.0, length(fract(q)-0.5)) * (0.5+0.5*hash(cell+3.1));
        col = vec3(0.004,0.006,0.016) + vec3(star)*vec3(0.85,0.9,1.0);
        // atmosphere halo
        float d = sqrt(max(c - b*b + 1.0, 0.0)); // distance of ray to centre
        if (b < 0.0) {
          vec3 closest = normalize(uCam + dir*(-b));
          float sunF = smoothstep(-0.35, 0.5, dot(closest, uSun));
          col += vec3(0.32,0.56,1.0) * exp(-(d-1.0)*38.0) * 0.9 * sunF;
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }`;
  const QUAD_VS = `attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos,0.0,1.0); }`;

  const PLANE_VS = `
    attribute vec2 aPos; uniform mat4 uMVP; uniform float uHalf; varying vec2 vUv; varying vec4 vClip;
    void main(){ vUv = aPos*0.5+0.5; vec4 p = uMVP*vec4(aPos.x*uHalf, 0.0, aPos.y*uHalf, 1.0); vClip = p; gl_Position = p; }`;
  const PLANE_FS = `
    precision highp float; varying vec2 vUv; varying vec4 vClip; uniform sampler2D tMap; uniform float uAlpha, uFogNear, uFogFar;
    void main(){
      vec3 c = texture2D(tMap, vUv).rgb;
      float dist = vClip.w;
      float fog = smoothstep(uFogNear, uFogFar, dist);
      c = mix(c, vec3(0.80,0.85,0.92), fog*0.85);
      float edge = smoothstep(0.0,0.03,vUv.x)*smoothstep(0.0,0.03,vUv.y)*smoothstep(0.0,0.03,1.0-vUv.x)*smoothstep(0.0,0.03,1.0-vUv.y);
      gl_FragColor = vec4(c, uAlpha*edge);
    }`;

  const globeProg = program(QUAD_VS, GLOBE_FS);
  const planeProg = program(PLANE_VS, PLANE_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  function texture(src, opts = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    const pot = (src.width & (src.width - 1)) === 0 && (src.height & (src.height - 1)) === 0;
    if (pot && opts.mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.repeat && pot ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ------------------------------------------------------------- matrices (column-major)
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
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  const project = (m, p) => {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return w <= 0 ? null : { x: (x / w * 0.5 + 0.5) * W, y: (0.5 - y / w * 0.5) * H, w };
  };

  // ------------------------------------------------------------- camera
  function camera(t) {
    const zf = zoomAt(t);
    const T = CFG.target;
    // globe heading: from Africa/Atlantic to the target
    const g = easeInOut(seg(t, 0, 9.0));
    const lat = lerp(14, T.lat, g), lon = lerp(-8, T.lon, g);
    const tilt = rad(48) * easeInOut(seg(t, 19.2, 25.0));
    const bearing = rad(-28) * smooth(seg(t, 18.5, 35));
    return { zf, lat, lon, tilt, bearing };
  }
  // ground width shown across the screen, in Earth radii
  const groundWidth = (zf, lat) => (156543.03 * Math.cos(rad(lat)) * W) / Math.pow(2, zf) / 6371000;

  // ------------------------------------------------------------- tile pyramid
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = M; mapCanvas.height = M;
  const mctx = mapCanvas.getContext('2d');
  const levels = new Map();
  async function ensureLevel(z) {
    if (levels.has(z)) return levels.get(z).ready;
    const list = MANIFEST.pyramid[z] || [];
    const entry = { tiles: new Map(), ready: null };
    entry.ready = Promise.all(list.map(([x, y]) => loadImg(`tiles_graded/${z}/${x}_${y}.jpg`).then((im) => entry.tiles.set(x + '_' + y, im)).catch(() => {})));
    levels.set(z, entry);
    return entry.ready;
  }
  function evict(keep) { for (const z of [...levels.keys()]) if (!keep.includes(z)) levels.delete(z); }

  const MINZ = 9;
  function drawMapCanvas(zf) {
    const maxZ = CFG.maxZoom;
    const L = clamp(Math.ceil(zf - 1e-6), MINZ, maxZ), s = Math.pow(2, zf - L);
    const n = Math.pow(2, L) * 256;
    const cx = mercX(CFG.target.lon) * n, cy = mercY(CFG.target.lat) * n;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = '#c9b49a'; mctx.fillRect(0, 0, M, M);
    // under-layer from the previous level fills any holes
    for (const [lvl, scale] of [[L - 1, s * 2], [L, s]]) {
      const e = levels.get(lvl); if (!e) continue;
      const nn = Math.pow(2, lvl) * 256, ccx = mercX(CFG.target.lon) * nn, ccy = mercY(CFG.target.lat) * nn;
      const size = 256 * scale + 0.6;
      for (const [k, im] of e.tiles) {
        const [x, y] = k.split('_').map(Number);
        const px = M / 2 + (x * 256 - ccx) * scale, py = M / 2 + (y * 256 - ccy) * scale;
        if (px > M || py > M || px + size < 0 || py + size < 0) continue;
        mctx.drawImage(im, px, py, size, size);
      }
    }
    return { L, s, n, cx, cy };
  }
  let mapTex = null;

  // map-plane MVP for a camera
  function planeMVP(cam) {
    const d = H / 2 / TANV;
    const st = Math.sin(cam.tilt), ct = Math.cos(cam.tilt), sb = Math.sin(cam.bearing), cb = Math.cos(cam.bearing);
    const eye = [d * st * sb, d * ct, d * st * cb];
    const fwdH = [-sb, 0, -cb];
    const up = [fwdH[0] * ct, st, fwdH[2] * ct];
    return mul(perspective(VFOV, ASPECT, 20, d * 12), lookAt(eye, [0, 0, 0], up));
  }
  // lat/lon -> plane coords at zoom zf (px offset from the target)
  function planePoint(lat, lon, zf) {
    const n = Math.pow(2, zf) * 256;
    return [(mercX(lon) - mercX(CFG.target.lon)) * n, 0, (mercY(lat) - mercY(CFG.target.lat)) * n];
  }

  function globeBasis(cam) {
    const h = groundWidth(cam.zf, cam.lat) / (2 * TANV * ASPECT);
    const p = sph(cam.lat, cam.lon), D = 1 + h;
    const a = rad(cam.lat), o = rad(cam.lon);
    const north = [-Math.sin(a) * Math.sin(o), Math.cos(a), -Math.sin(a) * Math.cos(o)];
    const fwd = v3.scale(p, -1), right = v3.cross(fwd, north);
    return { eye: v3.scale(p, D), fwd, up: north, right };
  }
  function globeProject(b, lat, lon) {
    const p = sph(lat, lon), v = v3.sub(p, b.eye);
    if (v3.dot(p, v3.scale(v, -1)) <= 0) return null; // far side
    const z = v3.dot(v, b.fwd); if (z <= 0) return null;
    return { x: W / 2 + (v3.dot(v, b.right) / z / (TANV * ASPECT)) * W / 2, y: H / 2 - (v3.dot(v, b.up) / z / TANV) * H / 2 };
  }

  // ------------------------------------------------------------- 2D overlay
  const out = document.getElementById('out');
  const ctx = out.getContext('2d');

  function text(str, x, y, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.font = `${o.weight || 700} ${o.size || 40}px Cairo, sans-serif`;
    ctx.fillStyle = o.color || '#fff';
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = o.rtl ? 'rtl' : 'ltr';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.spacing || 0) + 'px';
    if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = o.blur ?? 16; ctx.shadowOffsetY = 2; }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function placeLabel(p, place, a, t) {
    if (!p || a <= 0.001) return;
    const big = place.big, lift = big ? 120 : 90;
    const rise = (1 - easeOut(a)) * 24;
    ctx.save();
    ctx.globalAlpha = a;
    // anchor dot + pulse
    const pu = (t * 0.8) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - pu)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8 + pu * 26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    // leader line
    const lineLen = (lift - 18) * easeOut(seg(a, 0, 1));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x, p.y - 10 - lineLen); ctx.stroke();
    ctx.restore();
    const ty = p.y - lift - rise;
    text(place.ar, p.x, ty - (big ? 30 : 22), { size: big ? 64 : 44, weight: 900, rtl: true, alpha: a });
    text(place.en, p.x, ty + (big ? 22 : 14), { size: big ? 22 : 17, weight: 700, spacing: 7, color: '#f1e3c4', alpha: a });
  }

  function subtitle(t) {
    for (const k of Object.keys(VO)) {
      const st = VO[k], d = LINES[k].duration;
      const a = band(t, st - 0.15, st + 0.25, st + d + 0.15, st + d + 0.55);
      if (a <= 0) continue;
      ctx.save();
      const g = ctx.createLinearGradient(0, H - 230, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, H - 230, W, 230);
      ctx.restore();
      text(LINES[k].text, W / 2, H - 96 + (1 - a) * 10, { size: 46, weight: 700, rtl: true, alpha: a, blur: 20 });
    }
  }

  function drawPin(x, y, h, alpha) {
    const r = h * 0.34, cy = y - h + r;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = h * 0.2; ctx.shadowOffsetY = h * 0.06;
    const g = ctx.createLinearGradient(x, cy - r, x, y);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e9e4da');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - r * 0.35, y - h * 0.3, x - r, cy + r * 0.75, x - r, cy);
    ctx.arc(x, cy, r, Math.PI, 0);
    ctx.bezierCurveTo(x + r, cy + r * 0.75, x + r * 0.35, y - h * 0.3, x, y);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#1d6b4f';
    ctx.beginPath(); ctx.arc(x, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function siteMarker(p, t) {
    if (!p) return;
    const drop = seg(t, 21.2, 21.9);
    if (drop <= 0) return;
    const fade = 1 - smooth(seg(t, END_START, END_START + 0.8));
    const bounce = drop < 1 ? 1 - Math.abs(Math.cos(drop * Math.PI * 1.5)) * (1 - drop) : 1;
    const yOff = (1 - easeOut(drop)) * -260;
    // ground pulse
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const u = ((t - 21.9 - k * 0.6) % 1.8) / 1.8;
      if (t - 21.9 - k * 0.6 < 0) continue;
      ctx.globalAlpha = fade * (1 - u) * 0.9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * (1 - u) + 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 20 + u * 170, (20 + u * 170) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = fade * 0.35 * drop; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawPin(p.x, p.y + yOff * (bounce > 0 ? 1 : 1), 110, fade * clamp(drop * 3));
    // name card
    const a = band(t, 22.2, 22.9, END_START - 0.3, END_START + 0.4);
    if (a > 0) {
      const x = p.x + 90, y = p.y - 150;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x + 30, p.y - 100); ctx.lineTo(x - 6, y + 30); ctx.lineTo(x + 330 * easeOut(a), y + 30); ctx.stroke();
      ctx.restore();
      text(CFG.target.nameAr, x + 4, y - 18, { size: 50, weight: 900, rtl: false, align: 'left', alpha: a });
      text(CFG.target.nameEn, x + 6, y + 62, { size: 20, weight: 700, spacing: 8, align: 'left', color: '#f1e3c4', alpha: a });
    }
  }

  // ------------------------------------------------------------- end card (real sign photo)
  let sign = null;
  function endCard(t) {
    const a = smooth(seg(t, END_START, END_START + 1.1));
    if (a <= 0) return;
    const u = seg(t, END_START, DURATION);
    const iw = sign.width, ih = sign.height;
    ctx.save();
    ctx.globalAlpha = a;
    // blurred photo background
    ctx.filter = 'blur(28px) brightness(0.42) saturate(0.8)';
    const bs = Math.max(W / iw, H / ih) * 1.15;
    ctx.drawImage(sign, (W - iw * bs) / 2, (H - ih * bs) / 2, iw * bs, ih * bs);
    ctx.filter = 'none';
    // sharp sign: full-bleed pan right -> left, then settle to full view
    const pan = easeInOut(seg(t, END_START + 0.2, END_START + 4.6));
    const settle = easeInOut(seg(t, END_START + 4.2, END_START + 6.2));
    const coverS = H / ih * 0.98, fitS = (W * 0.86) / iw;
    const s = lerp(coverS, fitS, settle) * (1 + 0.025 * u);
    const dw = iw * s, dh = ih * s;
    const xCover = lerp(W - dw + 0, 0, pan); // start showing English (right side), pan to Arabic
    const x = lerp(xCover, (W - dw) / 2, settle);
    const y = lerp((H - dh) / 2, 96, settle);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50 * settle; ctx.shadowOffsetY = 18 * settle;
    ctx.filter = 'contrast(1.08) saturate(0.92)';
    ctx.beginPath();
    const r = 18 * settle;
    ctx.roundRect ? ctx.roundRect(x, y, dw, dh, r) : ctx.rect(x, y, dw, dh);
    ctx.save(); ctx.clip();
    ctx.drawImage(sign, x, y, dw, dh);
    ctx.filter = 'none';
    // light sweep across the letters
    const sw = seg(t, END_START + 5.6, END_START + 7.4);
    if (sw > 0 && sw < 1) {
      const sx = lerp(x - 400, x + dw + 400, easeInOut(sw));
      const g = ctx.createLinearGradient(sx - 220, y, sx + 220, y + dh * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,235,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x, y, dw, dh);
    }
    ctx.restore();
    ctx.restore();
    // location line
    const la = smooth(seg(t, END_START + 5.4, END_START + 6.4));
    if (la > 0) {
      const yy = 96 + (W * 0.86 / iw) * ih + 104;
      ctx.save(); ctx.globalAlpha = la; ctx.fillStyle = '#d9b46a';
      const lw = 520 * easeInOut(la); ctx.fillRect(W / 2 - lw / 2, yy - 52, lw, 2); ctx.restore();
      text('زاخر · العين · الإمارات العربية المتحدة', W / 2, yy, { size: 46, weight: 700, rtl: true, alpha: la });
      text('ZAKHER  ·  AL AIN  ·  UAE', W / 2, yy + 64, { size: 22, weight: 700, spacing: 9, color: '#e8d6ae', alpha: smooth(seg(t, END_START + 5.8, END_START + 6.8)) });
      const T = CFG.target;
      text(`${T.lat.toFixed(4)}° N   ${T.lon.toFixed(4)}° E`, W / 2, yy + 112, { size: 18, weight: 400, spacing: 4, color: 'rgba(255,255,255,0.65)', alpha: smooth(seg(t, END_START + 6.2, END_START + 7.2)) });
    }
  }

  // ------------------------------------------------------------- frame
  const GLOBE_OUT = [8.0, 8.7]; // zoom range of globe -> map crossfade

  async function render(t) {
    const cam = camera(t);
    const mapA = smooth(seg(cam.zf, GLOBE_OUT[0], GLOBE_OUT[1]));
    const showMap = mapA > 0 && t < END_START + 1.2;
    const showGlobe = mapA < 1;

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);

    let gb = null;
    if (showGlobe) {
      gb = globeBasis(cam);
      const P = globeProg; gl.useProgram(P.p);
      const loc = gl.getAttribLocation(P.p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(P.u.uCam, gb.eye); gl.uniform3fv(P.u.uRight, gb.right); gl.uniform3fv(P.u.uUp, gb.up); gl.uniform3fv(P.u.uFwd, gb.fwd);
      gl.uniform3fv(P.u.uSun, v3.norm(sph(18, 32)));
      gl.uniform1f(P.u.uTan, TANV); gl.uniform1f(P.u.uAspect, ASPECT); gl.uniform1f(P.u.uTime, t);
      const p6 = MANIFEST.patch6, p8 = MANIFEST.patch8;
      gl.uniform4f(P.u.uP6, p6.x0, p6.y0, p6.x1, p6.y1); gl.uniform4f(P.u.uP8, p8.x0, p8.y0, p8.x1, p8.y1);
      [['tGlobe', TEX.globe], ['tP6', TEX.p6], ['tP8', TEX.p8]].forEach(([n, tx], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(P.u[n], i); });
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    let mvp = null;
    if (showMap) {
      const L = clamp(Math.ceil(cam.zf - 1e-6), MINZ, CFG.maxZoom);
      await Promise.all([ensureLevel(L), ensureLevel(Math.max(MINZ, L - 1))]);
      evict([L - 1, L, L + 1]);
      ensureLevel(Math.min(CFG.maxZoom, L + 1)); // prefetch
      drawMapCanvas(cam.zf);
      gl.activeTexture(gl.TEXTURE0);
      if (!mapTex) mapTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, mapCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      mvp = planeMVP(cam);
      const P = planeProg; gl.useProgram(P.p);
      const loc = gl.getAttribLocation(P.p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(P.u.uMVP, false, new Float32Array(mvp));
      gl.uniform1f(P.u.uHalf, M / 2); gl.uniform1f(P.u.uAlpha, mapA);
      const d = H / 2 / TANV;
      gl.uniform1f(P.u.uFogNear, d * 1.05); gl.uniform1f(P.u.uFogFar, d * 2.4);
      gl.uniform1i(P.u.tMap, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // sky above the horizon when tilted
    }

    // ---- composite
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'saturate(1.1) contrast(1.05)';
    ctx.drawImage(glc, 0, 0);
    ctx.filter = 'none';
    if (cam.tilt > 0.01 && t < END_START + 1.2) {
      // soft sky haze at the top when the camera tilts
      const k = cam.tilt / rad(48);
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.45);
      g.addColorStop(0, `rgba(205,220,236,${0.75 * k})`); g.addColorStop(1, 'rgba(205,220,236,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.45);
    }
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

    // ---- labels
    const where = (lat, lon) => (mapA >= 0.5 && mvp ? project(mvp, planePoint(lat, lon, cam.zf)) : gb ? globeProject(gb, lat, lon) : null);
    for (const k of Object.keys(PLACES)) {
      const pl = PLACES[k];
      const a = band(cam.zf, ...pl.z);
      if (a > 0) placeLabel(where(pl.lat, pl.lon), pl, a, t);
    }
    if (mvp && t < END_START + 1) siteMarker(project(mvp, [0, 0, 0]), t);

    endCard(t);
    subtitle(t);

    // attribution (imagery licence) — hidden on the end card
    const attrA = 1 - smooth(seg(t, END_START, END_START + 0.6));
    if (attrA > 0) text('Imagery © Esri, Maxar, Earthstar Geographics', W - 28, H - 26, { size: 15, weight: 400, align: 'right', color: 'rgba(255,255,255,0.7)', alpha: attrA, blur: 6 });

    // fades
    const fin = 1 - smooth(seg(t, 0, 1.2)), fout = smooth(seg(t, DURATION - 1.0, DURATION));
    const f = Math.max(fin, fout);
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------- boot
  const TEX = {};
  const ready = (async () => {
    CFG = await (await fetch('config.json')).json();
    VO = CFG.voice;
    MANIFEST = await (await fetch('assets/earth/manifest.json')).json();
    LINES = await (await fetch('assets/voice/lines.json')).json();
    // VO durations: prefer the trimmed values written by tools/make_audio.py
    try { const tr = await (await fetch('build/vo_durations.json')).json(); for (const k in tr) LINES[k].duration = tr[k]; } catch (e) { /* optional */ }
    const [globe, p6, p8, signImg] = await Promise.all(['assets/earth/globe.jpg', 'assets/earth/patch6.jpg', 'assets/earth/patch8.jpg', 'assets/img/logo-sign.jpg'].map(loadImg));
    TEX.globe = texture(globe, { mip: true, repeat: true });
    TEX.p6 = texture(p6); TEX.p8 = texture(p8);
    sign = signImg;
    await Promise.all([400, 700, 900].flatMap((w) => [document.fonts.load(`${w} 40px Cairo`, 'Abc'), document.fonts.load(`${w} 40px Cairo`, 'العين')]));
  })();

  window.SCENE = { W, H, FPS, DURATION, render, ready, canvas: out };

  if (!/[?&]render=1/.test(location.search)) {
    ready.then(() => {
      const start = performance.now();
      let busy = false;
      const loop = async (now) => {
        if (!busy) { busy = true; await render(((now - start) / 1000) % DURATION); busy = false; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }
})();

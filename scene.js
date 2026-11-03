'use strict';
/* Pixel-art scene. Draws into a small canvas (320x200 or a little wider or taller to match the window)
   and lets CSS scale it up with sharp pixels. Static parts (sky gradient, land, cabin) are painted once
   as palette indices; each frame maps them through the current palette and draws the moving parts on top.
   Everything reads the mixer levels from `state` through `effLevel`, so drift and presets show here too.
   Wrapped in a function so its many short names stay out of the shared global scope; `scene` is the only export. */
const scene = (function () {
  const A = SCENE_ART;
  const cv = document.getElementById('scene');
  const g = cv.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const HZ = 96, BLUFF = 124;

  /* ---------- palette ---------- */
  const P = {};                 // palette key -> index
  const NAMES = A.keys.slice();
  for (let i = 0; i < 8; i++) NAMES.push('skyB' + i);
  for (let i = 0; i < 4; i++) NAMES.push('seaB' + i);
  NAMES.push('winGlow');
  NAMES.forEach((n, i) => { P[n] = i; });
  const pal = new Uint32Array(NAMES.length);
  const rgbOf = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const TIMES = {};
  Object.keys(A.times).forEach(k => { TIMES[k] = A.keys.map(n => rgbOf(A.times[k][n])); });
  const STORM = A.keys.map(n => A.storm[n] ? rgbOf(A.storm[n]) : null);
  const EMIT = A.keys.map(n => A.emissive.includes(n));
  const SKYISH = A.keys.map(n => /^(sky|cloud|sea|far|puddle)/.test(n));
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  /* ---------- buffers and layout ---------- */
  let W = 320, H = 200, OX = 0, OY = 0, EB = 0, scale = 1;
  let img = null, px = null, idx = null, sea = null;
  let stars = [], tufts = [], clouds = [], rowPh = null;
  const fogN = new Float32Array(256);
  for (let i = 0; i < 256; i++) fogN[i] = 0.5 + 0.25 * Math.sin(i * TAU / 256 * 3) + 0.15 * Math.sin(i * TAU / 256 * 7 + 1) + 0.1 * Math.sin(i * TAU / 256 * 17 + 2);

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) & 1023) / 1024;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const dith = (x, y, a) => BAYER[((y & 3) << 2) | (x & 3)] < a;
  const smooth = k => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };

  /* world shape */
  const landX = wy => wy >= BLUFF ? 150 - (wy - BLUFF) * 0.12 + 1.5 * Math.sin(wy * 0.35) : 150 + (BLUFF - wy) * 1.6;
  const rockW = wy => 4 + (wy - BLUFF) * 0.3;
  const backTop = wx => 121 - 9 * smooth((wx - 150) / 170) - 2.5 * Math.sin(wx * 0.06) - 1.5 * Math.sin(wx * 0.13 + 1);

  /* static painting into the index buffer (world coordinates) */
  function sput(wx, wy, c) {
    const x = Math.round(wx) + OX, y = Math.round(wy) + OY;
    if (x >= 0 && y >= 0 && x < W && y < H) idx[y * W + x] = c;
  }
  function srect(wx, wy, w, h, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sput(wx + x, wy + y, c); }
  function spoly(pts, fn) {
    let y0 = Infinity, y1 = -Infinity;
    pts.forEach(p => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
      let a = Infinity, b = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if ((p[1] <= y && q[1] >= y) || (q[1] <= y && p[1] >= y)) {
          const x = q[1] === p[1] ? p[0] : p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]);
          if (q[1] === p[1]) { a = Math.min(a, p[0], q[0]); b = Math.max(b, p[0], q[0]); }
          else { a = Math.min(a, x); b = Math.max(b, x); }
        }
      }
      for (let x = Math.round(a); x <= Math.round(b); x++) sput(x, y, fn(x, y));
    }
  }
  function sprite(name, wx, wy) {
    const s = A.sprites[name];
    s.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') sput(wx + x, wy + y, P[s.key[row[x]]]);
    });
  }

  function paintStatic() {
    const skyH = OY + HZ;
    for (let y = 0; y < H; y++) {
      const wy = y - OY;
      for (let x = 0; x < W; x++) {
        let c;
        if (y < skyH) {
          const b = (y / skyH) * 7, lo = Math.floor(b);
          c = P['skyB' + Math.min(7, lo + (dith(x, y, b - lo) ? 1 : 0))];
        } else {
          const b = Math.min(1, (wy - HZ) / (104 + EB)) * 3, lo = Math.floor(b);
          c = P['seaB' + Math.min(3, lo + (dith(x, y, b - lo) ? 1 : 0))];
        }
        idx[y * W + x] = c;
      }
    }
    // far headland on the horizon
    for (let wx = -OX; wx < 70; wx++) {
      const h = Math.round(2 + 4 * Math.max(0, Math.sin((wx + 70) / 34)) + Math.sin(wx * 0.4));
      for (let k = 1; k <= h; k++) sput(wx, HZ - k, P.far);
    }
    // land and cliff
    for (let y = 0; y < H; y++) {
      const wy = y - OY;
      if (wy < 104) continue;
      const lx = landX(wy), rl = wy >= BLUFF ? lx - rockW(wy) : Infinity;
      for (let x = 0; x < W; x++) {
        const wx = x - OX;
        let c = -1;
        if (wx >= lx && wy >= backTop(wx)) {
          const h = hash(wx, wy);
          if (wy < backTop(wx) + 1) c = P.grass2;
          else if (wy < 126) c = dith(x, y, (wy - 116) / 10) ? P.grass1 : P.grassFar;
          else {
            c = h < 0.1 ? P.grass2 : h > 0.95 ? P.grassHi : P.grass1;
            if (wy > 168 && dith(x, y, (wy - 168) / 90)) c = h < 0.5 ? P.grass2 : P.grass1;
          }
          if (wy >= BLUFF && wx < lx + 1.5 && wy < BLUFF + 40) c = P.grass2;
        } else if (wx >= rl && wx < lx) {
          const s = (wy + Math.floor(wx * 0.5)) % 6;
          c = wx < rl + 1.2 ? P.rock3 : s === 0 ? P.rock2 : P.rock1;
          if (wy > 175 && dith(x, y, (wy - 175) / 60)) c = P.rock2;
          if (hash(wx, wy) > 0.93) c = P.rock3;
        }
        if (c >= 0) idx[y * W + x] = c;
      }
    }
    // path from the door down the bluff
    spoly([[206, 141], [215, 141], [224, 200 + EB], [194, 200 + EB]], (x, y) => {
      const h = hash(x, y);
      return h < 0.12 ? P.grass2 : h > 0.9 ? P.rock3 : P.dirt;
    });
    A.props.filter(p => p.y < 140).forEach(p => sprite(p.s, p.x, p.y));
    paintCabin();
    A.props.filter(p => p.y >= 140).forEach(p => sprite(p.s, p.x, p.y));
    // sky and sea masks
    for (let i = 0; i < idx.length; i++) {
      const c = idx[i];
      sea[i] = c >= P.skyB0 && c <= P.skyB7 ? 1 : c >= P.seaB0 && c <= P.seaB3 ? 2 : 0;
    }
  }

  function paintCabin() {
    const logs = (x, y, top) => ((y - top) % 3 === 2 ? P.wallLine : P.wall1);
    // shadow and foundation
    for (let x = 182; x < 268; x++) for (let y = 139; y < 143; y++) if (dith(x, y, 0.6)) sput(x, y, P.grass2);
    srect(195, 137, 33, 4, P.rock1);
    for (let x = 195; x < 228; x += 4) sput(x + ((x >> 2) & 1), 138, P.rock2);
    // side wall, sloping away to the right
    for (let x = 227; x <= 262; x++) {
      const top = 118 - (x - 227) * 5 / 35, bot = 140 - (x - 227) * 4 / 35;
      for (let y = Math.round(top); y <= Math.round(bot); y++) {
        const k = (y - top) % 3;
        sput(x, y, k > 2 ? P.wall2 : k >= 2 ? P.wallLine : P.wall2);
      }
      for (let y = Math.round(bot) - 2; y <= Math.round(bot); y++) sput(x, y, P.rock2);
    }
    // front gable wall
    srect(196, 118, 31, 20, P.wall1);
    for (let y = 118; y < 138; y++) for (let x = 196; x < 227; x++) sput(x, y, logs(x, y, 118));
    for (let y = 118; y < 138; y++) sput(226, y, P.wall2);
    spoly([[195, 118], [211, 100], [227, 118]], (x, y) => logs(x, y, 100));
    // roof plane over the side wall, then barge boards on the gable
    spoly([[211, 97], [248, 92], [265, 113], [228, 119]], (x, y) => (Math.round(y + (x - 211) * 0.14) % 3 === 0 ? P.roof2 : P.roof1));
    for (let k = 0; k <= 37; k++) sput(211 + k, 97 - k * 5 / 37, P.trim);
    for (let k = 0; k <= 20; k++) {
      const y = 97 + k * 22 / 20;
      sput(211 - k * 19 / 20, y, P.roof2); sput(211 - k * 19 / 20, y + 1, P.trim);
      sput(211 + k * 18 / 20, y, P.roof2); sput(211 + k * 18 / 20, y + 1, P.trim);
    }
    // chimney
    srect(246, 86, 7, 16, P.rock1);
    for (let y = 87; y < 102; y += 3) for (let x = 246; x < 253; x += 3) sput(x + ((y / 3) & 1), y, P.rock2);
    for (let y = 86; y < 102; y++) sput(252, y, P.rock2);
    srect(245, 85, 9, 2, P.rock3);
    // gable vent behind the fan
    const [fx, fy] = A.cabin.fan;
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y;
      if (d <= 16) sput(fx + x, fy + y, P.winDark);
      else if (d <= 26) sput(fx + x, fy + y, P.trim);
    }
    // side window, glow comes from the palette entry winGlow
    const [wx, wy, ww, wh] = A.cabin.window;
    for (let y = -1; y <= wh; y++) for (let x = -1; x <= ww; x++) {
      const edge = x < 0 || y < 0 || x >= ww || y >= wh || x === (ww >> 1) || y === (wh >> 1);
      sput(wx + x, wy + y - Math.round(x * 4 / 35), edge ? P.trim : P.winGlow);
    }
    for (let x = -2; x <= ww + 1; x++) sput(wx + x, wy + wh + 1 - Math.round(x * 4 / 35), P.trim);
    // door and step
    const [dx, dy, dw, dh] = A.cabin.door;
    srect(dx - 1, dy - 1, dw + 2, dh + 1, P.trim);
    srect(dx, dy, dw, dh, P.door);
    for (let y = dy + 1; y < dy + dh; y += 4) for (let x = dx; x < dx + dw; x++) sput(x, y, P.wallLine);
    sput(dx + dw - 2, dy + 8, P.metal);
    srect(dx - 2, 140, dw + 4, 2, P.rock3);
    // porch: deck, post and lean-to roof that carries the chimes
    srect(183, 138, 13, 3, P.trunk);
    for (let x = 183; x < 196; x += 3) sput(x, 139, P.wallLine);
    for (let y = 122; y < 138; y++) sput(184, y, P.trunk);
    spoly([[181, 121], [196, 117], [196, 120], [181, 123]], () => P.roof1);
    for (let x = 181; x <= 196; x++) sput(x, 123 - (x - 181) * 3 / 15, P.roof2);
  }

  function resize() {
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight), a = vw / vh;
    // wide screens add sea and forest at the sides; tall ones add sky and foreground, and phones crop in on the bluff
    if (a >= 1.6) { H = 200; W = Math.min(427, Math.round(200 * a)); }
    else if (a >= 0.8) { W = 320; H = Math.round(320 / a); }
    else { W = 240; H = Math.min(560, Math.round(240 / a)); }
    const extraH = H - 200;
    OY = Math.round(extraH * 0.65); EB = extraH - OY;
    OX = W === 240 ? -70 : Math.round((W - 320) / 2);
    cv.width = W; cv.height = H;
    img = g.createImageData(W, H);
    px = new Uint32Array(img.data.buffer);
    idx = new Uint8Array(W * H);
    sea = new Uint8Array(W * H);
    scale = Math.max(vw / W, vh / H);
    cv.style.width = (W * scale) + 'px';
    cv.style.height = (H * scale) + 'px';
    cv.style.left = ((vw - W * scale) / 2) + 'px';
    cv.style.top = ((vh - H * scale) / 2) + 'px';
    const r = rng(7);
    stars = [];
    for (let i = 0; i < 40 + (W * (OY + HZ)) / 400; i++) {
      stars.push({ x: Math.floor(r() * W), y: Math.floor(Math.pow(r(), 1.3) * (OY + HZ - 6)), b: r(), f: 0.5 + r() * 2, p: r() * TAU });
    }
    rowPh = new Float32Array(H);
    for (let y = 0; y < H; y++) rowPh[y] = r() * TAU;
    paintStatic();
    applyInset();
    draw();
  }

  /* ---------- simulation state ---------- */
  const lv = {};
  LAYERS.forEach(l => { lv[l.id] = effLevel(l.id); });
  let t = 0, last = 0, raf = 0, dim = 1, flash = 0;
  let bolt = null, boltAge = 9, boltI = 0;
  const drops = [], splashes = [], ripples = [], smoke = [], pending = [];
  let smokeAcc = 0, fanA = 0, nextFakeThunder = 4, nextFakeGust = 2, flick = 1;
  const tubes = A.chimes.tubes.map(() => ({ a: 0, w: 0, glint: 0 }));

  (function initStatic() {
    const r = rng(11);
    A.clouds.forEach(c => {
      const puffs = [], n = 3 + Math.floor(c.w / 10);
      for (let i = 0; i < n; i++) puffs.push([(r() - 0.5) * c.w, (r() - 0.6) * 5, 4 + r() * c.w / 4]);
      clouds.push({ x: c.x, y: c.y, w: c.w, s: c.s, puffs: puffs });
    });
    for (let i = 0; i < 90; i++) {
      const wy = 128 + Math.pow(r(), 0.8) * 110, wx = 120 + r() * 300;
      if (wx < landX(wy) + 4) continue;
      if (wx > 178 && wx < 268 && wy < 144) continue;
      if (wx > 192 && wx < 228 && wy > 140) continue;
      if (A.creek.some(p => Math.abs(p[0] - wx) < 12 && Math.abs(p[1] - wy) < 6)) continue;
      tufts.push({ x: Math.round(wx), y: Math.round(wy), h: 2 + Math.floor(r() * 3), p: r() * TAU });
    }
  })();

  function timeOfDay() {
    const q = /[?&]hour=([\d.]+)/.exec(location.search);
    const d = new Date();
    const h = q ? (+q[1] % 24) : d.getHours() + d.getMinutes() / 60;
    const C = A.clock;
    let i = 0;
    while (i < C.length - 2 && h >= C[i + 1][0]) i++;
    const k = (h - C[i][0]) / (C[i + 1][0] - C[i][0]);
    const w = { night: 0, dawn: 0, day: 0, dusk: 0 };
    w[C[i][1]] += 1 - k; w[C[i + 1][1]] += k;
    return w;
  }
  function moonPhase() {
    const days = (Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
    return ((days / 29.530588) % 1 + 1) % 1;
  }

  /* ---------- palette per frame ---------- */
  let tod = timeOfDay(), todAt = 0, phase = moonPhase();
  function buildPalette(dark, haze) {
    const night = tod.night, lum = 0.5 + 0.5 * (tod.day + 0.6 * (tod.dawn + tod.dusk));
    const fl = flash;
    const out = [];
    for (let i = 0; i < A.keys.length; i++) {
      let c = [0, 0, 0];
      for (const k in tod) if (tod[k]) { const s = TIMES[k][i]; c[0] += s[0] * tod[k]; c[1] += s[1] * tod[k]; c[2] += s[2] * tod[k]; }
      if (STORM[i] && dark > 0) c = mixc(c, STORM[i].map(v => v * lum), Math.min(1, dark * 1.15));
      if (!EMIT[i] && dark > 0) c = c.map(v => v * (1 - dark * 0.22));
      out.push(c);
    }
    // derived colours: sky bands, sea bands and the window glow
    const sky = [P.skyTop, P.skyMid, P.skyLow];
    for (let b = 0; b < 8; b++) {
      const k = b / 7 * 2, lo = Math.min(1, Math.floor(k));
      out.push(mixc(out[sky[lo]], out[sky[lo + 1]], k - lo));
    }
    for (let b = 0; b < 4; b++) out.push(mixc(out[P.sea1], out[P.sea2], b / 3));
    const f = lv.fire * flick;
    let wg = mixc(out[P.winDark], out[P.glow], Math.min(1, f * 1.2));
    wg = mixc(wg, out[P.glowHot], f * f * 0.45);
    out.push(wg);
    const hz = mixc(out[P.skyB6], out[P.fog], 0.5);
    for (let i = 0; i < out.length; i++) {
      let c = out[i];
      const isSky = i >= P.skyB0 || SKYISH[i];
      if (fl > 0) c = mixc(c, [235, 240, 255], fl * (isSky ? 0.7 : 0.35));
      if (haze > 0) c = mixc(c, hz, haze);
      const k = dim;
      pal[i] = 0xff000000 | ((Math.round(c[2] * k) & 0xfc) << 16) | ((Math.round(c[1] * k) & 0xfc) << 8) | (Math.round(c[0] * k) & 0xfc);
    }
    return night;
  }

  /* ---------- dynamic drawing (screen coordinates unless named wx/wy) ---------- */
  function put(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = pal[c];
  }
  const wput = (wx, wy, c) => put(wx + OX, wy + OY, c);
  function skyPut(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H && sea[y * W + x] === 1) px[y * W + x] = pal[c];
  }

  function drawSky(night, cover, w) {
    const vis = night * (1 - cover);
    if (vis > 0.02) {
      stars.forEach(s => {
        const a = vis * (0.55 + 0.45 * Math.sin(t * s.f + s.p));
        if (s.b < a) skyPut(s.x, s.y, s.b < a * 0.4 ? P.star : P.skyB2);
      });
    }
    // moon and its streak on the water
    const mv = Math.min(1, night * 1.3) * (1 - cover * 0.9);
    if (mv > 0.02) {
      const mx = 64 + OX, my = 26 + OY, R = 6, k = Math.cos(phase * TAU);
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > R + 0.3) continue;
        const nx = x / R, edge = Math.sqrt(Math.max(0, 1 - (y / R) * (y / R)));
        const lit = phase < 0.5 ? nx > k * edge : nx < -k * edge;
        if (lit ? dith(mx + x, my + y, mv) : dith(mx + x, my + y, mv * 0.25)) skyPut(mx + x, my + y, lit ? P.moon : P.skyB3);
      }
      for (let y = OY + HZ + 1; y < OY + HZ + 40 + EB * 0.3; y++) {
        const z = (y - OY - HZ) / 40, sx = mx + Math.sin(y * 1.7 + t * 1.3) * (1 + z * 4);
        if (dith(Math.round(sx), y, mv * 0.6 * (1 - z * 0.5)) && sea[y * W + Math.round(sx)] === 2) put(sx, y, P.moon);
      }
    }
    // clouds drift with the wind; the last one fades in by dithering
    const n = clouds.length, span = W + 160;
    clouds.forEach((c, i) => {
      const a = Math.min(1, Math.max(0, cover * n - i));
      if (a <= 0) return;
      const cx = ((c.x * span + t * (1.5 + w * 16) * c.s) % span) - 80, cy = c.y + OY;
      c.puffs.forEach(p => {
        const r = p[2], px0 = cx + p[0], py0 = cy + p[1];
        for (let y = Math.floor(-r); y <= Math.ceil(r); y++) {
          if (py0 + y > cy + 5) break;
          const hw = Math.sqrt(Math.max(0, r * r - y * y));
          for (let x = Math.floor(-hw); x <= Math.ceil(hw); x++) {
            const X = Math.round(px0 + x), Y = Math.round(py0 + y);
            if (!dith(X, Y, a)) continue;
            skyPut(X, Y, y > -r * 0.2 && dith(X, Y, 0.3 + (y + r * 0.2) / r) ? P.cloud2 : P.cloud1);
          }
        }
      });
    });
    if (cover > 0.5) {
      const bottom = OY + (cover - 0.5) * 2 * 70;
      for (let y = 0; y < bottom; y++) {
        const a = 1 - Math.pow(Math.max(0, y - OY * 0.2) / Math.max(1, bottom - OY * 0.2), 2);
        for (let x = 0; x < W; x++) if (dith(x + ((t * 3) | 0), y, a)) skyPut(x, y, P.cloud2);
      }
    }
    // lightning
    if (bolt && (boltAge < 0.12 || (boltAge > 0.16 && boltAge < 0.26))) {
      bolt.forEach(s => { for (let k = 0; k <= 1; k++) skyPut(s[0] + k, s[1], k ? P.cloud1 : P.bolt); });
    }
  }

  function drawSea(o) {
    const top = OY + HZ, sw = TAU / 10, thr = 0.86 - o * 0.22, band = 0.03 + o * 0.16;
    for (let y = top; y < H; y++) {
      const z = Math.min(1.2, (y - top) / (104 + EB)), f = 0.09 / (0.15 + z), ph = rowPh[y];
      const swell = Math.sin(t * sw - z * 16);
      const crest = z > 0.04 && swell > 1 - band;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        if (sea[row + x] !== 2) continue;
        const v = Math.sin(x * f + ph + t * (0.4 + o * 0.6)) * Math.sin(x * 0.031 + ph * 2 - t * 0.25);
        if (crest && Math.sin(x * f * 0.7 + ph * 3 + t * 0.2) > 0.1 - o * 0.5) {
          px[row + x] = pal[hash(x + ((t * 6) | 0), y) < o * 0.45 ? P.foam : P.seaHi];
        } else if (v > thr || (y === top && dith(x, y, 0.5))) {
          px[row + x] = pal[P.seaHi];
        }
      }
    }
    // surf against the foot of the cliff
    for (let y = top; y < H; y++) {
      const wy = y - OY;
      if (wy < BLUFF) continue;
      const rl = Math.round(landX(wy) - rockW(wy)) + OX;
      const z = (wy - HZ) / (104 + EB), s = Math.sin(t * TAU / 10 - z * 16);
      const fw = (0.5 + o * 7) * (0.55 + 0.45 * s) + hash(y, (t * 8) | 0) * 2 * o;
      for (let k = 1; k <= fw; k++) {
        const x = rl - k;
        if (x >= 0 && sea[y * W + x] === 2 && dith(x, y, 1 - k / (fw + 1) * 0.6)) px[y * W + x] = pal[P.foam];
      }
      if (o > 0.4 && hash(y, (t * 10) | 0) < (o - 0.4) * 0.5) put(rl - 1 + hash(y, 3) * 4, y - 2 - hash(y, (t * 10) | 0) * 6, P.foam);
    }
  }

  function creekWidth(wy, s) { return (1 + s * 4.2) * (0.55 + (wy - 116) / 100); }
  function drawCreek(s) {
    const pts = A.creek;
    let u = 0;
    const speed = 2 + s * 14, wet = smooth(s * 6);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 0; d < len; d += 0.5, u += 0.5) {
        const wx = x0 + (x1 - x0) * d / len, wy = y0 + (y1 - y0) * d / len;
        const wwet = creekWidth(wy, s) * wet, bed = creekWidth(wy, 0.15) + 1;
        const hw = Math.max(bed, wwet) / 2;
        for (let k = -hw; k <= hw; k += 0.5) {
          const inWater = Math.abs(k) <= wwet / 2;
          let c = P.dirt;
          if (inWater) {
            c = Math.abs(k) > wwet / 2 - 0.8 ? P.creek2 : P.creek1;
            const m = ((u * 0.3 - t * speed * 0.3) % 5 + 5) % 5;
            if (m < 0.8 && Math.abs(k) < wwet / 3 && hash(Math.round(u), Math.round(k)) < 0.7) c = P.creekHi;
          }
          wput(wx, wy + k * 0.6, c);
        }
      }
    }
    // sparkle grows with the flow
    const n = Math.round(s * 10);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(Math.random() * (pts.length - 1)), q = Math.random();
      const wx = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * q, wy = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * q;
      wput(wx + (Math.random() - 0.5) * creekWidth(wy, s) * 0.6, wy, Math.random() < 0.5 ? P.glint : P.creekHi);
    }
    // waterfall down the rock face
    if (s > 0.02) {
      const [ex, ey] = pts[pts.length - 1], fw = Math.max(1, Math.round(1 + s * 3) * wet);
      for (let wy = ey; wy - ey < 200 + EB; wy++) {
        if (wy + OY >= H) break;
        const wx = landX(wy) - 2 - (wy - ey) * 0.15;
        for (let k = 0; k < fw; k++) {
          const m = ((wy - t * (30 + s * 50) + k * 3) % 5 + 5) % 5;
          wput(wx - k, wy, m < 1 ? P.creekHi : k === fw - 1 ? P.creek2 : P.creek1);
        }
      }
    }
    // plank bridge for the path
    const [bx, by, bw, bh] = A.bridge;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      wput(bx + x, by + y, y === 0 || y === bh - 1 ? P.wall2 : x % 3 === 2 ? P.wallLine : P.trunk);
    }
  }

  function drawPuddles(r, dt) {
    const k = smooth((r - 0.04) * 2.5);
    if (k <= 0) { ripples.length = 0; return; }
    A.puddles.forEach(p => {
      const a = p.w / 2 * k, b = a * 0.35;
      for (let y = -Math.ceil(b); y <= Math.ceil(b); y++) for (let x = -Math.ceil(a); x <= Math.ceil(a); x++) {
        if ((x * x) / (a * a + 0.01) + (y * y) / (b * b + 0.01) > 1) continue;
        wput(p.x + x, p.y + y, dith(x + 64, y + 64, 0.25) ? P.skyB6 : P.puddle);
      }
      if (a > 1.5 && Math.random() < r * 8 * dt) ripples.push({ x: p.x + (Math.random() - 0.5) * a, y: p.y + (Math.random() - 0.5) * b, age: 0 });
    });
    for (let i = ripples.length - 1; i >= 0; i--) {
      const q = ripples[i];
      q.age += dt;
      if (q.age > 0.7) { ripples.splice(i, 1); continue; }
      const rad = q.age / 0.7 * 3;
      for (let a = 0; a < TAU; a += 0.5) wput(q.x + Math.cos(a) * rad, q.y + Math.sin(a) * rad * 0.4, P.seaHi);
    }
  }

  function drawPine(tr, sway) {
    const { x, y, h } = tr;
    for (let k = 0; k < 4; k++) { wput(x, y - k, P.trunk); wput(x + 1, y - k, P.trunk); }
    const fh = h - 3, tiers = Math.max(3, Math.floor(h / 11));
    for (let k = 0; k <= fh; k++) {
      const fr = k / fh, tp = (fr * tiers) % 1;
      const hw = (0.6 + fr * h * 0.27) * (0.55 + 0.45 * tp);
      const cx = x + 0.5 + sway * Math.pow(1 - fr, 2), wy = y - 3 - fh + k;
      for (let dx = Math.floor(-hw); dx <= Math.ceil(hw); dx++) {
        const sx = Math.round(cx + dx) + OX, sy = wy + OY;
        const edge = Math.abs(dx) > hw - 1;
        if (edge && !dith(sx, sy, 0.6)) continue;
        let c = dx < hw * 0.15 ? P.tree1 : P.tree2;
        if (dx < -hw + 2 && tp > 0.6 && dith(sx, sy, 0.5)) c = P.grassHi;
        put(sx, sy, c);
      }
    }
  }

  function drawCabinBits(fire, fan, w, night, dt) {
    // light spill under the window
    const spill = fire * flick * (0.25 + 0.75 * night);
    if (spill > 0.02) {
      for (let wy = 141; wy < 156; wy++) for (let wx = 228; wx < 260; wx++) {
        const d = Math.hypot((wx - 243) / 16, (wy - 141) / 15);
        if (d < 1 && dith(wx + OX, wy + OY, spill * 0.55 * (1 - d))) wput(wx, wy, P.glow);
      }
    }
    // gable fan: three blades, speed follows the slider
    fanA += Math.min(0.9, fan * 26 * dt);
    const [fx, fy] = A.cabin.fan;
    for (let b = 0; b < 3; b++) {
      const a = fanA + b * TAU / 3;
      for (let r = 1; r <= 3.5; r += 0.5) wput(fx + Math.cos(a) * r, fy + Math.sin(a) * r, P.metal);
      if (fan > 0.35) for (let r = 1.5; r <= 3; r += 0.5) wput(fx + Math.cos(a - 0.45) * r, fy + Math.sin(a - 0.45) * r, P.roof2);
    }
    wput(fx, fy, P.glint);
    // chimes swing in the wind and glint when struck
    const [b0, b1, by] = A.chimes.bar;
    for (let x = b0; x <= b1; x++) wput(x, by, P.trim);
    tubes.forEach((tb, i) => {
      const gust = w * 3 * (Math.sin(t * 0.9 + i) * 0.6 + Math.sin(t * 2.3 + i * 2) * 0.4 + 0.3);
      tb.w += (-22 * tb.a - 1.6 * tb.w + gust) * dt;
      tb.a = Math.max(-0.7, Math.min(0.7, tb.a + tb.w * dt));
      tb.glint = Math.max(0, tb.glint - dt * 2.2);
      const [tx, len] = A.chimes.tubes[i];
      for (let k = 1; k <= len; k++) {
        const c = k === 1 ? P.trim : tb.glint > 0.05 && k < 4 && dith(tx + OX, by + k + OY, tb.glint) ? P.glint : k === len ? P.rain : P.metal;
        wput(tx + Math.sin(tb.a) * k, by + k * Math.cos(tb.a), c);
      }
    });
  }

  function drawSmoke(fire, w, dt) {
    const [cx, cy] = A.cabin.chimney;
    if (fire > 0.03) {
      smokeAcc += dt * (2 + fire * 14);
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        smoke.push({ x: cx + (Math.random() - 0.5) * 3, y: cy, vx: w * 4, age: 0, life: 3 + Math.random() * 3 });
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.age += dt;
      if (s.age > s.life) { smoke.splice(i, 1); continue; }
      s.vx += (w * 24 + 1.5 - s.vx) * dt * 0.7;
      s.x += s.vx * dt;
      s.y -= (6 + fire * 5) * dt * (1 - s.age / s.life * 0.5);
      const r = 1 + s.age * (0.8 + fire * 0.9), a = (1 - s.age / s.life) * (0.25 + 0.55 * fire) * Math.min(1, lv.fire * 8);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const X = Math.round(s.x + x) + OX, Y = Math.round(s.y + y) + OY;
        if (dith(X, Y, a)) put(X, Y, P.smoke);
      }
    }
  }

  function drawRain(r, w, dt) {
    const want = Math.round(Math.pow(r, 1.2) * 700 * (W * H) / 64000);
    const slant = w * 0.8 + 0.05, base = 110 + r * 140;
    while (drops.length < want) drops.push(newDrop(true, slant));
    if (drops.length > want) drops.length = want;
    const L = 2 + r * 3 + w;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y += base * d.v * dt;
      d.x += base * d.v * slant * dt;
      if (d.y >= d.end) {
        if (r > 0.15 && Math.random() < 0.6) splashes.push({ x: d.x, y: d.end, age: 0 });
        drops[i] = newDrop(false, slant);
        continue;
      }
      const len = L * (0.6 + 0.4 * (d.end - OY - HZ) / (H - OY - HZ));
      for (let k = 0; k < len; k++) put(d.x - slant * k, d.y - k, P.rain);
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.age += dt;
      if (s.age > 0.07) { splashes.splice(i, 1); continue; }
      put(s.x - 1, s.y - 1, P.rain); put(s.x + 1, s.y - 1, P.rain);
    }
  }
  function newDrop(anywhere, slant) {
    const end = OY + HZ - 4 + Math.random() * (H - OY - HZ + 4);
    return {
      x: Math.random() * (W + slant * H) - slant * H,
      y: anywhere ? Math.random() * end : -Math.random() * 30,
      end: end, v: 0.8 + Math.random() * 0.4
    };
  }

  function drawFog(b) {
    if (b < 0.01) return;
    for (let y = 0; y < H; y++) {
      const wy = y - OY;
      const dens = b * (0.9 * Math.exp(-Math.pow((wy - 132) / (22 + EB * 0.2), 2)) + 0.4 * Math.exp(-Math.pow((wy - 100) / 7, 2)));
      if (dens < 0.02) continue;
      const s1 = Math.floor(t * 3) + (y >> 3) * 29, s2 = Math.floor(t * -2) + (y >> 2) * 7;
      for (let x = 0; x < W; x++) {
        const n = 0.6 * fogN[(x + s1) & 255] + 0.4 * fogN[((x >> 1) + s2) & 255];
        if (dith(x, y, dens * (0.2 + 1.1 * n))) px[y * W + x] = pal[P.fog];
      }
    }
  }

  function drawGrain(wn) {
    const n = Math.round(W * H * wn * 0.07), amp = Math.round(14 * dim);
    for (let i = 0; i < n; i++) {
      const j = (Math.random() * px.length) | 0, c = px[j], d = Math.random() < 0.5 ? -amp : amp;
      const r = Math.max(0, Math.min(255, (c & 255) + d)), gg = Math.max(0, Math.min(255, ((c >> 8) & 255) + d)), bb = Math.max(0, Math.min(255, ((c >> 16) & 255) + d));
      px[j] = 0xff000000 | (bb << 16) | (gg << 8) | r;
    }
  }

  function makeBolt() {
    const r = Math.random;
    let x = OX + 10 + r() * 120, y = OY + 28 + r() * 14;
    const seg = [];
    while (y < OY + HZ) {
      const nx = x + (r() - 0.5) * 7, ny = y + 3 + r() * 5;
      const steps = Math.ceil(Math.max(Math.abs(nx - x), ny - y));
      for (let k = 0; k <= steps; k++) seg.push([Math.round(x + (nx - x) * k / steps), Math.round(y + (ny - y) * k / steps)]);
      if (r() < 0.15) {
        let bx = nx, by = ny;
        for (let k = 0; k < 8; k++) { bx += (r() < 0.5 ? -1 : 1); by += 1; seg.push([bx, by]); }
      }
      x = nx; y = ny;
    }
    return seg;
  }

  /* ---------- frame ---------- */
  function step(dt) {
    t += dt;
    const k = 1 - Math.exp(-dt / 0.35);
    LAYERS.forEach(l => { lv[l.id] += (effLevel(l.id) - lv[l.id]) * k; });
    if ((todAt -= dt) <= 0) { tod = timeOfDay(); phase = moonPhase(); todAt = 30; }

    // sleep timer: follow the audio fade, stay dim after the timer ends
    let target = 1;
    if (state.slept) target = 0.35;
    else if (state.playing && state.timerEnd) {
      const left = (state.timerEnd - Date.now()) / 1000, fl = state.fadeLen || 90;
      if (left < fl) target = 0.35 + 0.65 * Math.pow(Math.cos((1 - Math.max(0, left) / fl) * Math.PI / 2), 2);
    }
    dim += (target - dim) * (1 - Math.exp(-dt / 0.6));

    // lightning and chimes come from the audio while it plays; while paused the scene makes its own
    if (!state.playing) {
      if (lv.thunder > 0.02 && (nextFakeThunder -= dt) <= 0) { strikeLightning(0.5 + Math.random() * 0.5); nextFakeThunder = (22 + Math.random() * 50) / (0.6 + lv.thunder); }
      if (lv.chimes > 0.02 && (nextFakeGust -= dt) <= 0) {
        const n = 2 + Math.floor(Math.random() * 5);
        for (let i = 0, d = 0; i < n; i++, d += 0.07 + Math.random() * 0.35) pending.push({ at: t + d, kind: 'chime' });
        nextFakeGust = 5 + Math.random() * 16;
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= t) { if (pending[i].kind === 'chime') strikeChime(); pending.splice(i, 1); }
    }
    boltAge += dt;
    const fa = boltAge;
    flash = boltI * (Math.exp(-fa / 0.07) + (fa > 0.16 ? 0.7 * Math.exp(-(fa - 0.16) / 0.12) : 0));
    if (flash < 0.01) flash = 0;
    flick = 0.88 + 0.08 * Math.sin(t * 11) + 0.04 * Math.sin(t * 23 + 1);
  }

  function strikeLightning(i) {
    bolt = makeBolt(); boltAge = 0;
    boltI = Math.min(1, i) * (0.4 + 0.6 * Math.min(1, lv.thunder * 1.6));
  }
  function strikeChime() {
    const tb = tubes[Math.floor(Math.random() * tubes.length)];
    tb.w += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
    tb.glint = 1;
  }

  function draw(dt) {
    dt = dt || 0;
    const r = lv.rain, th = lv.thunder, w = lv.wind;
    const cover = Math.min(1, r * 1.1 + th * 1.2 + 0.08), dark = Math.min(0.9, r * 0.55 + th * 0.9);
    const night = buildPalette(dark, lv.pink * 0.45);
    for (let i = 0; i < px.length; i++) px[i] = pal[idx[i]];
    drawSky(night, cover, w);
    drawSea(lv.ocean);
    drawCreek(lv.stream);
    drawPuddles(r, dt);
    tufts.forEach(tf => {
      const sw = w * 2 * Math.sin(t * (1.5 + w * 2) + tf.p) + w * 1.5;
      for (let b = -1; b <= 1; b++) for (let k = 0; k <= tf.h - (b ? 1 : 0); k++) {
        wput(tf.x + b * 1.2 + sw * k / tf.h * (b ? 0.8 : 1), tf.y - k, k === tf.h ? P.grassHi : P.grass2);
      }
    });
    A.trees.forEach((tr, i) => {
      const sway = w * (2 + tr.h / 18) * (0.6 * Math.sin(t * (0.7 + w * 1.6) + i * 1.3) + 0.4 * Math.sin(t * 1.9 + i)) + w * 2.5;
      if (tr.y < 140) drawPine(tr, sway);
    });
    drawCabinBits(lv.fire, lv.fan, w, night, dt);
    drawSmoke(lv.fire, w, dt);
    A.trees.forEach((tr, i) => {
      const sway = w * (2 + tr.h / 18) * (0.6 * Math.sin(t * (0.7 + w * 1.6) + i * 1.3) + 0.4 * Math.sin(t * 1.9 + i)) + w * 2.5;
      if (tr.y >= 140) drawPine(tr, sway);
    });
    drawRain(r, w, dt);
    drawFog(lv.brown);
    drawGrain(lv.white);
    g.putImageData(img, 0, 0);
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return;
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    step(dt);
    draw(dt);
  }
  function start() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

  /* ---------- keep the cabin in view beside an open panel ---------- */
  let inset = { right: 0, bottom: 0 };
  function applyInset() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = parseFloat(cv.style.left) || 0, top = parseFloat(cv.style.top) || 0;
    const fx = left + (224 + OX) * scale, fy = top + (118 + OY) * scale;
    const dx = inset.right ? Math.max(-inset.right, Math.min(0, (vw - inset.right) / 2 - fx)) : 0;
    const dy = inset.bottom ? Math.max(-inset.bottom, Math.min(0, (vh - inset.bottom) * 0.55 - fy)) : 0;
    cv.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
  }

  window.addEventListener('resize', resize);
  resize();
  start();

  return {
    /* Called by the audio engine: 'thunder' with the roll's gain, 'chime' with the delay before the strike in seconds. */
    event(kind, a) {
      if (kind === 'thunder') strikeLightning(a || 1);
      else if (kind === 'chime') pending.push({ at: t + Math.max(0, a || 0), kind: 'chime' });
    },
    setInset(right, bottom) { inset = { right: right, bottom: bottom }; applyInset(); }
  };
})();

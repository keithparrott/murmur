'use strict';
/* Audio engine, layers, drift, transport and sleep timer. */
/* ---------- audio engine ---------- */
let ctx = null, nodes = null, bufs = null, layers = {}, routed = false;
const audioEl = $('#out');

function volGain(v) { return Math.pow(v, 2) * 0.9; }

function makeNoise(kind) {
  const sr = ctx.sampleRate, L = Math.floor(sr * 8), X = Math.floor(sr * 0.6);
  const raw = new Float32Array(L + X);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') {
      raw[i] = w;
    } else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last * 3.5;
    }
  }
  const buf = ctx.createBuffer(1, L, sr), d = buf.getChannelData(0);
  for (let i = 0; i < L; i++) {
    if (i < X) {
      const a = (i / X) * Math.PI / 2;
      d[i] = raw[i] * Math.sin(a) + raw[L + i] * Math.cos(a);
    } else {
      d[i] = raw[i];
    }
  }
  let s = 0;
  for (let i = 0; i < L; i++) s += d[i] * d[i];
  const k = 0.12 / (Math.sqrt(s / L) || 1);
  for (let i = 0; i < L; i++) d[i] *= k;
  return buf;
}

function makeDrops() {
  const sr = ctx.sampleRate, L = Math.floor(sr * 20);
  const buf = ctx.createBuffer(1, L, sr), d = buf.getChannelData(0);
  const events = 20 * 18;
  for (let e = 0; e < events; e++) {
    const start = Math.floor(Math.random() * L);
    const len = Math.floor(sr * (0.012 + Math.random() * 0.02));
    const amp = 0.25 + Math.random() * 0.75;
    const a = 0.15 + Math.random() * 0.6;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[(start + i) % L] += lp * Math.exp(-i / (len * 0.28)) * amp;
    }
  }
  let s = 0, pk = 0;
  for (let i = 0; i < L; i++) { s += d[i] * d[i]; }
  const k = 0.06 / (Math.sqrt(s / L) || 1);
  for (let i = 0; i < L; i++) { d[i] *= k; pk = Math.max(pk, Math.abs(d[i])); }
  if (pk > 0.95) { const f = 0.95 / pk; for (let i = 0; i < L; i++) d[i] *= f; }
  return buf;
}

function noiseSrc(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}
function filt(type, f, q) {
  const n = ctx.createBiquadFilter();
  n.type = type; n.frequency.value = f;
  if (q != null) n.Q.value = q;
  return n;
}
function panner(p) {
  if (!ctx.createStereoPanner) return null;
  const n = ctx.createStereoPanner(); n.pan.value = p; return n;
}
function lfo(freq, depth, target, P) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq; g.gain.value = depth;
  o.connect(g); g.connect(target); o.start();
  P.push(o, g);
}
function wide(buf, chain, out, P) {
  [-0.7, 0.7].forEach(p => {
    const s = noiseSrc(buf); P.push(s);
    const tail = chain(s);
    const pn = panner(p);
    if (pn) { P.push(pn); tail.connect(pn); pn.connect(out); } else { tail.connect(out); }
  });
}

function makeThunder() {
  const sr = ctx.sampleRate, len = Math.floor(sr * 16);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const bumps = [];
  let tb = 0.3;
  const nb = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < nb; i++) {
    bumps.push({ t: tb, a: (i === 0 ? 0.6 : 0.2) + Math.random() * 0.5, tau: 0.8 + Math.random() * 2.2 });
    tb += 0.4 + Math.random() * 2.4;
  }
  const crack = Math.random() < 0.5;
  let br = 0, l1 = 0, l2 = 0;
  for (let i = 0; i < len; i++) {
    const x = i / sr;
    let env = (1 - Math.exp(-x / 0.7)) * Math.exp(-x / 3.8) * 0.7;
    for (let b = 0; b < bumps.length; b++) {
      const u = bumps[b];
      if (x >= u.t) env += u.a * 0.5 * Math.exp(-(x - u.t) / u.tau);
    }
    const w = Math.random() * 2 - 1;
    br = (br + 0.02 * w) / 1.02;
    const a = 0.015 + 0.06 * Math.exp(-x / 2.5);
    l1 += a * (br * 3.5 - l1);
    l2 += a * (l1 - l2);
    let v = l2 * env;
    if (crack && x < 0.12) v += w * Math.exp(-x / 0.02) * 0.12;
    d[i] = v;
  }
  const fadeIn = Math.floor(sr * 0.005), fadeOut = Math.floor(sr * 1.5);
  let pk = 0;
  for (let i = 0; i < len; i++) {
    if (i < fadeIn) d[i] *= i / fadeIn;
    if (i > len - fadeOut) { const k = (len - i) / fadeOut; d[i] *= k * k; }
    pk = Math.max(pk, Math.abs(d[i]));
  }
  const k = 0.9 / (pk || 1);
  for (let i = 0; i < len; i++) d[i] *= k;
  return buf;
}

function makeCrackle() {
  const sr = ctx.sampleRate, L = Math.floor(sr * 30);
  const buf = ctx.createBuffer(1, L, sr), d = buf.getChannelData(0);
  const pop = (pos, amp) => {
    const len = Math.floor(sr * (0.002 + Math.random() * 0.012));
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[(pos + i) % L] += (w - prev * 0.6) * Math.exp(-i / (len * 0.35)) * amp;
      prev = w;
    }
  };
  const singles = 30 * 7;
  for (let n = 0; n < singles; n++) pop(Math.floor(Math.random() * L), Math.pow(Math.random(), 2.2) * 0.9 + 0.05);
  const clusters = 30 * 0.5;
  for (let c = 0; c < clusters; c++) {
    const pos = Math.floor(Math.random() * L), cnt = 3 + Math.floor(Math.random() * 6);
    for (let k = 0; k < cnt; k++) pop((pos + Math.floor(Math.random() * sr * 0.18)) % L, Math.pow(Math.random(), 1.8) * 0.8 + 0.05);
  }
  let pk = 0;
  for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.9 / (pk || 1);
  for (let i = 0; i < L; i++) d[i] *= k;
  return buf;
}

/* Bubbles: a resonator rung by a soft burst of noise that dies within a few
   cycles, so each one is a short plip rather than a ping. Many small, quiet
   ones overlap into a trickle; the buffer is scaled by its peak. */
function makeBubbles() {
  const sr = ctx.sampleRate, L = Math.floor(sr * 20);
  const buf = ctx.createBuffer(1, L, sr), d = buf.getChannelData(0);
  const blip = (start, amp) => {
    const f0 = 700 * Math.pow(4, Math.random()), dur = (2 + Math.random() * 2) / f0;
    const len = Math.floor(sr * dur * 5), rise = Math.random() * 0.06;
    const r = Math.exp(-1 / (dur * sr)), ex = Math.floor(sr * 0.001);
    const norm = 2 * (1 - r) * Math.sin(6.2832 * f0 / sr) * amp;
    let y1 = 0, y2 = 0, e = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / sr, f = f0 * (1 + rise * (1 - Math.exp(-tt / dur)));
      e += 0.35 * ((i < ex ? (Math.random() * 2 - 1) * (1 - i / ex) : 0) - e);
      const y = 2 * r * Math.cos(6.2832 * f / sr) * y1 - r * r * y2 + e;
      y2 = y1; y1 = y;
      d[(start + i) % L] += y * norm;
    }
  };
  const loud = () => Math.pow(Math.random(), 2.5);
  for (let e = 0; e < 20 * 90; e++) blip(Math.floor(Math.random() * L), 0.05 + loud() * 0.6);
  for (let c = 0; c < 20 * 8; c++) {
    const pos = Math.floor(Math.random() * L), cnt = 3 + Math.floor(Math.random() * 6);
    for (let k = 0; k < cnt; k++) blip(pos + Math.floor(Math.random() * sr * 0.15), 0.05 + loud() * 0.5);
  }
  let pk = 0;
  for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(d[i]));
  const g = 0.9 / (pk || 1);
  for (let i = 0; i < L; i++) d[i] *= g;
  return buf;
}

/* Babbling water: noise split into several bands from about 450 Hz to
   3.6 kHz. Each band drifts a little in pitch and swells in and out on its
   own, so the water churns without any one resonance sweeping like a voice. */
function makeBrook() {
  const sr = ctx.sampleRate, L = Math.floor(sr * 24), X = Math.floor(sr * 0.5);
  const raw = new Float32Array(L + X), n = raw.length;
  const smooth = (fc) => {
    const w = 2 * Math.PI * fc / sr, al = Math.sin(w) / Math.SQRT2, c = Math.cos(w), a0 = 1 + al;
    const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
    const out = new Float32Array(n);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1, y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y; s2 += y * y;
    }
    const k = 1 / (Math.sqrt(s2 / n) || 1);
    for (let i = 0; i < n; i++) out[i] *= k;
    return out;
  };
  const BANDS = 6;
  for (let v = 0; v < BANDS; v++) {
    const base = 450 * Math.pow(8, v / (BANDS - 1)) * (0.9 + Math.random() * 0.2);
    const amp = Math.pow(450 / base, 0.25), Q = 5;
    const wob = smooth(5 + Math.random() * 6), env = smooth(2 + Math.random() * 3);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, a1 = 0, a2 = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 7) === 0) {
        const w = 2 * Math.PI * base * (1 + 0.1 * wob[i]) / sr, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
        b0 = al / a0; a1 = -2 * Math.cos(w) / a0; a2 = (1 - al) / a0;
      }
      const x = Math.random() * 2 - 1, y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const e = Math.max(0, 0.4 + env[i]);
      raw[i] += y * e * e * amp;
    }
  }
  const buf = ctx.createBuffer(1, L, sr), d = buf.getChannelData(0);
  for (let i = 0; i < L; i++) {
    if (i < X) {
      const a = (i / X) * Math.PI / 2;
      d[i] = raw[i] * Math.sin(a) + raw[L + i] * Math.cos(a);
    } else {
      d[i] = raw[i];
    }
  }
  let s = 0;
  for (let i = 0; i < L; i++) s += d[i] * d[i];
  const g = 0.07 / (Math.sqrt(s / L) || 1);
  for (let i = 0; i < L; i++) {
    const v = d[i] * g, m = Math.abs(v);
    d[i] = m > 0.7 ? Math.sign(v) * (0.7 + 0.25 * Math.tanh((m - 0.7) / 0.25)) : v;
  }
  return buf;
}

function applyRainSurface(L, instant) {
  if (!L || !L.sf || !ctx) return;
  const S = SURF[state.surface] || SURF.open, t = ctx.currentTime;
  const set = (prm, v) => {
    if (instant) { prm.cancelScheduledValues(t); prm.value = v; }
    else prm.setTargetAtTime(v, t, 0.25);
  };
  L.sf.bed.forEach(n => {
    set(n.hp.frequency, S.bed.hp); set(n.lp.frequency, S.bed.lp); set(n.g.gain, S.bed.g);
    set(n.pk1.frequency, S.bed.pk1[0]); set(n.pk1.Q, S.bed.pk1[1]); set(n.pk1.gain, S.bed.pk1[2]);
    set(n.pk2.frequency, S.bed.pk2[0]); set(n.pk2.Q, S.bed.pk2[1]); set(n.pk2.gain, S.bed.pk2[2]);
  });
  L.sf.drop.forEach(n => {
    set(n.lp.frequency, S.drop.lp); set(n.g.gain, S.drop.g);
    set(n.pk.frequency, S.drop.pk[0]); set(n.pk.Q, S.drop.pk[1]); set(n.pk.gain, S.drop.pk[2]);
  });
}

const BUILD = {
  rain(L, P) {
    L.sf = { bed: [], drop: [] };
    wide(bufs.pink, s => {
      const hp = filt('highpass', 650, 0.4), pk1 = filt('peaking', 1500, 0.8), pk2 = filt('peaking', 3000, 0.8);
      const lp = filt('lowpass', 7000, 0.4), g = ctx.createGain();
      P.push(hp, pk1, pk2, lp, g);
      s.connect(hp); hp.connect(pk1); pk1.connect(pk2); pk2.connect(lp); lp.connect(g);
      L.sf.bed.push({ hp, pk1, pk2, lp, g });
      return g;
    }, L.gain, P);
    wide(bufs.drops, s => {
      const lp = filt('lowpass', 12000, 0.5), pk = filt('peaking', 3000, 1), g = ctx.createGain();
      P.push(lp, pk, g);
      s.connect(lp); lp.connect(pk); pk.connect(g);
      L.sf.drop.push({ lp, pk, g });
      return g;
    }, L.gain, P);
    applyRainSurface(L, true);
  },
  wind(L, P) {
    wide(bufs.pink, s => {
      const bp = filt('bandpass', 520, 1.3), amp = ctx.createGain();
      amp.gain.value = 0.6; P.push(bp, amp);
      lfo(0.05 + Math.random() * 0.07, 280, bp.frequency, P);
      lfo(0.17 + Math.random() * 0.1, 90, bp.frequency, P);
      lfo(0.035 + Math.random() * 0.05, 0.35, amp.gain, P);
      s.connect(bp); bp.connect(amp); return amp;
    }, L.gain, P);
  },
  ocean(L, P) {
    wide(bufs.brown, s => {
      const lp = filt('lowpass', 420, 0.6), sw = ctx.createGain();
      sw.gain.value = 0.6; P.push(lp, sw);
      const f1 = 0.085 + Math.random() * 0.02;
      lfo(f1, 380, lp.frequency, P);
      lfo(f1, 0.45, sw.gain, P);
      lfo(0.13 + Math.random() * 0.03, 0.1, sw.gain, P);
      s.connect(lp); lp.connect(sw);
      const foam = noiseSrc(bufs.pink), hp = filt('highpass', 1800, 0.5), fg = ctx.createGain();
      fg.gain.value = 0.12; P.push(foam, hp, fg);
      foam.connect(hp); hp.connect(fg); fg.connect(sw);
      return sw;
    }, L.gain, P);
  },
  brown(L, P) {
    wide(bufs.brown, s => { const g = ctx.createGain(); P.push(g); s.connect(g); return g; }, L.gain, P);
  },
  pink(L, P) {
    wide(bufs.pink, s => { const g = ctx.createGain(); P.push(g); s.connect(g); return g; }, L.gain, P);
  },
  thunder(L, P) {
    if (!bufs.thunder) bufs.thunder = [makeThunder(), makeThunder(), makeThunder()];
    let timer = 0;
    function boom() {
      if (ctx.state === 'running' && state.playing) {
        const s = ctx.createBufferSource(), g = ctx.createGain(), pn = panner(Math.random() * 1.2 - 0.6);
        s.buffer = bufs.thunder[Math.floor(Math.random() * bufs.thunder.length)];
        s.playbackRate.value = 0.85 + Math.random() * 0.3;
        g.gain.value = 0.4 + Math.random() * 0.6;
        s.connect(g);
        if (pn) { g.connect(pn); pn.connect(L.gain); } else { g.connect(L.gain); }
        s.onended = () => { try { s.disconnect(); g.disconnect(); if (pn) pn.disconnect(); } catch (e) {} };
        s.start();
        scene.event('thunder', g.gain.value);
      }
      timer = setTimeout(boom, (22 + Math.random() * 50) * 1000);
    }
    timer = setTimeout(boom, 3000 + Math.random() * 5000);
    L.onKill.push(() => clearTimeout(timer));
  },
  stream(L, P) {
    if (!bufs.bubbles) bufs.bubbles = makeBubbles();
    if (!bufs.brook) bufs.brook = makeBrook();
    wide(bufs.brook, s => {
      const hp = filt('highpass', 180, 0.6), lp = filt('lowpass', 5000, 0.5), g = ctx.createGain();
      g.gain.value = 0.8; P.push(hp, lp, g);
      lfo(0.04 + Math.random() * 0.04, 0.12, g.gain, P);
      s.connect(hp); hp.connect(lp); lp.connect(g); return g;
    }, L.gain, P);
    wide(bufs.pink, s => {
      const hp = filt('highpass', 900, 0.5), bp = filt('bandpass', 2800, 0.8), g = ctx.createGain();
      g.gain.value = 0.3; P.push(hp, bp, g);
      lfo(0.05 + Math.random() * 0.05, 500, bp.frequency, P);
      lfo(0.11 + Math.random() * 0.1, 0.1, g.gain, P);
      s.connect(hp); hp.connect(bp); bp.connect(g); return g;
    }, L.gain, P);
    wide(bufs.bubbles, s => {
      const lp = filt('lowpass', 4500, 0.5), g = ctx.createGain();
      g.gain.value = 0.38; P.push(lp, g);
      s.connect(lp); lp.connect(g); return g;
    }, L.gain, P);
  },
  fan(L, P) {
    wide(bufs.pink, s => {
      const hp = filt('highpass', 70, 0.5), lp = filt('lowpass', 2000, 0.6), g = ctx.createGain();
      P.push(hp, lp, g);
      s.connect(hp); hp.connect(lp); lp.connect(g); return g;
    }, L.gain, P);
    const f0 = 104 + Math.random() * 20;
    [[1, 0.022], [2, 0.009], [3, 0.004]].forEach((h, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f0 * h[0]; g.gain.value = h[1];
      o.connect(g); g.connect(L.gain); o.start(); P.push(o, g);
      if (i === 0) lfo(0.4 + Math.random() * 0.3, h[1] * 0.2, g.gain, P);
    });
  },
  fire(L, P) {
    if (!bufs.crackle) bufs.crackle = makeCrackle();
    wide(bufs.brown, s => {
      const lp = filt('lowpass', 380, 0.7), g = ctx.createGain();
      g.gain.value = 0.8; P.push(lp, g);
      lfo(0.3 + Math.random() * 0.4, 0.22, g.gain, P);
      s.connect(lp); lp.connect(g); return g;
    }, L.gain, P);
    wide(bufs.pink, s => {
      const bp = filt('bandpass', 3200, 0.6), g = ctx.createGain();
      g.gain.value = 0.07; P.push(bp, g);
      lfo(0.7 + Math.random() * 0.6, 0.04, g.gain, P);
      s.connect(bp); bp.connect(g); return g;
    }, L.gain, P);
    wide(bufs.crackle, s => {
      const g = ctx.createGain(); g.gain.value = 0.55; P.push(g);
      s.connect(g); return g;
    }, L.gain, P);
  },
  chimes(L, P) {
    const sr = ctx.sampleRate, irLen = Math.floor(sr * 2.4), ir = ctx.createBuffer(2, irLen, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
    }
    const conv = ctx.createConvolver(), wet = ctx.createGain(), dry = ctx.createGain(), bus = ctx.createGain();
    conv.buffer = ir; wet.gain.value = 0.45; dry.gain.value = 0.8;
    P.push(conv, wet, dry, bus);
    bus.connect(dry); bus.connect(conv); conv.connect(wet);
    dry.connect(L.gain); wet.connect(L.gain);
    const notes = [587.33, 659.25, 739.99, 880, 987.77, 1174.66];
    const partials = [[1, 1, 3.6], [2.76, 0.28, 1.8], [5.4, 0.1, 0.8]];
    let prev = -1, timer = 0;
    function strike(t, amp) {
      let i;
      do { i = Math.floor(Math.random() * notes.length); } while (i === prev);
      prev = i;
      const f = notes[i] * (1 + (Math.random() - 0.5) * 0.004);
      partials.forEach(pt => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * pt[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp * pt[1], t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + pt[2]);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + pt[2] + 0.1);
        o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) {} };
      });
    }
    function gust() {
      if (ctx.state === 'running' && state.playing) {
        const n = 2 + Math.floor(Math.random() * 5);
        let t = ctx.currentTime + 0.03;
        for (let k = 0; k < n; k++) {
          strike(t, 0.16 + Math.random() * 0.2);
          scene.event('chime', t - ctx.currentTime);
          t += 0.07 + Math.random() * 0.35;
        }
      }
      timer = setTimeout(gust, (5 + Math.random() * 16) * 1000);
    }
    timer = setTimeout(gust, 1200);
    L.onKill.push(() => clearTimeout(timer));
  },
  white(L, P) {
    wide(bufs.white, s => {
      const lp = filt('lowpass', 9500, 0.5); P.push(lp); s.connect(lp); return lp;
    }, L.gain, P);
  }
};

function createLayer(def) {
  const L = { id: def.id, trim: def.trim, built: false, parts: [], onKill: [], target: 0, td: 0 };
  L.gain = ctx.createGain();
  L.gain.gain.value = 0;
  L.gain.connect(nodes.vol);
  L.build = function () {
    L.parts = [];
    BUILD[def.id](L, L.parts);
    L.built = true;
  };
  L.kill = function () {
    L.onKill.forEach(fn => { try { fn(); } catch (e) {} });
    L.onKill = [];
    L.parts.forEach(p => {
      try { if (p.stop) p.stop(); } catch (e) {}
      try { p.disconnect(); } catch (e) {}
    });
    L.parts = []; L.built = false;
  };
  return L;
}

function ensureCtx() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC({ latencyHint: 'playback' });
  bufs = { white: makeNoise('white'), pink: makeNoise('pink'), brown: makeNoise('brown'), drops: makeDrops() };
  nodes = {
    vol: ctx.createGain(), fade: ctx.createGain(), play: ctx.createGain(),
    comp: ctx.createDynamicsCompressor(), an: ctx.createAnalyser()
  };
  nodes.vol.gain.value = volGain(state.vol);
  nodes.fade.gain.value = 1;
  nodes.play.gain.value = 0;
  nodes.comp.threshold.value = -12;
  nodes.comp.knee.value = 10;
  nodes.comp.ratio.value = 12;
  nodes.comp.attack.value = 0.003;
  nodes.comp.release.value = 0.25;
  nodes.an.fftSize = 2048;
  nodes.an.smoothingTimeConstant = 0.82;
  nodes.an.minDecibels = -85;
  nodes.an.maxDecibels = -25;
  nodes.vol.connect(nodes.fade);
  nodes.fade.connect(nodes.play);
  nodes.play.connect(nodes.comp);
  nodes.comp.connect(nodes.an);
  nodes.comp.connect(ctx.destination);
  LAYERS.forEach(def => { layers[def.id] = createLayer(def); });
  fdata = new Uint8Array(nodes.an.frequencyBinCount);
  return true;
}

async function routeOut() {
  if (routed) { try { await audioEl.play(); } catch (e) {} return; }
  try {
    if (!('srcObject' in audioEl) || !ctx.createMediaStreamDestination) return;
    const dest = ctx.createMediaStreamDestination();
    audioEl.srcObject = dest.stream;
    await audioEl.play();
    nodes.comp.connect(dest);
    nodes.comp.disconnect(ctx.destination);
    routed = true;
  } catch (e) { /* keep the direct output */ }
}

function setLayer(id, v) {
  const L = layers[id];
  if (!L || !ctx) return;
  L.target = v;
  if (v > 0.001 && !L.built) L.build();
  if (L.built) L.gain.gain.setTargetAtTime(Math.pow(v, 2.2) * L.trim, ctx.currentTime, 0.12);
  clearTimeout(L.td);
  if (v <= 0.001 && L.built) {
    L.td = setTimeout(() => { if (L.target <= 0.001) L.kill(); }, 1500);
  }
}

const dp = {};
LAYERS.forEach(l => {
  dp[l.id] = {
    p1: Math.random() * 6.283, p2: Math.random() * 6.283,
    f1: 1 / (150 + Math.random() * 120), f2: 1 / (55 + Math.random() * 50)
  };
});
function driftWave(id) {
  const t = Date.now() / 1000, d = dp[id];
  return 0.6 * Math.sin(6.283 * d.f1 * t + d.p1) + 0.4 * Math.sin(6.283 * d.f2 * t + d.p2);
}
function effLevel(id) {
  const v = state.levels[id];
  return state.drift && v > 0.03 ? clamp(v * (1 + 0.2 * driftWave(id)), 0, 1) : v;
}
function applyAll() {
  if (!ctx) return;
  LAYERS.forEach(l => setLayer(l.id, effLevel(l.id)));
}

/* ---------- transport ---------- */
let raf = 0, tickId = 0, tickN = 0, fdata = null;
const BANDS = 36;
const bandVals = new Float32Array(BANDS);

async function play() {
  if (!ensureCtx()) { setStatus('This browser cannot play Web Audio.', true); return; }
  try { await ctx.resume(); } catch (e) {}
  await routeOut();
  state.playing = true;
  state.slept = false;
  const t = ctx.currentTime, g = nodes.play.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(1, t + 0.9);
  applyAll();
  if (state.timerMin && !state.timerEnd) startTimer(state.timerMin);
  startLoops();
  mediaSession();
  renderTransport();
}

function pause(finished) {
  if (!ctx || !state.playing) return;
  state.playing = false;
  stopLoops();
  const t = ctx.currentTime, g = nodes.play.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + 0.6);
  state.timerEnd = null;
  state.slept = !!finished;
  if (finished) { state.timerMin = 0; renderChips(); }
  setTimeout(() => {
    if (state.playing) return;
    nodes.fade.gain.cancelScheduledValues(0);
    nodes.fade.gain.value = 1;
    try { ctx.suspend(); } catch (e) {}
    try { audioEl.pause(); } catch (e) {}
  }, 750);
  bandVals.fill(0);
  drawScope(false);
  renderTransport(finished ? 'Timer finished. Sleep well.' : null);
}

function mediaSession() {
  try {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Soundscape', artist: 'Murmur' });
    navigator.mediaSession.setActionHandler('play', () => { play(); });
    navigator.mediaSession.setActionHandler('pause', () => { pause(); });
  } catch (e) {}
}

function startLoops() {
  stopLoops();
  raf = requestAnimationFrame(frame);
  tickId = setInterval(tick, 250);
}
function stopLoops() {
  cancelAnimationFrame(raf); raf = 0;
  clearInterval(tickId); tickId = 0;
}
function tick() {
  tickN++;
  if (state.drift && tickN % 2 === 0) applyAll();
  if (state.timerEnd && Date.now() >= state.timerEnd) { pause(true); return; }
  renderTimerLine();
}

/* ---------- sleep timer ---------- */
function clearFade() {
  if (!ctx) return;
  const t = ctx.currentTime, g = nodes.fade.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(1, t, 0.2);
}
function startTimer(min) {
  state.timerEnd = Date.now() + min * 60000;
  scheduleFade();
}
function scheduleFade() {
  if (!ctx || !state.playing || !state.timerEnd) return;
  const total = Math.max(0.2, (state.timerEnd - Date.now()) / 1000);
  const fadeLen = Math.min(90, total);
  state.fadeLen = Math.round(fadeLen);
  const n = 128, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = Math.pow(Math.cos((i / (n - 1)) * Math.PI / 2), 2);
  const g = nodes.fade.gain, t = ctx.currentTime;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.setValueCurveAtTime(curve, t + Math.max(0.05, total - fadeLen), fadeLen);
  } catch (e) {}
}
function setTimer(min) {
  state.timerMin = min;
  if (!min) {
    state.timerEnd = null;
    clearFade();
  } else if (state.playing) {
    startTimer(min);
  } else {
    state.timerEnd = null;
  }
  renderChips();
  renderTimerLine();
}
function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = (h ? String(m).padStart(2, '0') : String(m)), ss = String(s).padStart(2, '0');
  return (h ? h + ':' : '') + mm + ':' + ss;
}

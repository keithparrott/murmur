'use strict';
/* Spectrum scope, mixer, transport UI, presets, storage and boot. Loaded last. */
/* ---------- scope ---------- */
const cv = $('#scope'), c2 = cv.getContext('2d');
let cw = 1, chh = 1, dpr = 1, colAccent = '#e9a95a', colRaise = '#1f2d2b', frameN = 0, lastDraw = 0;
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  colAccent = cs.getPropertyValue('--accent').trim() || colAccent;
  colRaise = cs.getPropertyValue('--raise').trim() || colRaise;
}
function sizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cw = Math.max(1, Math.round(r.width * dpr));
  chh = Math.max(1, Math.round(r.height * dpr));
  cv.width = cw; cv.height = chh;
  readColors();
  drawScope(state.playing);
}
function drawScope(on) {
  c2.clearRect(0, 0, cw, chh);
  const gap = 2 * dpr, bw = (cw - gap * (BANDS - 1)) / BANDS;
  for (let i = 0; i < BANDS; i++) {
    const v = on ? bandVals[i] : 0;
    const h = Math.max(2 * dpr, v * chh);
    c2.fillStyle = v > 0.03 ? colAccent : colRaise;
    c2.fillRect(i * (bw + gap), chh - h, bw, h);
  }
}
function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (ts - lastDraw < 33) return;
  lastDraw = ts;
  if (frameN++ % 45 === 0) readColors();
  nodes.an.getByteFrequencyData(fdata);
  const nyq = ctx.sampleRate / 2, bins = fdata.length;
  for (let i = 0; i < BANDS; i++) {
    const f0 = 40 * Math.pow(300, i / BANDS), f1 = 40 * Math.pow(300, (i + 1) / BANDS);
    const b0 = Math.floor(f0 / nyq * bins), b1 = Math.max(b0 + 1, Math.ceil(f1 / nyq * bins));
    let m = 0;
    for (let b = b0; b < b1 && b < bins; b++) m = Math.max(m, fdata[b]);
    const v = Math.pow(m / 255, 1.5);
    bandVals[i] = Math.max(v, bandVals[i] * 0.9);
  }
  drawScope(true);
}

/* ---------- UI: mixer ---------- */
const ICONS = {
  rain: '<path d="M6.5 14.5H17a3.5 3.5 0 0 0 .4-6.97A5 5 0 0 0 7.7 7.9a3.4 3.4 0 0 0-1.2 6.6z"/><path d="M8.5 17.5l-1 2.5M12 17.5l-1 2.5M15.5 17.5l-1 2.5"/>',
  thunder: '<path d="M13 3L5.5 13.5H11L10 21l8-11h-5.5L13 3z"/>',
  wind: '<path d="M3 9h9.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 14h13a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 19h5"/>',
  ocean: '<path d="M2 9c2.5-3 4.5-3 7 0s4.5 3 7 0 4-2 6 0"/><path d="M2 15c2.5-3 4.5-3 7 0s4.5 3 7 0 4-2 6 0"/>',
  stream: '<path d="M8 3c4 2.5-3 5 1 8s-3 5.5 1 10"/><path d="M15 3c4 2.5-3 5 1 8s-3 5.5 1 10"/>',
  fan: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.4"/><path d="M12 12Q9.5 6 13.5 4.5Q16 7.5 12 12z"/><path transform="rotate(90 12 12)" d="M12 12Q9.5 6 13.5 4.5Q16 7.5 12 12z"/><path transform="rotate(180 12 12)" d="M12 12Q9.5 6 13.5 4.5Q16 7.5 12 12z"/><path transform="rotate(270 12 12)" d="M12 12Q9.5 6 13.5 4.5Q16 7.5 12 12z"/>',
  fire: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2.2-4.8.2 1.6 1 2.3 1.8 2.3C11.2 8.2 10.8 5.5 12 3z"/><path d="M12 20a2.5 2.5 0 0 1-2.5-2.5c0-1.6 1.5-2.6 2.5-4 1 1.4 2.5 2.4 2.5 4A2.5 2.5 0 0 1 12 20z"/>',
  chimes: '<path d="M4 4.5h16"/><path d="M6.5 4.5V8M10 4.5V8M13.5 4.5V8M17 4.5V8"/><rect x="5.4" y="8" width="2.2" height="8" rx="1.1"/><rect x="8.9" y="8" width="2.2" height="11" rx="1.1"/><rect x="12.4" y="8" width="2.2" height="7" rx="1.1"/><rect x="15.9" y="8" width="2.2" height="10" rx="1.1"/>',
  brown: '<path stroke-width="2.6" d="M5 20V4M9.5 20V9M14 20V13M18.5 20V16"/>',
  pink: '<path stroke-width="2.6" d="M5 20V6M9.5 20V9M14 20V11M18.5 20V13"/>',
  white: '<path stroke-width="2.6" d="M5 20V9M9.5 20V9M14 20V9M18.5 20V9"/>'
};

const mixer = $('#mixer');
function buildSurface() {
  const wrap = document.createElement('div');
  wrap.className = 'seg surf'; wrap.id = 'surf';
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Rain surface');
  SURFACES.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.surface = k; b.textContent = SURF[k].label;
    b.setAttribute('aria-pressed', String(k === state.surface));
    b.addEventListener('click', () => { setSurface(k); renderPresets(); });
    wrap.append(b);
  });
  return wrap;
}
function setSurface(k) {
  if (!SURF[k]) k = 'open';
  state.surface = k;
  document.querySelectorAll('#surf .chip').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.surface === k));
  });
  if (ctx && layers.rain && layers.rain.built) applyRainSurface(layers.rain, false);
}
function buildChannel(l) {
  const row = document.createElement('div');
  row.className = 'ch'; row.id = 'ch-' + l.id;
  const icw = document.createElement('div'); icw.className = 'ch-icon';
  const ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ic.setAttribute('viewBox', '0 0 24 24'); ic.setAttribute('aria-hidden', 'true');
  ic.innerHTML = ICONS[l.id];
  icw.append(ic);
  const body = document.createElement('div'); body.className = 'ch-body';
  const head = document.createElement('div'); head.className = 'ch-head';
  const lab = document.createElement('label'); lab.htmlFor = 's-' + l.id; lab.textContent = l.name;
  const val = document.createElement('span'); val.className = 'ch-val'; val.id = 'v-' + l.id; val.textContent = '0';
  head.append(lab, val);
  const input = document.createElement('input');
  input.type = 'range'; input.id = 's-' + l.id; input.min = 0; input.max = 100; input.step = 1; input.value = 0;
  const note = document.createElement('p'); note.className = 'ch-note'; note.textContent = l.note;
  body.append(head, input);
  if (l.id === 'rain') body.append(buildSurface());
  body.append(note);
  row.append(icw, body);
  input.addEventListener('input', () => {
    cancelAnim();
    state.levels[l.id] = input.valueAsNumber / 100;
    paintSlider(l.id);
    if (ctx) applyAll();
    renderPresets();
  });
  return row;
}
const layerById = Object.fromEntries(LAYERS.map(l => [l.id, l]));
GROUPS.forEach(g => {
  const wrap = document.createElement('div');
  wrap.className = 'grp';
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', g.title);
  const t = document.createElement('p'); t.className = 'label grp-title'; t.textContent = g.title;
  wrap.append(t);
  g.ids.forEach(id => wrap.append(buildChannel(layerById[id])));
  mixer.append(wrap);
});
function paintSlider(id) {
  const input = $('#s-' + id), v = state.levels[id];
  input.value = Math.round(v * 100);
  input.style.setProperty('--p', Math.round(v * 100) + '%');
  $('#v-' + id).textContent = String(Math.round(v * 100));
  $('#ch-' + id).classList.toggle('on', v > 0.001);
}
function paintAll() { LAYERS.forEach(l => paintSlider(l.id)); }

const volEl = $('#vol');
function paintVol() {
  volEl.value = Math.round(state.vol * 100);
  volEl.style.setProperty('--p', Math.round(state.vol * 100) + '%');
  $('#vol-val').textContent = String(Math.round(state.vol * 100));
}
volEl.addEventListener('input', () => {
  state.vol = volEl.valueAsNumber / 100;
  paintVol();
  if (ctx) nodes.vol.gain.setTargetAtTime(volGain(state.vol), ctx.currentTime, 0.05);
});

const driftBtn = $('#drift');
driftBtn.addEventListener('click', () => {
  setDrift(!state.drift);
  renderPresets();
});
function setDrift(on) {
  state.drift = !!on;
  driftBtn.setAttribute('aria-checked', state.drift ? 'true' : 'false');
  if (ctx) applyAll();
}

/* ---------- UI: transport ---------- */
function setStatus(text, isErr) {
  const el = $('#status');
  el.textContent = text;
  el.className = isErr ? 'err' : '';
}
function renderTransport(msg) {
  $('#icon-play').toggleAttribute('hidden', state.playing);
  $('#icon-pause').toggleAttribute('hidden', !state.playing);
  $('#play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  setStatus(msg || (state.playing ? 'Playing' : 'Paused'));
  renderTimerLine();
}
function renderChips() {
  document.querySelectorAll('#timer-seg .chip').forEach(b => {
    b.setAttribute('aria-pressed', String(+b.dataset.min === state.timerMin));
  });
}
function renderTimerLine() {
  const line = $('#timer-line'), st = $('#status-timer');
  if (state.timerEnd && state.playing) {
    const left = (state.timerEnd - Date.now()) / 1000;
    line.textContent = fmt(left) + ' left. Volume fades over the last ' + state.fadeLen + ' seconds.';
    st.textContent = fmt(left) + ' left';
  } else if (state.timerMin) {
    line.textContent = state.timerMin + ' minutes. The countdown starts when you press play.';
    st.textContent = '';
  } else {
    line.textContent = 'Timer off.';
    st.textContent = '';
  }
}
$('#play').addEventListener('click', () => { state.playing ? pause() : play(); });
$('#timer-seg').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (b) setTimer(+b.dataset.min);
});

/* ---------- presets ---------- */
let anim = 0;
function cancelAnim() { if (anim) { cancelAnimationFrame(anim); anim = 0; } }
function cleanLevels(o) {
  const r = {};
  LAYERS.forEach(l => {
    const v = o ? +o[l.id] : 0;
    r[l.id] = isFinite(v) ? clamp(v, 0, 1) : 0;
  });
  return r;
}
function loadMix(p, instant) {
  cancelAnim();
  const to = cleanLevels(p.levels);
  setDrift(!!p.drift);
  setSurface(p.surface || 'open');
  if (instant) {
    LAYERS.forEach(l => { state.levels[l.id] = to[l.id]; });
    paintAll(); if (ctx) applyAll(); renderPresets();
    return;
  }
  const from = Object.assign({}, state.levels), t0 = performance.now(), dur = 1200;
  (function step(now) {
    const k = clamp((now - t0) / dur, 0, 1), e = k * k * (3 - 2 * k);
    LAYERS.forEach(l => { state.levels[l.id] = from[l.id] + (to[l.id] - from[l.id]) * e; });
    paintAll(); if (ctx) applyAll();
    if (k < 1) anim = requestAnimationFrame(step); else { anim = 0; renderPresets(); }
  })(t0);
}
function mixSummary(levels, surface) {
  const parts = LAYERS.map(l => [(l.id === 'rain' && SURF[surface] && surface !== 'open') ? 'Rain on ' + SURF[surface].short : l.name.replace(' noise', ''), Math.round((+levels[l.id] || 0) * 100)])
    .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return parts.length ? parts.map(x => x[0] + ' ' + x[1]).join(' · ') : 'Silent';
}
function sameMix(p) {
  const lv = cleanLevels(p.levels);
  return LAYERS.every(l => Math.abs(lv[l.id] - state.levels[l.id]) < 0.015) &&
    (lv.rain < 0.015 || (p.surface || 'open') === state.surface);
}
function presetRow(p, deletable) {
  const row = document.createElement('div'); row.className = 'pr';
  const load = document.createElement('button'); load.type = 'button'; load.className = 'load';
  const name = document.createElement('span'); name.className = 'name';
  const nm = document.createElement('span'); nm.textContent = p.name;
  name.append(nm);
  if (sameMix(p)) { const c = document.createElement('span'); c.className = 'cur'; c.textContent = 'Current'; name.append(c); load.setAttribute('aria-current', 'true'); }
  const sum = document.createElement('span'); sum.className = 'sum'; sum.textContent = mixSummary(cleanLevels(p.levels), p.surface) + (p.drift ? ' · drift' : '');
  load.append(name, sum);
  load.addEventListener('click', () => loadMix(p, false));
  row.append(load);
  if (deletable) {
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del';
    const armed = state.armed === p.id;
    del.textContent = armed ? 'Tap to confirm' : 'Delete';
    if (armed) del.classList.add('armed');
    del.setAttribute('aria-label', 'Delete ' + p.name);
    del.addEventListener('click', () => {
      if (state.armed === p.id) { state.armed = null; removePreset(p); }
      else { state.armed = p.id; renderPresets(); setTimeout(() => { if (state.armed === p.id) { state.armed = null; renderPresets(); } }, 3000); }
    });
    row.append(del);
  }
  return row;
}
function renderPresets() {
  const b = $('#builtin'); b.replaceChildren();
  BUILTIN.forEach(p => b.append(presetRow(p, false)));
  const s = $('#saved'); s.replaceChildren();
  if (!state.saved.length) {
    const e = document.createElement('p'); e.className = 'empty';
    e.textContent = 'Nothing saved yet. Set a mix you like, name it below and save it.';
    s.append(e);
  } else {
    state.saved.forEach(p => s.append(presetRow(p, true)));
  }
  $('#save-note').textContent = state.mode === 'db'
    ? 'Saved with this page, so your mixes follow you across devices.'
    : 'Saved on this device only.';
}

/* ---------- preset storage ---------- */
const LS = 'murmur.presets.v1';
function lsRead() { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function lsWrite(a) { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} }
let dbRef = null;
state.saved = lsRead();

async function savePreset(name) {
  const p = {
    name: name,
    levels: Object.fromEntries(LAYERS.map(l => [l.id, Math.round(state.levels[l.id] * 100) / 100])),
    drift: state.drift,
    surface: state.surface,
    createdAt: Date.now()
  };
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (state.mode === 'db' && dbRef) {
    try { await dbRef.collection('presets').doc(id).set(p); return true; }
    catch (e) { $('#save-note').textContent = 'Could not save this mix. Saving is not available for this view.'; return false; }
  }
  state.saved = [Object.assign({ id: id }, p)].concat(state.saved);
  lsWrite(state.saved);
  renderPresets();
  return true;
}
async function removePreset(p) {
  if (state.mode === 'db' && dbRef) {
    try { await dbRef.collection('presets').doc(p.id).delete(); } catch (e) {}
    return;
  }
  state.saved = state.saved.filter(x => x.id !== p.id);
  lsWrite(state.saved);
  renderPresets();
}
$('#save-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#save-name');
  let name = input.value.trim();
  if (!name) name = 'Mix ' + (state.saved.length + 1);
  if (await savePreset(name.slice(0, 40))) input.value = '';
});

(async function connectDb() {
  try {
    if (!window.claude || !window.claude.use) return;
    const db = await window.claude.use('db');
    if (!db) return;
    dbRef = db;
    db.collection('presets').orderBy('createdAt', 'desc').limit(200).onSnapshot(snap => {
      state.mode = 'db';
      state.saved = snap.docs.map(d => {
        const v = d.data() || {};
        return { id: d.id, name: String(v.name || 'Untitled').slice(0, 40), levels: cleanLevels(v.levels), drift: !!v.drift, surface: SURF[v.surface] ? v.surface : 'open' };
      });
      renderPresets();
    }, () => {
      state.mode = 'local';
      state.saved = lsRead();
      renderPresets();
    });
  } catch (e) { /* stay on local storage */ }
})();

/* ---------- boot ---------- */
loadMix(BUILTIN[0], true);
paintVol();
renderChips();
renderTransport();
renderPresets();
sizeCanvas();
window.addEventListener('resize', sizeCanvas);

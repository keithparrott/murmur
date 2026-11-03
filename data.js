'use strict';
/* Shared helpers, data tables and app state. Loaded first. */
const $ = (s, r) => (r || document).querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const LAYERS = [
  { id: 'rain',  name: 'Rain',        trim: 1.5, note: 'Soft patter with scattered drops.' },
  { id: 'wind',  name: 'Wind',        trim: 3.2, note: 'Gusts that rise and fall through a narrow gap.' },
  { id: 'ocean', name: 'Ocean',       trim: 2.2, note: 'Swells about ten seconds apart, with foam on the crest.' },
  { id: 'brown', name: 'Brown noise', trim: 1.2, note: 'Falls 6 dB per octave. Deep and soft.' },
  { id: 'pink',  name: 'Pink noise',  trim: 1.1, note: 'Falls 3 dB per octave. Balanced, like steady rainfall.' },
  { id: 'white', name: 'White noise', trim: 0.5, note: 'Flat across all frequencies. Bright and hissy.' }
];

LAYERS.push(
  { id: 'thunder', name: 'Thunder',     trim: 1.3, note: 'Distant rolls, one every half minute or so.' },
  { id: 'stream',  name: 'Stream',      trim: 1.6, note: 'Bright running water over stones.' },
  { id: 'fan',     name: 'Fan',         trim: 1.5, note: 'Air through blades over a low motor hum.' },
  { id: 'fire',    name: 'Fire',        trim: 1.8, note: 'A low roar with pops and snaps.' },
  { id: 'chimes',  name: 'Wind chimes', trim: 1.0, note: 'Soft metal tubes, struck in gusts.' }
);

const GROUPS = [
  { title: 'Weather',      ids: ['rain', 'thunder', 'wind'] },
  { title: 'Water',        ids: ['ocean', 'stream'] },
  { title: 'Indoors',      ids: ['fan', 'fire', 'chimes'] },
  { title: 'Noise colors', ids: ['brown', 'pink', 'white'] }
];

const SURFACES = ['open', 'tin', 'window', 'tent', 'leaves'];
const SURF = {
  open:   { label: 'Open air', short: 'open air', bed: { hp: 650,  lp: 7000,  g: 1.1, pk1: [1500, 0.8, 0], pk2: [3000, 0.8, 0] }, drop: { lp: 12000, pk: [3000, 1, 0],   g: 1 } },
  tin:    { label: 'Tin roof', short: 'tin',      bed: { hp: 900,  lp: 8500,  g: 0.7, pk1: [1300, 5, 10],  pk2: [2600, 4, 8] },   drop: { lp: 12000, pk: [1800, 5, 12],  g: 2.4 } },
  window: { label: 'Window',   short: 'glass',    bed: { hp: 350,  lp: 3200,  g: 0.7, pk1: [900, 1.5, 4],  pk2: [2400, 3, 5] },   drop: { lp: 5000,  pk: [3200, 4, 10],  g: 2 } },
  tent:   { label: 'Tent',     short: 'tent',     bed: { hp: 300,  lp: 2600,  g: 0.9, pk1: [500, 1, 3],    pk2: [1500, 1, 0] },   drop: { lp: 2600,  pk: [700, 1.5, 6],  g: 1.8 } },
  leaves: { label: 'Leaves',   short: 'leaves',   bed: { hp: 1400, lp: 10000, g: 0.9, pk1: [4500, 1, 3],   pk2: [7000, 1, 3] },  drop: { lp: 7000,  pk: [4500, 2, 6],   g: 1.2 } }
};

const BUILTIN = [
  { id: 'b-shore',  name: 'Night shore', levels: { ocean: 0.55, rain: 0.22, wind: 0.18 }, drift: true },
  { id: 'b-sleep',  name: 'Deep sleep',  levels: { brown: 0.5, rain: 0.3 }, drift: false },
  { id: 'b-focus',  name: 'Focus rain',  levels: { rain: 0.5, pink: 0.14 }, drift: false },
  { id: 'b-cabin',  name: 'Windy cabin', levels: { wind: 0.5, rain: 0.3, brown: 0.2 }, drift: true },
  { id: 'b-storm',  name: 'Storm night', levels: { rain: 0.45, thunder: 0.45, wind: 0.25 }, drift: true, surface: 'tin' },
  { id: 'b-fire',   name: 'Fireside',    levels: { fire: 0.5, rain: 0.2, brown: 0.15 }, drift: true, surface: 'window' },
  { id: 'b-creek',  name: 'Creek and chimes', levels: { stream: 0.55, wind: 0.12, chimes: 0.3 }, drift: true },
  { id: 'b-room',   name: 'Quiet room',  levels: { fan: 0.5, brown: 0.12 }, drift: false }
];

const state = {
  levels: Object.fromEntries(LAYERS.map(l => [l.id, 0])),
  vol: 0.7,
  surface: 'open',
  drift: false,
  playing: false,
  timerMin: 0,
  timerEnd: null,
  fadeLen: 90,
  saved: [],
  mode: 'local',
  armed: null
};

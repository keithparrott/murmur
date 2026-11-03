'use strict';
/* Scene art data: palettes, layout and small sprites for scene.js. World coordinates are a 320x200 frame;
   the horizon sits at y 96 and the bluff top at y 124. No drawing code lives here. */

const SCENE_ART = {
  /* Palette keys, one colour per key per time of day. Keys listed in `emissive` give off light,
     so storms do not darken them. */
  keys: ['skyTop', 'skyMid', 'skyLow', 'far', 'sea1', 'sea2', 'seaHi', 'foam',
    'rock1', 'rock2', 'rock3', 'grassFar', 'grass1', 'grass2', 'grassHi', 'dirt',
    'tree1', 'tree2', 'trunk', 'wall1', 'wall2', 'wallLine', 'roof1', 'roof2', 'trim', 'door',
    'winDark', 'glow', 'glowHot', 'smoke', 'cloud1', 'cloud2', 'rain', 'star', 'moon',
    'metal', 'glint', 'creek1', 'creek2', 'creekHi', 'fog', 'bolt', 'puddle'],
  emissive: ['glow', 'glowHot', 'star', 'moon', 'glint', 'bolt'],

  times: {
    night: {
      skyTop: '#0a0f2a', skyMid: '#141c44', skyLow: '#24305a', far: '#0c1426',
      sea1: '#1c2c50', sea2: '#0a1630', seaHi: '#3a5a88', foam: '#8ca0c0',
      rock1: '#2a2a3a', rock2: '#1c1c2a', rock3: '#3c3c50',
      grassFar: '#10241c', grass1: '#16301e', grass2: '#0e2014', grassHi: '#24442c', dirt: '#2a2420',
      tree1: '#0e2418', tree2: '#08160e', trunk: '#1c140e',
      wall1: '#3a2c24', wall2: '#2a2018', wallLine: '#1a120c', roof1: '#2c2028', roof2: '#1c141a',
      trim: '#4a4048', door: '#1a100a', winDark: '#101420', glow: '#f0a040', glowHot: '#fff0a0',
      smoke: '#50586c', cloud1: '#3a4260', cloud2: '#1c2238', rain: '#6c80a8',
      star: '#e8ecff', moon: '#f4f0d8', metal: '#8890a8', glint: '#ffffff',
      creek1: '#1a3050', creek2: '#102038', creekHi: '#6c90c0', fog: '#5a6480', bolt: '#f0f4ff', puddle: '#283c60'
    },
    dawn: {
      skyTop: '#3c4c8c', skyMid: '#c8789c', skyLow: '#f8b47c', far: '#6c5c7c',
      sea1: '#7c78a4', sea2: '#3c4478', seaHi: '#f8c49c', foam: '#f8dcd0',
      rock1: '#7c6070', rock2: '#4c3c4c', rock3: '#a88890',
      grassFar: '#4c6c4c', grass1: '#3c6c3c', grass2: '#24482c', grassHi: '#7c9c5c', dirt: '#6c4c3c',
      tree1: '#24482c', tree2: '#142c20', trunk: '#3c2820',
      wall1: '#9c6450', wall2: '#6c4434', wallLine: '#3c2420', roof1: '#6c4050', roof2: '#442834',
      trim: '#d8b0a0', door: '#3c2018', winDark: '#2c2838', glow: '#f8a848', glowHot: '#fff0b0',
      smoke: '#a89cac', cloud1: '#f8c8b0', cloud2: '#9c7c9c', rain: '#b4a8c4',
      star: '#f0e8ff', moon: '#fff4e8', metal: '#c0acb8', glint: '#ffffff',
      creek1: '#6c7cac', creek2: '#444c84', creekHi: '#f8d4c4', fog: '#d4b4c0', bolt: '#ffffff', puddle: '#8c7ca4'
    },
    day: {
      skyTop: '#3c78d8', skyMid: '#6ca0e8', skyLow: '#a8d0f4', far: '#6c8cb0',
      sea1: '#4c90cc', sea2: '#1c5c9c', seaHi: '#a8d4f4', foam: '#f4f8fc',
      rock1: '#8c7c6c', rock2: '#5c5048', rock3: '#b0a090',
      grassFar: '#5c9c4c', grass1: '#4c943c', grass2: '#2c6c28', grassHi: '#8cc85c', dirt: '#8c6c48',
      tree1: '#2c6c34', tree2: '#18442c', trunk: '#5c3c20',
      wall1: '#a0704c', wall2: '#7c5034', wallLine: '#4c3020', roof1: '#6c4c4c', roof2: '#4c3034',
      trim: '#e0d0b0', door: '#4c2c18', winDark: '#2c3444', glow: '#f8b048', glowHot: '#fff4c0',
      smoke: '#c0c4cc', cloud1: '#fcfcfc', cloud2: '#c4cce0', rain: '#c8d4e8',
      star: '#ffffff', moon: '#ffffff', metal: '#c8ccd8', glint: '#ffffff',
      creek1: '#4c94d4', creek2: '#2c6cac', creekHi: '#e0f4ff', fog: '#dce4ec', bolt: '#ffffff', puddle: '#78a8d8'
    },
    dusk: {
      skyTop: '#1c2058', skyMid: '#6c3c78', skyLow: '#e8744c', far: '#3c2c4c',
      sea1: '#5c4878', sea2: '#241c48', seaHi: '#f8a060', foam: '#e8c0b0',
      rock1: '#5c4050', rock2: '#342434', rock3: '#84606c',
      grassFar: '#2c3c34', grass1: '#2c4c2c', grass2: '#18301c', grassHi: '#5c6c3c', dirt: '#4c3428',
      tree1: '#183424', tree2: '#0c1c14', trunk: '#2c1c14',
      wall1: '#7c4c3c', wall2: '#54302c', wallLine: '#2c1814', roof1: '#4c2c3c', roof2: '#301c28',
      trim: '#b08880', door: '#2c140c', winDark: '#1c1828', glow: '#f8a040', glowHot: '#fff0a0',
      smoke: '#7c6c84', cloud1: '#e8906c', cloud2: '#6c3c5c', rain: '#9c8cac',
      star: '#f0e8ff', moon: '#fff0dc', metal: '#a08898', glint: '#ffffff',
      creek1: '#4c4c7c', creek2: '#2c2c5c', creekHi: '#f8b48c', fog: '#9c7c8c', bolt: '#ffffff', puddle: '#6c5084'
    }
  },

  /* Hour -> palette. Between two stops the palettes blend linearly. */
  clock: [[0, 'night'], [5, 'night'], [6.3, 'dawn'], [7.8, 'day'], [17.5, 'day'], [19, 'dusk'], [20.5, 'night'], [24, 'night']],

  /* Storm colours, blended in as rain and thunder build. Scaled down at night. */
  storm: {
    skyTop: '#1c2028', skyMid: '#2c3038', skyLow: '#4c5058', far: '#2c3038',
    cloud1: '#5c606c', cloud2: '#2c3038', sea1: '#3c4c58', sea2: '#1c2830', seaHi: '#6c7c88', puddle: '#3c4854'
  },

  /* Pines: base x and y in world coordinates, height in pixels. Kept clear of the cabin (x 182 to 266). */
  trees: [
    { x: 158, y: 121, h: 26 }, { x: 170, y: 120, h: 34 },
    { x: 284, y: 117, h: 40 }, { x: 298, y: 116, h: 50 }, { x: 312, y: 115, h: 38 },
    { x: 326, y: 114, h: 46 }, { x: 342, y: 113, h: 36 }, { x: 358, y: 112, h: 44 }, { x: 376, y: 112, h: 32 },
    { x: 316, y: 182, h: 74 }, { x: 352, y: 176, h: 62 }, { x: 394, y: 186, h: 70 }
  ],

  /* Cabin anchor points used by the renderer. */
  cabin: { chimney: [249, 85], fan: [211, 108], window: [238, 121, 11, 9], door: [207, 126, 8, 14] },

  /* Wind chimes hang from the porch roof edge. */
  chimes: { bar: [185, 192, 123], tubes: [[186, 6], [188, 8], [190, 5], [192, 7]] },

  /* The creek runs from the back hills, past the cabin and over the cliff edge as a waterfall. */
  creek: [[318, 116], [300, 124], [282, 133], [262, 145], [238, 153], [212, 158], [186, 162], [166, 166], [146, 169]],
  bridge: [199, 156, 18, 7],

  puddles: [{ x: 178, y: 147, w: 10 }, { x: 272, y: 158, w: 8 }, { x: 236, y: 178, w: 13 }],

  clouds: [
    { x: 0.05, y: 18, w: 46, s: 1.0 }, { x: 0.30, y: 34, w: 30, s: 0.8 }, { x: 0.55, y: 14, w: 56, s: 1.1 },
    { x: 0.80, y: 42, w: 26, s: 0.7 }, { x: 0.18, y: 56, w: 34, s: 0.6 }, { x: 0.68, y: 26, w: 40, s: 0.9 },
    { x: 0.42, y: 62, w: 24, s: 0.5 }, { x: 0.92, y: 10, w: 50, s: 1.2 }, { x: 0.10, y: 40, w: 38, s: 0.75 },
    { x: 0.62, y: 50, w: 44, s: 0.65 }, { x: 0.35, y: 8, w: 52, s: 1.15 }, { x: 0.85, y: 64, w: 30, s: 0.55 },
    { x: 0.25, y: 24, w: 48, s: 0.95 }, { x: 0.75, y: 4, w: 58, s: 1.25 }
  ],

  /* Sprites: one string per row, '.' is transparent, letters map through `key` to palette keys. */
  sprites: {
    boulder: {
      key: { a: 'rock3', b: 'rock1', c: 'rock2' },
      rows: ['..aab...', '.aabbbc.', 'abbbbbcc', 'bbbbbccc', '.cccccc.']
    },
    stone: {
      key: { a: 'rock3', b: 'rock1', c: 'rock2' },
      rows: ['.ab.', 'abbc', '.cc.']
    },
    bush: {
      key: { a: 'grassHi', b: 'grass1', c: 'grass2' },
      rows: ['...aa.a...', '.aabbabb..', 'abbbbbbbc.', 'bbbbbbbccc', '.cbccccc..']
    }
  },
  props: [
    { s: 'boulder', x: 152, y: 128 }, { s: 'stone', x: 176, y: 160 }, { s: 'bush', x: 266, y: 132 },
    { s: 'boulder', x: 280, y: 168 }, { s: 'bush', x: 160, y: 182 }, { s: 'stone', x: 250, y: 150 },
    { s: 'bush', x: 186, y: 140 }
  ]
};
